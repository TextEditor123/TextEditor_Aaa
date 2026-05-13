
// I don't want to touch the originally scaffolded "if (require('electron-squirrel-startup'))" at the moment.
// thus this file is staying common js.

const { app, BrowserWindow, dialog, ipcMain, clipboard } = require('electron');
const path = require('node:path');
const fs = require('fs');
const AppDatabase = require('./Database/database').default;
const { spawn } = require('node:child_process');
const { URI } = require('vscode-uri');
const os = require('os');

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'my-app-Debug'));
}

let database;

/** openedDirectory | openedWorkspace; TODO: consider making single object with bool 'isWorkspace' */
let openedDirectory = null;
/** openedDirectory | openedWorkspace; TODO: consider making single object with bool 'isWorkspace'  */
let openedWorkspace = null;
let workspaceDirectories = null;

/** Relates to LSP, simple and naive implementation for "open text document" this tracks most recent */
let openedDocumentUri = null;
/**
 * @type {ChildProcessWithoutNullStreams}
 */
let languageServer;
let languageServerHandshakeSuccess = false;

/** You probably ought to do something more optimal than holding each chunk in memory until you get the entirety. */
let stdoutChunkObjects = [];
/** The first entry is partially unread so you at minimum will need to store the index that starts the unread content or some such index */
let stdoutChunkFirstEntryMetadata = { substringIndexStart: 0, contentLengthNumber: 0 };

let messageId = 0;
let remainingStdoutFromPartiallyReadEvent = null;

// I probably need something like this eventually:
//let pendingRequests = [];

let mostRecentRequest = null;

/**
 * TODO: Is it problematic to bring mainWindow into this scope? It is created within `const createWindow`...
 * ...and until now has only been accessible from that arrow function.
 * ...
 * The change is desirable because upon a stdout event from an lsp,
 * the BrowserWindow needs to be accessible in order to send a message
 * from the main-process to the renderer-process in this scenario.
 * ...
 * I specifically put the assignment that brings a reference to mainWindow into this scope
 * as the final line within `const createWindow`.
 * ...
 * It is expected that if an issue were possible, that electron's "initialization code"
 * can run in its entirety prior to this reference being exposed in the global scope.
 * 
 * @type {BrowserWindow}
 */
let mainWindowCapture = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

/**
 * @param {*} absolutePath 
 * @returns {boolean} to indicate whether the invoker is permitted to continue execution with the given absolutePath
 */
function isValidAbsolutePath(absolutePath) {
    // The provided absolute file path is validated.
    // If the absolute file path is NOT recognized, then an empty enumeration is returned.
    if (absolutePath !== openedDirectory & !database.contains(absolutePath)) return false;

    return true;
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true, // this might already be the default value
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.isMenuBarVisible(false);

  // Handle the request from the renderer process
  ipcMain.handle('choose-directory', async (event) => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (result.canceled) {
        return { basename: '', openedDirectory: '', canceled: result.canceled };
      }

      openedDirectory = result.filePaths[0];
	  openedWorkspace = null;
	  workspaceDirectories = null;

	  let filename = path.basename(openedDirectory);
	  let id = database.addAbsolutePath(openedDirectory, filename);

	  if (!languageServer) {
		MAIN_initializeLanguageServer();
	  }

      return { basename: filename, openedDirectory: openedDirectory, id: id, canceled: result.canceled };
  });
  
  ipcMain.handle('choose-workspace', async (event) => {
      const result = await dialog.showOpenDialog({ properties: ['openFile'] });
      if (result.canceled) {
        return {
			workspaceFileAbsolutePath: null,
			workspaceFileNameWithoutExtension: null,
			directories: [],
			canceled: result.canceled };
      }

	  openedDirectory = null;
	  openedWorkspace = result.filePaths[0];
	  workspaceDirectories = null;

	  let filename = path.basename(openedWorkspace);
	  let id = database.addAbsolutePath(openedWorkspace, filename);

	  let fileContent = fs.readFileSync(openedWorkspace, 'utf8');
	  let jsonObject = JSON.parse(fileContent);

	  if (!jsonObject.folders) {
		  throw new Error('if (!jsonObject.folders)');
	  }

	  let parentDirectoryAbsolutePath = path.dirname(openedWorkspace);

	  let directories = [];
	  
	  for (let i = 0; i < jsonObject.folders.length; i++) {
		  let folderEntry = jsonObject.folders[i];
		  let absolutePath = path.join(parentDirectoryAbsolutePath, folderEntry.path);
		  let filename = path.basename(absolutePath);
		  let id = database.addAbsolutePath(absolutePath, filename);
		  directories.push({
				basename: filename,
				absolutePath: absolutePath,
				id: id,
		  });
	  }

	  workspaceDirectories = directories;

	  if (!languageServer) {
		MAIN_initializeLanguageServer();
	  }

      return {
		workspaceFileAbsolutePath: openedWorkspace,
		workspaceFileNameWithoutExtension: path.parse(openedWorkspace).name,
		directories: directories,
		canceled: result.canceled
	  };
  });

  ipcMain.handle('did-change-text-document-notification', async (event, absolutePath, version, startLine, startCharacter, endLine, endCharacter, text) => {
	  // renderer now gives the formatted path
	  //absolutePath = formatAbsolutePath(absolutePath);
	
      if (openedDocumentUri !== absolutePath) return;

      try {
		  if (languageServerHandshakeSuccess && languageServer) {
			  let versionedTextDocumentIdentifier = MAIN_message_construct_versionedTextDocumentIdentifier(absolutePath, version);
			  let startPosition = MAIN_message_construct_position(startLine, startCharacter);
			  let endPosition = MAIN_message_construct_position(endLine, endCharacter);
			  let range = MAIN_message_construct_range(startPosition, endPosition);
			  let change = MAIN_message_construct_textDocumentContentChangeEvent(range, text);
			  let params = MAIN_message_construct_didChangeTextDocumentNotification_Params(versionedTextDocumentIdentifier, [change]);
			  let messageObject = MAIN_message_construct_didChangeTextDocumentNotification(params);
			  let messageJson = MAIN_encodeMessageObject(messageObject);
			  //console.log(messageJson);
		  	  languageServer.stdin.write(messageJson);
		  }
      }
      catch (err) {
          console.error("Error did-change-text-document-notification:", err);
          return [];
      }
  });

  ipcMain.handle('get-filesystem-entries', async (event, argument, argumentIsId) => {

      let parentAbsolutePath;

	  if (argumentIsId) {
		  let entry = database.getBy_id(argument);
		  if (!entry) return;

		  parentAbsolutePath = entry.value;
	  }
	  else {
		  parentAbsolutePath = argument;
		  if (!isValidAbsolutePath(parentAbsolutePath)) return;
	  }

      try {
		  return wrap_readdirSync_getChildList(parentAbsolutePath);
      }
      catch (err) {
          console.error("Error reading directory:", err);
          return [];
      }
  });
  
  ipcMain.handle('get-filesystem-entry-by-id', async (event, id) => {
      try {

		  let entry = database.getBy_id(id);
		  if (!entry) {
			  return null;
		  }
		  else {
			  return {
				  basename: entry.displayName,
				  absolutePath: entry.value,
				  isDirectory: fs.statSync(entry.value)?.isDirectory() ?? false
			  };
		  }
      }
      catch (err) {
          console.error("Error during get-filesystem-entry-by-id:", err);
          return [];
      }
  });
  
  ipcMain.handle('read-all-text', async (event, absolutePath) => {
      if(!isValidAbsolutePath(absolutePath)) return;

      try {
          return fs.readFileSync(absolutePath, 'utf8');
      }
      catch (err) {
          //console.error("Error reading file:", err);
          return null;
      }
  });
  
  ipcMain.handle('editor-read-all-text', async (event, absolutePath) => {
      if(!isValidAbsolutePath(absolutePath)) return;

      try {
		  let basename = path.basename(absolutePath);
		  let extension = path.extname(absolutePath);

		  let itHasBom = hasBOM(absolutePath);

		  absolutePath = formatAbsolutePath(absolutePath);
		  itHasBom.formattedAbsolutePath = absolutePath;
		  itHasBom.extension = extension;

		  let pathId = database.addAbsolutePath(itHasBom.formattedAbsolutePath, basename);

		  if (openedDocumentUri) {
			let tdIdentifier = MAIN_message_construct_textDocumentIdentifier(absolutePath);
			if (languageServerHandshakeSuccess && languageServer) {
				languageServer.stdin.write(
					MAIN_encodeMessageObject(MAIN_message_construct_didCloseTextDocumentNotification(tdIdentifier)));
			}
			openedDocumentUri = null; // Should be set null regardless of language server existence to ensure it gets cleared if language server was running then stopped
		  }

		  let tdi = MAIN_message_construct_textDocumentItem(
			absolutePath,   // uri
			'javascript',   // languageId
			0,              // version
			itHasBom.text); // text
		  let messageObject = MAIN_message_construct_didOpenTextDocumentNotification(tdi);
		  let messageJson = MAIN_encodeMessageObject(messageObject);
		  if (languageServerHandshakeSuccess && languageServer) {
			  languageServer.stdin.write(messageJson);
			  openedDocumentUri = absolutePath;
		  }
          return itHasBom;
      }
      catch (err) {
          return null;
      }
  });
  
  ipcMain.handle('editor-document-symbols-request', async (event) => {
      try {
		  if (!languageServerHandshakeSuccess || !languageServer || !openedDocumentUri) return;

		  let tdIdentifier = MAIN_message_construct_textDocumentIdentifier(openedDocumentUri);
		  let documentSymbolsRequest = MAIN_message_construct_DocumentSymbolsRequest(tdIdentifier);
		  mostRecentRequest = documentSymbolsRequest;
		  languageServer.stdin.write(MAIN_encodeMessageObject(documentSymbolsRequest));
      }
      catch (err) {
          console.error("Error during editor-document-symbols-request:", err);
          return [];
      }
  });
  
  ipcMain.handle('set-clipboard', async (event, text) => {
      try {
          clipboard.writeText(text);
      }
      catch (err) {
          console.error("Error setting clipboard:", err);
          return [];
      }
  });
  
  ipcMain.handle('editor-set-clipboard', async (event, uint8Array, offset, length, EDITOR_lineEndString) => {
      try {
		  if (!EDITOR_lineEndString)
              EDITOR_lineEndString = '\n';

		  clipboard.writeText(MAIN_decode_experimental_textonly(uint8Array, offset, length, EDITOR_lineEndString));
      }
      catch (err) {
          console.error("Error setting clipboard:", err);
          return [];
      }
  });
  
  ipcMain.handle('read-clipboard', async (event) => {
      try {
          return clipboard.readText();
      }
      catch (err) {
          console.error("Error reading clipboard:", err);
          return [];
      }
  });

  ipcMain.handle('find-all', async (event, search, matchWord) => {
      try {

          if (!openedDirectory) return;

          let results = [];

          async function searchRecursive(absolutePath) {

              // TODO: need to enumerate the children rather than getting an array allocated.
              // TODO: node_modules isn't hidden, so how would I know what folders to exclude, if this even is possible from the code's perspective (or is it more-so the user's responsibility)
              
              let childList = fs.readdirSync(absolutePath, { withFileTypes: true });
              for (var i = 0; i < childList.length; i++) {
                  if (childList[i].isDirectory()) {
                    if (childList[i].name === 'node_modules') {
                        console.log('do not recurse into node_modules');
                    }
                    else if (childList[i].name === '.git') {
                        console.log('do not recurse into .git');
                    }
                    else if (childList[i].name === '.vscode') {
                        console.log('do not recurse into .vscode');
                    }
                    else if (childList[i].name === 'out') {
                        console.log('do not recurse into out');
                    }
                    else {
                        // TODO: Presumably there is an API that would provide this more optimally
                        let absolutePathOfChild = path.join(childList[i].parentPath, childList[i].name);
                        await searchRecursive(absolutePathOfChild);
                    }
                  }
                  else {
                    // TODO: Presumably there is an API that would provide this more optimally
                    let absolutePathOfChild = path.join(childList[i].parentPath, childList[i].name);

                    const readableStream = fs.createReadStream(absolutePathOfChild, { encoding: 'utf8' });

                    // TODO: Is it possible to allocate a Promise 'one time' and re-use it?...
                    // ...this is being done within a loop over all text files and recursively descends from the "workspace directory".
                    let promise = new Promise((resolve, reject) => {
                        let count = 0;
                        let offset = 0;
                        // TODO: Come up with a case that verifies this code works...
                        let previousChunkNeedsWordVerification = false;

                        readableStream.on('data', (chunk) => {
                        	if (matchWord && ((search[0] >= 'a' && search[0] <= 'z') || (search[0] >= 'A' && search[0] <= 'Z') || (search[0] >= '0' && search[0] <= '9') || (search[0] === '_'))) { // if is letter or digit ('a' to 'z') || ('A' to 'Z') || ('0' to '9') || ('_') all bounds inclusive)
                        		if (previousChunkNeedsWordVerification) {
                        			previousChunkNeedsWordVerification = false;
                        			if (chunk.length > 0 && ((chunk[0] >= 'a' && chunk[0] <= 'z') || (chunk[0] >= 'A' && chunk[0] <= 'Z') || (chunk[0] >= '0' && chunk[0] <= '9') || (chunk[0] === '_'))) {
                        				count--;
                        			}
                        		}
								for (let i = 0; i < chunk.length; i++) {
									if ((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_')) {
										if (chunk[i] === search[0]) {
						    				while (i < chunk.length) { // context switch to checking match
						    					if (chunk[i] === search[offset]) {
										            if (offset === 0) {
										                posStartOfMatch = i;
										            }
										            offset++;
										            if (offset === search.length) { // found "possible match"
										            	if (i + 1 >= chunk.length ||
										            		!((chunk[i + 1] >= 'a' && chunk[i + 1] <= 'z') || (chunk[i + 1] >= 'A' && chunk[i + 1] <= 'Z') || (chunk[i + 1] >= '0' && chunk[i + 1] <= '9') || (chunk[i + 1] === '_'))) { // ends on a word, therefore take match
																if (i + 1 >= chunk.length) {
																	previousChunkNeedsWordVerification = true;
																}
											            		count++;
										                		offset = 0;
										                		break;
										            	}
										            	else { // does NOT end on a word, therefore ignore match
										            		offset = 0;
										            		while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
										            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
										            				i--; // backtrack by one due to outer for loop's incrementation step
										            				break;
										            			}
									            				i++;
										            		}
										                	break;
										            	}
										            }
										            i++;
										        }
										        else {
										            offset = 0;
										            while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
								            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
								            				i--; // backtrack by one due to outer for loop's incrementation step
								            				break;
								            			}
							            				i++;
								            		}
										            break;
										        }
											}
										}
										else {
											while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
						            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
						            				i--; // backtrack by one due to outer for loop's incrementation step
						            				break;
						            			}
						        				i++;
						            		}
										}
									}
									else {
										while (i < chunk.length) { // move pos to next letterOrDigit or EOF
						        			if ((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_')) {
						        				i--; // backtrack by one due to outer for loop's incrementation step
						        				break;
						        			}
						    				i++;
						        		}
									}
							    }
						    }
						    else {
						    	for (let i = 0; i < chunk.length; i++) {
							        if (chunk[i] === search[offset]) {
							            offset++;
							            if (offset === search.length) {
							            	count++;
							                offset = 0;
							            }
							        }
							        else {
							            offset = 0;
							        }
							    }
						    }
                        });
                        readableStream.on('end', () => {
                            resolve(count);
                        });
                        readableStream.on('error', (error) => {
                            reject(error);
                        });
                    });
                    let count = await promise;

                    if (count > 0) {
                        database.addAbsolutePath(absolutePathOfChild, childList[i].name);
                        results.push({
                            filename: childList[i].name,
                            absolutePath: absolutePathOfChild,
                            count: count
                        });
                    }
                  }
              }
          }

          await searchRecursive(openedDirectory);
          return results;
      }
      catch (err) {
          console.error("Error during find-all:", err);
          return [];
      }
  });

  ipcMain.handle('find-all-getPositions', async (event, absolutePath, search, matchWord) => {

      if(!isValidAbsolutePath(absolutePath)) return;

      try {
          let results = [];

          const readableStream = fs.createReadStream(absolutePath, { encoding: 'utf8' });
                    
          let aaa = new Promise((resolve, reject) => {
              let offset = 0;
              let posStartOfMatch = 0;
              // TODO: Come up with a case that verifies this code works...
              let previousChunkNeedsWordVerification = false;
  
              readableStream.on('data', (chunk) => {
              	if (matchWord && ((search[0] >= 'a' && search[0] <= 'z') || (search[0] >= 'A' && search[0] <= 'Z') || (search[0] >= '0' && search[0] <= '9') || (search[0] === '_'))) { // if is letter or digit ('a' to 'z') || ('A' to 'Z') || ('0' to '9') || ('_') all bounds inclusive)
					if (previousChunkNeedsWordVerification) {
            			previousChunkNeedsWordVerification = false;
            			if (chunk.length > 0 && ((chunk[0] >= 'a' && chunk[0] <= 'z') || (chunk[0] >= 'A' && chunk[0] <= 'Z') || (chunk[0] >= '0' && chunk[0] <= '9') || (chunk[0] === '_'))) {
            				results.length--;
            			}
            		}
					for (let i = 0; i < chunk.length; i++) {
						if ((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_')) {
							if (chunk[i] === search[0]) {
			    				while (i < chunk.length) { // context switch to checking match
			    					if (chunk[i] === search[offset]) {
							            if (offset === 0) {
							                posStartOfMatch = i;
							            }
							            offset++;
							            if (offset === search.length) { // found "possible match"
							            	if (i + 1 >= chunk.length ||
							            		!((chunk[i + 1] >= 'a' && chunk[i + 1] <= 'z') || (chunk[i + 1] >= 'A' && chunk[i + 1] <= 'Z') || (chunk[i + 1] >= '0' && chunk[i + 1] <= '9') || (chunk[i + 1] === '_'))) { // ends on a word, therefore take match
													if (i + 1 >= chunk.length) {
														previousChunkNeedsWordVerification = true;
													}
								            		results.push(posStartOfMatch);
							                		offset = 0;
							                		break;
							            	}
							            	else { // does NOT end on a word, therefore ignore match
							            		offset = 0;
							            		while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
							            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
							            				i--; // backtrack by one due to outer for loop's incrementation step
							            				break;
							            			}
						            				i++;
							            		}
							                	break;
							            	}
							            }
							            i++;
							        }
							        else {
							            offset = 0;
							            while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
					            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
					            				i--; // backtrack by one due to outer for loop's incrementation step
					            				break;
					            			}
				            				i++;
					            		}
							            break;
							        }
								}
							}
							else {
								while (i < chunk.length) { // move pos to next NON(letterOrDigit) or EOF
			            			if (!((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_'))) {
			            				i--; // backtrack by one due to outer for loop's incrementation step
			            				break;
			            			}
			        				i++;
			            		}
							}
						}
						else {
							while (i < chunk.length) { // move pos to next letterOrDigit or EOF
			        			if ((chunk[i] >= 'a' && chunk[i] <= 'z') || (chunk[i] >= 'A' && chunk[i] <= 'Z') || (chunk[i] >= '0' && chunk[i] <= '9') || (chunk[i] === '_')) {
			        				i--; // backtrack by one due to outer for loop's incrementation step
			        				break;
			        			}
			    				i++;
			        		}
						}
				    }
			    }
			    else {
			    	for (let i = 0; i < chunk.length; i++) {
				        if (chunk[i] === search[offset]) {
				            if (offset === 0) {
				                posStartOfMatch = i;
				            }
				            offset++;
				            if (offset === search.length) {
				            	results.push(posStartOfMatch);
				                offset = 0;
				            }
				        }
				        else {
				            offset = 0;
				        }
				    }
			    }
              });
              readableStream.on('end', () => {
                  resolve(results);
              });
              readableStream.on('error', (error) => {
                  reject(error);
              });
          });
          return await aaa;
      }
      catch (err) {
          console.error("Error during find-all-getPositions:", err);
          return [];
      }
  });
  
  /** 
   * Returns an object with property 'success' equal to 'true' if success, otherwise the property is equal to 'false'...
   * ...and other properties as well.
   */
  ipcMain.handle('new-file', async (event, parentDirectoryAbsolutePath, filename, isDirectory) => {
      if (!isValidAbsolutePath(parentDirectoryAbsolutePath)) return;

	  /*
	  I'm duplicating the code for mkdirSync and writeFile because
	  I only want to add the path to the database if the operating system operation was successful.
	  I don't like the idea of creating some if statement that occurs after either conditional branch
	  in order to put this logic in one place, I'd rather duplicate it.

	  As well, neither the renderer process or the main process are storing the absolutepaths.
	  So I need to re-interact with the OS file-system to determine what index the new UI will go in.

	  Having the main process determine which index changed, and telling the renderer how to update its state accordingly,
	  while feeling somewhat wasteful, is still much less expensive than if you were to have the main process
	  re-collect all of the children of some directory and send that down to the UI and delete the current children
	  from the flat-list and add in this updated list wherein most are equal to what previously was in the flat list that you just deleted.
	  */

      try {
          let pathToNewFile = path.join(parentDirectoryAbsolutePath, filename);
          if (isDirectory) {
            fs.mkdirSync(pathToNewFile);
			let pathId = database.addAbsolutePath(pathToNewFile, filename);
			let indexOf = wrap_readdirSync_indexOf(parentDirectoryAbsolutePath, filename, /*childIsDirectory*/ true);
			return {
				success: true,
				pathId: pathId,
				indexOf: indexOf,
			};
          }
          else {
            fs.writeFile(pathToNewFile, 'overwritten?', { flag: 'wx' }, () => {});
			let pathId = database.addAbsolutePath(pathToNewFile, filename);
			let indexOf = wrap_readdirSync_indexOf(parentDirectoryAbsolutePath, filename, /*childIsDirectory*/ false);
			return {
				success: true,
				pathId: pathId,
				indexOf: indexOf,
			};
          }
      }
      catch (err) {
          console.error("Error making new file:", err);
          return {
				success: false,
			};
      }
  });
  
  /**
   * Returns 'true' if success, otherwise 'false'
   * 
   * TODO: delete should remove a row from the DB of absolute paths?
   */
  ipcMain.handle('delete-file', async (event, absolutePath, isDirectory) => {
      if (!isValidAbsolutePath(absolutePath)) return false;

      try {
          if (isDirectory) {
            fs.rmSync(absolutePath, { recursive: true });
			return true;
          }
          else {
            fs.unlinkSync(absolutePath);
			return true;
          }
      }
      catch (err) {
          console.error("Error deleting file:", err);
          return false;
      }
  });
  
  /**
   * Returns an object with property named 'success' equal to 'true' if successful, otherwise the property is equal to'false'...
   * ...as well contains a property named 'pathId' for the "absolute path id" of the row in the database that represents the absolute path...
   * ...as well contains a property named 'absolutePath' for the resulting absolute path string.
   * 
   * TODO: rename should remove the previous named path (provided that a change actually occurred)?
   * */
  ipcMain.handle('rename-file', async (event, absolutePath, filename, isDirectory) => {
      if (!isValidAbsolutePath(absolutePath)) return;

      try {
          if (isDirectory) {
            let directory = path.dirname(absolutePath);
            let pathToNewFile = path.join(directory, filename);
            if (fs.existsSync(pathToNewFile)) {
              throw new Error("The desination path '" + pathToNewFile + "' already exists.");
            }
            fs.renameSync(absolutePath, pathToNewFile);
			let pathId = database.addAbsolutePath(pathToNewFile, filename);
			return {
				success: true,
				pathId: pathId,
				absolutePath: pathToNewFile
			};
          }
          else {
            let directory = path.dirname(absolutePath);
            let pathToNewFile = path.join(directory, filename);
            if (fs.existsSync(pathToNewFile)) {
              throw new Error("The desination path '" + pathToNewFile + "' already exists.");
            }
            fs.renameSync(absolutePath, pathToNewFile);
			let pathId = database.addAbsolutePath(pathToNewFile, filename);
			return {
				success: true,
				pathId: pathId,
				absolutePath: pathToNewFile
			};
          }
      }
      catch (err) {
          console.error("Error renaming file:", err);
          return {
		  	  success: false,
		  	  pathId: pathId
		  };
      }
  });

  ipcMain.handle('save-file', async (event, absolutePath, text) => {
      if (!isValidAbsolutePath(absolutePath)) return;

      try {
          // TODO: verify that 'fs.writeFile' won't already throw an exception if file is directory (i.e.: verify that this check is necessary).
          const stats = fs.statSync(absolutePath);
          if (stats.isDirectory()) {
            throw new Error('The destination path is a directory');
          }

          fs.writeFile(absolutePath, text, () => {});
      }
      catch (err) {
          console.error("Error saving file:", err);
          return [];
      }
  });
  
  ipcMain.handle('editor-save-file', async (event, absolutePath, uint8Array, count, EDITOR_lineEndString, EDITOR_fileStartsWithBom) => {
      if (!isValidAbsolutePath(absolutePath)) return;

      try {
          const stats = fs.statSync(absolutePath);
          if (stats.isDirectory()) {
            throw new Error('The destination path is a directory');
          }

		  if (!EDITOR_lineEndString)
              EDITOR_lineEndString = '\n';

		  fs.writeFile(absolutePath, MAIN_decode_experimental_textonly(uint8Array, /*start*/ 0, count, EDITOR_lineEndString, EDITOR_fileStartsWithBom), () => {});
      }
      catch (err) {
          console.error("Error saving file:", err);
          return [];
      }
  });
  
  /** 
   * Returns an object with property 'success' equal to 'true' if success, otherwise the property is equal to 'false'...
   * ...and other properties as well.
   */
  ipcMain.handle('copy-clipboard-absolute-path-to-directory', async (event, directory, menuOptionCut_id) => {
      if (!isValidAbsolutePath(directory)) return;

      try {
          let sourceFile = clipboard.readText();
          if (!sourceFile.startsWith('file:///')) {
            throw new Error("The clipboard's text does not start with 'file:///'.");
          }
          let sourceWasMenuOptionCut = sourceFile === menuOptionCut_id;
          sourceFile = sourceFile.substring('file:///'.length);
          if (!fs.existsSync(sourceFile)) {
            throw new Error("The clipboard does not contain a path to a file.");
          }
          if (!isValidAbsolutePath(sourceFile)) return;
          const stats = fs.statSync(sourceFile);
          let filename = path.basename(sourceFile);
          let destinationFile = path.join(directory, filename);
          if (stats.isDirectory()) {
            fs.cpSync(sourceFile, destinationFile, { force: false, errorOnExist: true, recursive: true });
			let pathId = database.addAbsolutePath(destinationFile, filename);
			let sourceFileWasDeleted = false;
			if (sourceWasMenuOptionCut & fs.existsSync(destinationFile)) {
				fs.rmSync(sourceFile, { recursive: true });
				sourceFileWasDeleted = true;
			}
			let indexOf = wrap_readdirSync_indexOf(directory, filename, /*childIsDirectory*/ true);
			return {
				success: true,
				pathId: pathId,
				indexOf: indexOf,
				isDirectory: true,
				sourceFileWasDeleted: sourceFileWasDeleted,
			};
          }
          else {
            fs.copyFileSync(sourceFile, destinationFile, fs.constants.COPYFILE_EXCL);
			let pathId = database.addAbsolutePath(destinationFile, filename);
			let sourceFileWasDeleted = false;
			if (sourceWasMenuOptionCut & fs.existsSync(destinationFile)) {
				fs.unlinkSync(sourceFile);
				sourceFileWasDeleted = true;
			}
			let indexOf = wrap_readdirSync_indexOf(directory, filename, /*childIsDirectory*/ false);
			return {
				success: true,
				pathId: pathId,
				indexOf: indexOf,
				isDirectory: false,
				sourceFileWasDeleted: sourceFileWasDeleted,
			};
          }
      }
      catch (err) {
          console.error("Error copying file:", err);
          return {
		  	  success: false
		  };
      }
  });

  mainWindowCapture = mainWindow;
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    database = new AppDatabase();
    createWindow();
  
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (languageServer) {
	  languageServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * TODO: Store the path more optimally to avoid doing this each time?
 * TODO: capital 'c' or lowercase, encoded ':' and etc... or not?
 */
function formatAbsolutePath(absolutePath) {
	return 'file:///' + absolutePath.replaceAll('\\', '/');
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

/**
 * @param {string} method 
 * @returns 
 */
function MAIN_constructMessageObject(method, params) {
	return {
		"method": method,
		"id": messageId++,
		"params": params
	};
}

/** 
 * @param {string} uri @param {string} languageId @param {number} version @param {string} text @returns
 */
function MAIN_message_construct_textDocumentItem(uri, languageId, version, text) {
	/*interface TextDocumentItem {...}*/
	return {
		uri: uri,
		languageId: languageId,
		version: version,
		text: text,
	};
}

function MAIN_message_construct_textDocumentIdentifier(documentUri) {
	/*interface TextDocumentIdentifier {...}*/
	return {
		uri: documentUri
	};
}

/**
 * @param {*} textDocumentIdentifier MAIN_message_construct_textDocumentIdentifier(...)
 */
function MAIN_message_construct_didCloseTextDocumentNotification(textDocumentIdentifier) {
	return {
		method: 'textDocument/didClose',
		params: { textDocument: textDocumentIdentifier },
	}
}

function MAIN_message_construct_didChangeTextDocumentNotification_Params(versionedTextDocumentIdentifier, textDocumentContentChangeEventArray) {
	/*interface DidCloseTextDocumentParams {...}*/
	return {
		textDocument: versionedTextDocumentIdentifier,
		contentChanges: textDocumentContentChangeEventArray,
	}
}

function MAIN_message_construct_didChangeTextDocumentNotification(didChangeTextDocumentParams) {
	// TODO: Consider: TextDocumentChangeRegistrationOptions
	// -----------------------------------------------
	return {
		method: 'textDocument/didChange',
		params: didChangeTextDocumentParams,
	}
}

/**
 * 
 * @param {*} textDocumentItem MAIN_message_construct_textDocumentItem(...)
 */
function MAIN_message_construct_didOpenTextDocumentNotification(textDocumentItem) {
	/* RELATED: interface DidOpenTextDocumentParams {...} */
	return {
		method: 'textDocument/didOpen',
		params: { textDocument: textDocumentItem },
	};
}

function MAIN_message_construct_DocumentSymbolsRequest(textDocumentIdentifier) {
	return {
		id: messageId++,
		method: 'textDocument/documentSymbol',
		params: { textDocument: textDocumentIdentifier },
	};
}

function MAIN_message_construct_versionedTextDocumentIdentifier(uri, version)  {
	/*interface VersionedTextDocumentIdentifier {...}*/
	return {
		uri: uri,
		version: version,
	};
}

function MAIN_message_construct_position(line, character)  {
	/*interface Position {...}*/
	return {
		line: line,
		character: character,
	};
}

function MAIN_message_construct_range(startPosition, endPosition)  {
	/*interface Range {...}*/
	return {
		start: startPosition,
		end: endPosition,
	}
}

function MAIN_message_construct_textDocumentContentChangeEvent(range, text)  {
	/*export type TextDocumentContentChangeEvent = {...} | { text: string; };*/
	if (range) {
		return {
			range: range,
			text: text
		}
	}
	else {
		return {
			text: text
		};
	}
}

/**
 * TODO: This was fully commented out and I'm tired of scrolling past it so I'm moving it to the bottom
 */
function MAIN_message_construct_clientCapabilities(rootPath) {

	/*interface ClientCapabilities {
		workspace?: { // * Workspace specific client capabilities.
			applyEdit?: boolean; // * The client supports applying batch edits * to the workspace by supporting the request * 'workspace/applyEdit'
			workspaceEdit?: WorkspaceEditClientCapabilities; // * Capabilities specific to `WorkspaceEdit`s
			didChangeConfiguration?: DidChangeConfigurationClientCapabilities; // * Capabilities specific to the `workspace/didChangeConfiguration` * notification.
			didChangeWatchedFiles?: DidChangeWatchedFilesClientCapabilities; // * Capabilities specific to the `workspace/didChangeWatchedFiles` * notification.
			symbol?: WorkspaceSymbolClientCapabilities; // * Capabilities specific to the `workspace/symbol` request.
			executeCommand?: ExecuteCommandClientCapabilities; // * Capabilities specific to the `workspace/executeCommand` request.
			workspaceFolders?: boolean; // * The client has support for workspace folders. * * @since 3.6.0
			configuration?: boolean; // * The client supports `workspace/configuration` requests. * * @since 3.6.0
			semanticTokens?: SemanticTokensWorkspaceClientCapabilities; // * Capabilities specific to the semantic token requests scoped to the * workspace. * * @since 3.16.0
			codeLens?: CodeLensWorkspaceClientCapabilities; // * Capabilities specific to the code lens requests scoped to the * workspace. * * @since 3.16.0
			
			fileOperations?: { // * The client has support for file requests/notifications. * * @since 3.16.0
				dynamicRegistration?: boolean; // * Whether the client supports dynamic registration for file * requests/notifications.
				didCreate?: boolean; // * The client has support for sending didCreateFiles notifications.
				willCreate?: boolean; // * The client has support for sending willCreateFiles requests.
				didRename?: boolean; // * The client has support for sending didRenameFiles notifications.
				willRename?: boolean; // * The client has support for sending willRenameFiles requests.
				didDelete?: boolean; // * The client has support for sending didDeleteFiles notifications.			
				willDelete?: boolean; // * The client has support for sending willDeleteFiles requests.
			};

			inlineValue?: InlineValueWorkspaceClientCapabilities; // * Client workspace capabilities specific to inline values. * * @since 3.17.0
			inlayHint?: InlayHintWorkspaceClientCapabilities; // * Client workspace capabilities specific to inlay hints. * * @since 3.17.0		
			diagnostics?: DiagnosticWorkspaceClientCapabilities; // * Client workspace capabilities specific to diagnostics. * * @since 3.17.0.
		};

		textDocument?: TextDocumentClientCapabilities; // * Text document specific client capabilities.
		notebookDocument?: NotebookDocumentClientCapabilities; // * Capabilities specific to the notebook document support. * * @since 3.17.0
		
		window?: { // * Window specific client capabilities.
			workDoneProgress?: boolean; // * It indicates whether the client supports server initiated * progress using the `window/workDoneProgress/create` request. * * The capability also controls Whether client supports handling * of progress notifications. If set servers are allowed to report a * `workDoneProgress` property in the request specific server * capabilities. * * @since 3.15.0
			showMessage?: ShowMessageRequestClientCapabilities; // * Capabilities specific to the showMessage request * * @since 3.16.0	
			showDocument?: ShowDocumentClientCapabilities; // * Client capabilities for the show document request. * * @since 3.16.0
		};
		
		general?: { // * General client capabilities. * * @since 3.16.0
			staleRequestSupport?: { // * Client capability that signals how the client * handles stale requests (e.g. a request * for which the client will not process the response * anymore since the information is outdated). * * @since 3.17.0
				cancel: boolean; // * The client will actively cancel the request.			
				retryOnContentModified: string[]; // * The list of requests for which the client * will retry the request if it receives a * response with error code `ContentModified``
			}

			regularExpressions?: RegularExpressionsClientCapabilities; // * Client capabilities specific to regular expressions. * * @since 3.16.0
			markdown?: MarkdownClientCapabilities; // * Client capabilities specific to the client's markdown parser. * * @since 3.16.0		
			positionEncodings?: PositionEncodingKind[]; // * The position encodings supported by the client. Client and server * have to agree on the same position encoding to ensure that offsets * (e.g. character position in a line) are interpreted the same on both * side. * * To keep the protocol backwards compatible the following applies: if * the value 'utf-16' is missing from the array of position encodings * servers can assume that the client supports UTF-16. UTF-16 is * therefore a mandatory encoding. * * If omitted it defaults to ['utf-16']. * * Implementation considerations: since the conversion from one encoding * into another requires the content of the file / line the conversion * is best done where the file is read which is usually on the server * side. * * @since 3.17.0
		};

		experimental?: LSPAny; // * Experimental client capabilities.
	}*/

	return {
			workspace: {
				//applyEdit: boolean,
				//workspaceEdit: WorkspaceEditClientCapabilities,
				//didChangeConfiguration: DidChangeConfigurationClientCapabilities,
				//didChangeWatchedFiles: DidChangeWatchedFilesClientCapabilities,
				//symbol: WorkspaceSymbolClientCapabilities,
				//executeCommand: ExecuteCommandClientCapabilities,
				//workspaceFolders: boolean,
				//configuration: boolean,
				//semanticTokens: SemanticTokensWorkspaceClientCapabilities,
				//codeLens: CodeLensWorkspaceClientCapabilities,
//
				//fileOperations: {
				//	dynamicRegistration: boolean,
				//	didCreate: boolean,
				//	willCreate: boolean,
				//	didRename: boolean,
				//	willRename: boolean,
				//	didDelete: boolean,
				//	willDelete: boolean,
				//}
//
				//inlineValue: InlineValueWorkspaceClientCapabilities,
				//inlayHint: InlayHintWorkspaceClientCapabilities,
				//diagnostics: DiagnosticWorkspaceClientCapabilities,
			}

			//textDocument: TextDocumentClientCapabilities,
			//notebookDocument: NotebookDocumentClientCapabilities,

			//window: {
			//	workDoneProgress: boolean,
			//	showMessage: ShowMessageRequestClientCapabilities,
			//	showDocument: ShowDocumentClientCapabilities,
			//}
			
			//general: {
			//	staleRequestSupport: {
			//		cancel: boolean,
			//		retryOnContentModified: string[],
			//	}
//
			//	regularExpressions: RegularExpressionsClientCapabilities,
			//	markdown: MarkdownClientCapabilities,
			//	positionEncodings: PositionEncodingKind[],
			//}

			//experimental: LSPAny,
		}
}

function MAIN_message_construct_initializeParams(rootPath, workspaceDirectories) {

	if (workspaceDirectories) {
		rootPath = null;
	}

	/*
	export interface WorkspaceFolder {
		uri: URI; // The associated URI for this workspace folder.
		name: string; // The name of the workspace folder. Used to refer to this * workspace folder in the user interface.
	}
	*/

	let workspaceFolders = null;

	if (workspaceDirectories) {
		workspaceFolders = [];
		for (let i = 0; i < workspaceDirectories.length; i++) {
			let directory = workspaceDirectories[i];
			workspaceFolders.push({
				uri: directory.absolutePath,
				name: '' + directory.id, // id is of type Number
			});
		}
	}

	//rootPath = rootPath.replace(':', '%3A');

	/*processId: integer | null; // The process Id of the parent process that started the server. Is null if the process has not been started by another process. If the parent process is not alive then the server should exit (see exit notification) its process.
	clientInfo?: {...};
	locale?: string; // The locale the client is currently showing the user interface * in. This must not necessarily be the locale of the operating * system. * * Uses IETF language tags as the value's syntax * (See https://en.wikipedia.org/wiki/IETF_language_tag) * * @since 3.16.0
	rootPath?: string | null; // The rootPath of the workspace. Is null * if no folder is open. * * @deprecated in favour of `rootUri`.
	rootUri: DocumentUri | null; // The rootUri of the workspace. Is null if no * folder is open. If both `rootPath` and `rootUri` are set * `rootUri` wins. * * @deprecated in favour of `workspaceFolders`
	initializationOptions?: LSPAny; // User provided initialization options.
	capabilities: ClientCapabilities; // The capabilities provided by the client (editor or tool)
	trace?: TraceValue; // The initial trace setting. If omitted trace is disabled ('off').	
	workspaceFolders?: WorkspaceFolder[] | null; // The workspace folders configured in the client when the server starts. * This property is only available if the client supports workspace folders. * It can be `null` if the client supports workspace folders but none are * configured. * * @since 3.6.0*/

	return {
		processId: process.pid,
		clientInfo: {
			name: 'TextEditor123',
			version: '0.0.1',
		},
		//locale: ,//string,
		//rootPath: rootPath,//string | null,
		rootUri: rootPath,//DocumentUri | null, // DocumentUri is a string alias?
		//initializationOptions: ,//LSPAny,
		capabilities: MAIN_message_construct_clientCapabilities(),//ClientCapabilities,
		//trace: 'verbose',
		workspaceFolders: workspaceFolders//WorkspaceFolder[] | null,
	}
}

function MAIN_encodeMessageObject(messageObject) {
	let content = JSON.stringify(messageObject);
	let spacing = '\r\n\r\n';
	return `Content-Length: ${content.length}${spacing}${content}\n`;
}

/**
 * @param {string} json 
 * @returns {object | null}
 * 
 * // So the seemingly non-deterministic nature of what gets read from stdout is something to note.
 * 
 * // TODO: Preferably neither of these would allocate a "substring" But they both will for the time being because I'm using JSON.parse and at the moment I know not of any other way than providing this a string.
*/
function MAIN_decodeMessage(jsonBytes) {
	let json;

	if (remainingStdoutFromPartiallyReadEvent) {
		json = remainingStdoutFromPartiallyReadEvent; // TODO: Don't toString() this, work with the bytes directly until the end (does JSON.parse take bytes as input? If so never have to do a toString()?).
		remainingStdoutFromPartiallyReadEvent = null;
		jsonBytes = null;
	}
	else {
		json = jsonBytes.toString(); // TODO: Don't toString() this, work with the bytes directly until the end (does JSON.parse take bytes as input? If so never have to do a toString()?).
	}

	if (stdoutChunkObjects.length === 0) {
		// Parse Content-Length
		let indexOfContentLengthToken = json.indexOf('Content-Length: ');
		if (indexOfContentLengthToken === -1) return null;
		let substringIndexStart = indexOfContentLengthToken + 16; /* 16 === 'Content-Length: '.length */
		let substringIndexEnd = substringIndexStart;
		outerForLoop: for (; substringIndexEnd < json.length; substringIndexEnd++) {
			switch (json[substringIndexEnd]) {
				case '0':
				case '1':
				case '2':
				case '3':
				case '4':
				case '5':
				case '6':
				case '7':
				case '8':
				case '9':
					break;
				default:
					break outerForLoop;
			}
		}
		if (substringIndexEnd === substringIndexStart) return null;
		let contentLengthString = json.substring(substringIndexStart, substringIndexEnd);
		let contentLengthNumber = parseInt(contentLengthString, 10);
		if (!contentLengthNumber) return null;

		// Parse Content
		let indexOfSearchTerm = json.indexOf("\r\n\r\n");
		if (indexOfSearchTerm === -1) return null; // TODO: Don't return here, the header/content separating token is likely in the next to come chunk... TODO: look at all the return statements not just this one
		substringIndexStart = indexOfSearchTerm + 4; /* 4 === "\r\n\r\n".length */

		// Payload
		if (substringIndexStart + contentLengthNumber <= json.length) {
			// ... read
			content = json.substring(substringIndexStart, substringIndexStart + contentLengthNumber);
			return JSON.parse(content);
		}
		else {
			// ... continue delaying
			stdoutChunkObjects.push({ bytesRaw: jsonBytes, bytesDecoded: json });
			
			stdoutChunkFirstEntryMetadata.substringIndexStart = substringIndexStart;
			stdoutChunkFirstEntryMetadata.contentLengthNumber = contentLengthNumber;
			return null;
		}
	}
	else {
		// Parse Content
		// 0th
		let sumUnreadStdout = stdoutChunkObjects[0].bytesDecoded.length - stdoutChunkFirstEntryMetadata.substringIndexStart; // initialize to the remaining length that was in the first message of the batch
		
		// >first && <last
		for (let i = 1; i < stdoutChunkObjects.length; i++) { // TODO: You could determine the necessary length of the NEXT chunk that will cause the necessary length requirement to be met then avoid an 'n complexity' and just have 'constant'.
			// TODO: Further commenting about determining the necessary length of the NEXT chunk, that is what the original 'if' block is doing on the first message. Perhaps these two conditional branches are equivalent when following a "necessary length" implementation.
			sumUnreadStdout += stdoutChunkObjects[i].bytesDecoded.length;
		}

		// current
		sumUnreadStdout += json.length;

		// Payload
		if (stdoutChunkFirstEntryMetadata.contentLengthNumber <= sumUnreadStdout) {
			// ... read
			let builder = [];
			let len = 0;

			// 0th
			let lenZeroth = stdoutChunkObjects[0].bytesDecoded.length - stdoutChunkFirstEntryMetadata.substringIndexStart;
			if (lenZeroth) {
				let zerothSubstring = stdoutChunkObjects[0].bytesDecoded.slice(stdoutChunkFirstEntryMetadata.substringIndexStart, stdoutChunkObjects[0].bytesDecoded.length);
				builder.push(zerothSubstring); // initialize to the remaining length that was in the first message of the batch
				len += zerothSubstring.length;
			}
			
			// >first && <last
			for (let i = 1; i < stdoutChunkObjects.length; i++) { // TODO: You could determine the necessary length of the NEXT chunk that will cause the necessary length requirement to be met then avoid an 'n complexity' and just have 'constant'.
				// TODO: Further commenting about determining the necessary length of the NEXT chunk, that is what the original 'if' block is doing on the first message. Perhaps these two conditional branches are equivalent when following a "necessary length" implementation.
				builder.push(stdoutChunkObjects[i].bytesDecoded);
				len += stdoutChunkObjects[i].bytesDecoded.length;
			}

			if (len + json.length === stdoutChunkFirstEntryMetadata.contentLengthNumber) {
				
				builder.push(json);
				content = joinedJson;
				let aaa = 2;
			}
			else {
				let fromCurrent = stdoutChunkFirstEntryMetadata.contentLengthNumber - len;
				builder.push(json.substring(0, fromCurrent));
				remainingStdoutFromPartiallyReadEvent = json.substring(fromCurrent);
			}
			// current
			

			let joinedJson = builder.join('');

			stdoutChunkObjects.length = 0; // TODO: clear the array entries to permit garbage collection (since stdoutChunkObjects is always in the app's scope any entries would as well never be collected)

			let content;

			if (joinedJson.length === stdoutChunkFirstEntryMetadata.contentLengthNumber) {
				content = joinedJson;
				let aaa = 2;
			}
			else { // TODO: Dead code now?
				content = joinedJson.substring(0, stdoutChunkFirstEntryMetadata.contentLengthNumber);
				let bbb = 2;
				// I can't decide on what to put here, at the end of the day just make sure this case has something instrusive so its incompleteness isn't swept under the rug
				// maybe I should throw an error I can't describe how "confused" I am at the moment I am just pushing to make progress with every last bit of energy I have
				// and all the anxiety and decisions i.e.: you get a message box idk
				//
				// This dialog is coming up for understandable reasons and needs to now be handled.
				//
				dialog.showMessageBox({
					type: 'info',
					title: 'Alert',
					message: 'MAIN_decodeMessage unimplemented more than 1 message and final message has more text in it.',
					buttons: ['OK']
				});
			}

			return JSON.parse(content);

		}
		else {
			// ... continue delaying
			stdoutChunkObjects.push({ bytesRaw: jsonBytes, bytesDecoded: json });
		}
	}
}

function MAIN_initializeLanguageServer() {

	if (os.homedir() !== 'C:\\Users\\hunte') {
		console.log("MAIN_initializeLanguageServer(): os.homedir() !== 'C:\\Users\\hunte'");
		return;
	}

	let initializeMessageObject = MAIN_constructMessageObject(
		'initialize',
		MAIN_message_construct_initializeParams(openedDirectory/*formatAbsolutePath(openedDirectory)*/, workspaceDirectories));
// "file:///C:/Users/hunte/Repos/JavaScript" file:///C%3A/project/readme.md
	let InitializeMessageEncoded = MAIN_encodeMessageObject(initializeMessageObject);

	//languageServer = spawn('node', [
	//	'C:\\Users\\hunte\\AppData\\Roaming\\npm\\node_modules\\typescript-language-server\\lib\\cli.mjs',
	//	'--stdio']);
	languageServer = spawn('C:\\Users\\hunte\\Repos\\Aaa_LS\\JSLSApp\\bin\\Release\\net10.0\\publish\\JSLSApp.exe');

	/*
	interface RequestMessage extends Message {
		id: integer | string; // The request id.
		method: string; // The method to be invoked.
		params?: array | object; // The method's params.
	}
	*/

	/*
	interface ResponseMessage extends Message {		
		id: integer | string | null; // The request id.		
		result?: LSPAny; // The result of a request. This member is REQUIRED on success.* This member MUST NOT exist if there was an error invoking the method.		
		error?: ResponseError; // The error object in case a request fails.
	}
	*/

	// typescript-language-server is the command you would run in the terminal
	// windows search bar finds something if you type 'typescript-language-server'
	// right click > 'open file location'
	// 'C:\\Users\\hunte\\AppData\\Roaming\\npm\\typescript-language-server'
	//
	// Open the file itself in a text editor
	// It is a script that in the end essentially runs 'node ... ...'
	// hence the spawn arguments above replicate the "end essentially runs" step of the script that gets ran from the terminal command
	
	languageServer.stdout.on('data', (data) => {
		while (data || remainingStdoutFromPartiallyReadEvent) {
			let messageObject;
			if (!remainingStdoutFromPartiallyReadEvent) {
				messageObject = MAIN_decodeMessage(data);
				data = null;
			}
			else {
				messageObject = MAIN_decodeMessage(null);
			}
			
			if (!messageObject) return;

			if (messageObject.id && mostRecentRequest && messageObject.id === mostRecentRequest.id && mostRecentRequest.method) {
				switch (mostRecentRequest.method) {
					case 'textDocument/documentSymbol':
						mainWindowCapture.webContents.send('from-main', messageObject.result);
						break;
				}
			}
	
			if (messageObject.result) {
				if (messageObject.result.capabilities) {   // initialize response
					languageServerHandshakeSuccess = true;
				}
				else {
					let aaaDebugBreakpoint = 2;
				}
			}
			else {
				let bbbDebugBreakpoint = 2;
			}
		}
	});

	languageServer.on('close', (code) => {
		console.log(`Child exited with code ${code}`);
	});

	languageServer.stdin.write(InitializeMessageEncoded);
}

/**
 * TODO: This is copy, pasted, and modified from editor.js
 * 
 * TODO: SPECULATION: If passing the byte array requires a copy to be made then you perhaps might as well make the string in the renderer process? I'm trying to consider...
 * ...whether gc would incur reduce renderer process if this is done in the main process.
 * 
 * Tabs are stored as '\t\0\0\0', all line feeds converted to '\n'.
 * 
 * textonly is in reference to conversion of the raw storage of the text editor such that a tab of '\t\0\0\0' is returned as just '\t', and all line feeds as EDITOR_lineEndString
 * 
 * @returns {string}
 */
function MAIN_decode_experimental_textonly(bytes, start, length, EDITOR_lineEndString, EDITOR_fileStartsWithBom) {

	// TODO: consider the garbage collection overhead of saving out a large file, and whether chunking would be preferable

	let EDITOR_decode_pooled_stringBuilder_array;
	
	// TODO: if you push the string does it bork any optimizations that the runtime can make for storage of single character strings or something is this a thing?

	if (EDITOR_fileStartsWithBom) {
		EDITOR_decode_pooled_stringBuilder_array = new Array(length + 1);
		EDITOR_decode_pooled_stringBuilder_array.push("\uFEFF");
	}
	else {
		EDITOR_decode_pooled_stringBuilder_array = new Array(length);
	}

	let EDITOR_decoder = new TextDecoder();

    let end = start + length;
	
	if (length <= 0) {
		return '';
	}
    
	for (let i = start; i < end; i++) {
		switch (bytes[i]) {
			case 0: // NUL
				break;
			case 9: // TAB
				EDITOR_decode_pooled_stringBuilder_array.push('\t');
				break;
			case 10: // LF
				EDITOR_decode_pooled_stringBuilder_array.push(EDITOR_lineEndString);
				break;
			case 32: // Space
				EDITOR_decode_pooled_stringBuilder_array.push(' ');
				break;
			case 33: // !
				EDITOR_decode_pooled_stringBuilder_array.push('!');
				break;
			case 34: // "
				EDITOR_decode_pooled_stringBuilder_array.push('"');
				break;
			case 35: // #
				EDITOR_decode_pooled_stringBuilder_array.push('#');
				break;
			case 36: // $ (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('$');
				break;
			case 37: // %
				EDITOR_decode_pooled_stringBuilder_array.push('%');
				break;
			case 38: // & (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('&');
				break;
			case 39: // ' (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('\'');
				break;
			case 40: // (
				EDITOR_decode_pooled_stringBuilder_array.push('(');
				break;
			case 41: // )
				EDITOR_decode_pooled_stringBuilder_array.push(')');
				break;
			case 42: // *
				EDITOR_decode_pooled_stringBuilder_array.push('*');
				break;
			case 43: // +
				EDITOR_decode_pooled_stringBuilder_array.push('+');
				break;
			case 44: // , (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push(',');
				break;
			case 45: // -
				EDITOR_decode_pooled_stringBuilder_array.push('-');
				break;
			case 46: // .
				EDITOR_decode_pooled_stringBuilder_array.push('.');
				break;
			case 47: // /
				EDITOR_decode_pooled_stringBuilder_array.push('/');
				break;
			case 48: // 0
				EDITOR_decode_pooled_stringBuilder_array.push('0');
				break;
			case 49: // 1
				EDITOR_decode_pooled_stringBuilder_array.push('1');
				break;
			case 50: // 2
				EDITOR_decode_pooled_stringBuilder_array.push('2');
				break;
			case 51: // 3
				EDITOR_decode_pooled_stringBuilder_array.push('3');
				break;
			case 52: // 4
				EDITOR_decode_pooled_stringBuilder_array.push('4');
				break;
			case 53: // 5
				EDITOR_decode_pooled_stringBuilder_array.push('5');
				break;
			case 54: // 6
				EDITOR_decode_pooled_stringBuilder_array.push('6');
				break;
			case 55: // 7
				EDITOR_decode_pooled_stringBuilder_array.push('7');
				break;
			case 56: // 8
				EDITOR_decode_pooled_stringBuilder_array.push('8');
				break;
			case 57: // 9
				EDITOR_decode_pooled_stringBuilder_array.push('9');
				break;
			case 58: // :
				EDITOR_decode_pooled_stringBuilder_array.push(':');
				break;
			case 59: // ;
				EDITOR_decode_pooled_stringBuilder_array.push(';');
				break;
			case 60: // <
				EDITOR_decode_pooled_stringBuilder_array.push('<');
				break;
			case 61: // =
				EDITOR_decode_pooled_stringBuilder_array.push('=');
				break;
			case 62: // >
				EDITOR_decode_pooled_stringBuilder_array.push('>');
				break;
			case 63: // ?
				EDITOR_decode_pooled_stringBuilder_array.push('?');
				break;
			case 64: // @
				EDITOR_decode_pooled_stringBuilder_array.push('@');
				break;
			case 65: // A
				EDITOR_decode_pooled_stringBuilder_array.push('A');
				break;
			case 66: // B
				EDITOR_decode_pooled_stringBuilder_array.push('B');
				break;
			case 67: // C
				EDITOR_decode_pooled_stringBuilder_array.push('C');
				break;
			case 68: // D
				EDITOR_decode_pooled_stringBuilder_array.push('D');
				break;
			case 69: // E
				EDITOR_decode_pooled_stringBuilder_array.push('E');
				break;
			case 70: // F
				EDITOR_decode_pooled_stringBuilder_array.push('F');
				break;
			case 71: // G
				EDITOR_decode_pooled_stringBuilder_array.push('G');
				break;
			case 72: // H
				EDITOR_decode_pooled_stringBuilder_array.push('H');
				break;
			case 73: // I
				EDITOR_decode_pooled_stringBuilder_array.push('I');
				break;
			case 74: // J
				EDITOR_decode_pooled_stringBuilder_array.push('J');
				break;
			case 75: // K
				EDITOR_decode_pooled_stringBuilder_array.push('K');
				break;
			case 76: // L
				EDITOR_decode_pooled_stringBuilder_array.push('L');
				break;
			case 77: // M
				EDITOR_decode_pooled_stringBuilder_array.push('M');
				break;
			case 78: // N
				EDITOR_decode_pooled_stringBuilder_array.push('N');
				break;
			case 79: // O
				EDITOR_decode_pooled_stringBuilder_array.push('O');
				break;
			case 80: // P
				EDITOR_decode_pooled_stringBuilder_array.push('P');
				break;
			case 81: // Q
				EDITOR_decode_pooled_stringBuilder_array.push('Q');
				break;
			case 82: // R
				EDITOR_decode_pooled_stringBuilder_array.push('R');
				break;
			case 83: // S
				EDITOR_decode_pooled_stringBuilder_array.push('S');
				break;
			case 84: // T
				EDITOR_decode_pooled_stringBuilder_array.push('T');
				break;
			case 85: // U
				EDITOR_decode_pooled_stringBuilder_array.push('U');
				break;
			case 86: // V
				EDITOR_decode_pooled_stringBuilder_array.push('V');
				break;
			case 87: // W
				EDITOR_decode_pooled_stringBuilder_array.push('W');
				break;
			case 88: // X
				EDITOR_decode_pooled_stringBuilder_array.push('X');
				break;
			case 89: // Y
				EDITOR_decode_pooled_stringBuilder_array.push('Y');
				break;
			case 90: // Z
				EDITOR_decode_pooled_stringBuilder_array.push('Z');
				break;
			case 91: // [
				EDITOR_decode_pooled_stringBuilder_array.push('[');
				break;
			case 92: // \
				EDITOR_decode_pooled_stringBuilder_array.push('\\');
				break;
			case 93: // ]
				EDITOR_decode_pooled_stringBuilder_array.push(']');
				break;
			case 94: // ^
				EDITOR_decode_pooled_stringBuilder_array.push('^');
				break;
			case 95: // _
				EDITOR_decode_pooled_stringBuilder_array.push('_');
				break;
			case 96: // `
				EDITOR_decode_pooled_stringBuilder_array.push('`');
				break;
			case 97: // a
				EDITOR_decode_pooled_stringBuilder_array.push('a');
				break;
			case 98: // b
				EDITOR_decode_pooled_stringBuilder_array.push('b');
				break;
			case 99: // c
				EDITOR_decode_pooled_stringBuilder_array.push('c');
				break;
			case 100: // d
				EDITOR_decode_pooled_stringBuilder_array.push('d');
				break;
			case 101: // e
				EDITOR_decode_pooled_stringBuilder_array.push('e');
				break;
			case 102: // f
				EDITOR_decode_pooled_stringBuilder_array.push('f');
				break;
			case 103: // g
				EDITOR_decode_pooled_stringBuilder_array.push('g');
				break;
			case 104: // h
				EDITOR_decode_pooled_stringBuilder_array.push('h');
				break;
			case 105: // i
				EDITOR_decode_pooled_stringBuilder_array.push('i');
				break;
			case 106: // j
				EDITOR_decode_pooled_stringBuilder_array.push('j');
				break;
			case 107: // k
				EDITOR_decode_pooled_stringBuilder_array.push('k');
				break;
			case 108: // l
				EDITOR_decode_pooled_stringBuilder_array.push('l');
				break;
			case 109: // m
				EDITOR_decode_pooled_stringBuilder_array.push('m');
				break;
			case 110: // n
				EDITOR_decode_pooled_stringBuilder_array.push('n');
				break;
			case 111: // o
				EDITOR_decode_pooled_stringBuilder_array.push('o');
				break;
			case 112: // p
				EDITOR_decode_pooled_stringBuilder_array.push('p');
				break;
			case 113: // q
				EDITOR_decode_pooled_stringBuilder_array.push('q');
				break;
			case 114: // r
				EDITOR_decode_pooled_stringBuilder_array.push('r');
				break;
			case 115: // s
				EDITOR_decode_pooled_stringBuilder_array.push('s');
				break;
			case 116: // t
				EDITOR_decode_pooled_stringBuilder_array.push('t');
				break;
			case 117: // u
				EDITOR_decode_pooled_stringBuilder_array.push('u');
				break;
			case 118: // v
				EDITOR_decode_pooled_stringBuilder_array.push('v');
				break;
			case 119: // w
				EDITOR_decode_pooled_stringBuilder_array.push('w');
				break;
			case 120: // x
				EDITOR_decode_pooled_stringBuilder_array.push('x');
				break;
			case 121: // y
				EDITOR_decode_pooled_stringBuilder_array.push('y');
				break;
			case 122: // z
				EDITOR_decode_pooled_stringBuilder_array.push('z');
				break;
			case 123: // {
				EDITOR_decode_pooled_stringBuilder_array.push('{');
				break;
			case 124: // |
				EDITOR_decode_pooled_stringBuilder_array.push('|');
				break;
			case 125: // }
				EDITOR_decode_pooled_stringBuilder_array.push('}');
				break;
			case 126: // ~
				EDITOR_decode_pooled_stringBuilder_array.push('~');
				break;
			default:
				EDITOR_decode_pooled_stringBuilder_array.push(
					EDITOR_decoder.decode(bytes.subarray(i, i + 1)));
				break;
		}
	}
	
	return EDITOR_decode_pooled_stringBuilder_array.join('');
}

/**
 * Extracts more data per entry { basename, absolutePath, isDirectory, id }
 * and applies a common sorting prior to returning results.
 * */
function wrap_readdirSync_getChildList(parentAbsolutePath) {
	let childList = fs.readdirSync(parentAbsolutePath, { withFileTypes: true });
	for (var i = 0; i < childList.length; i++) {
		let filename = childList[i].name;
		let isDirectory = childList[i].isDirectory();
		let childAbsolutePath = path.join(parentAbsolutePath, filename);
		let id = database.addAbsolutePath(childAbsolutePath, filename);
		childList[i] = {
			basename: filename,
			absolutePath: childAbsolutePath,
			isDirectory: isDirectory,
			id: id
		};
	}

	childList.sort((a, b) => {
		if (a.isDirectory && !b.isDirectory) {
			return -1;
		}

		if (!a.isDirectory && b.isDirectory) {
			return 1;
		}

		return a.basename.localeCompare(b.basename);
	});

	return childList;
}

/**
 * Applies a common sorting prior to finding the indexOf
 * 
 * (does NOT internally extract any extra data than what is used for determining the indexOf)
 * 
 * TODO: This could still be faster. You shouldn't need to have an initial loop over the array to rewrite each index as { basename, isDirectory } to do this.
 * TODO: As well I believe checking the filename alone (not checking the childIsDirectory) is sufficient.
 */
function wrap_readdirSync_indexOf(parentAbsolutePath, childFilename, childIsDirectory) {
	let childList = fs.readdirSync(parentAbsolutePath, { withFileTypes: true });
	for (var i = 0; i < childList.length; i++) {
		let filename = childList[i].name;
		let isDirectory = childList[i].isDirectory();
		childList[i] = {
			basename: filename,
			isDirectory: isDirectory,
		};
	}

	childList.sort((a, b) => {
		if (a.isDirectory && !b.isDirectory) {
			return -1;
		}

		if (!a.isDirectory && b.isDirectory) {
			return 1;
		}

		return a.basename.localeCompare(b.basename);
	});

	for (let i = 0; i < childList.length; i++) {
		if (childList[i].basename === childFilename && childList[i].isDirectory === childIsDirectory) {
			return i;
		}
	}

	return -1;
}

/**
 * started off with code snippet from Google AI Overview for "node fs determine if file has bom":
 */
function hasBOM(filePath) {
  // Use a small buffer to read just the first 3-4 bytes
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);

  //let asd = fs.statSync(fd);
  let asd = fs.statSync(filePath);

  // Check for common BOM signatures
  // UTF-8: EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
	const bufferaaa = Buffer.alloc(asd.size - 4);
	fs.readSync(fd, bufferaaa, 0, bufferaaa.length, 3);
	fs.closeSync(fd);
	return {
		text: bufferaaa.toString(),
		fileStartsWithBom: true
	};
  }
  else {
	const bufferaaa = Buffer.alloc(asd.size);
	fs.readSync(fd, bufferaaa, 0, bufferaaa.length, 0);
	fs.closeSync(fd);
    return {
		text: bufferaaa.toString(),
		fileStartsWithBom: false
	};
  }
  /*
  // UTF-16 Little Endian: FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'UTF-16LE';
  }
  // UTF-16 Big Endian: FE FF
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'UTF-16BE';
  }
	*/

  //return false;
}

/* sec0
//========
/*
  TODO: Every IPC from renderer to main should return a result type
  {
      Result: ...,
      State: { cancelled, completed, failed },
      Note: "some string",
  }

  if (aaa.failed) { showNotification(aaa.Note); }

  if (aaa.Result === undefined) {
      // void
  }

  if (aaa.Result === null) {
      // lack of a Result / nullable result
  }
  *//*
//========
sec0*/

/*
- [ ] When you cache the bounding client rect, what properties do you actually end up using
    and would it be meaningful to instead store those individual properties instead.
        - [ ] Build intuition for how frequently getting bounding client rect can be invoked before you'd desire to cache it or its properties that you will use.
        - [ ] i.e.: at what frequency of getBoundingClientRect do you decide to cache it or its properties that you will use.
    
- [ ] Type a new multi-line comment, then make it span multiple lines, its syntax highlighting doesn't work unless you re-open the file.

- [ ] What is the cost of document.getElementById(...)
    - [ ] Should a non-zero amount of scenarios where you cache this be changed to instead invoke the method to get the reference when needed.

- [ ] When storing numbers or booleans, how does this compare to a UInt...Array that has storage for these such things.
    - [ ] Instead of storing your numbers in a global scope you have a UInt...Array and put numbers in there.
    - [ ] Then to access the previous number variable you instead access the UInt...Array at some hardcoded index that represents the variable.
    - [ ] The datatypes of number and uint... are not equivalent, but this presumes there is a valid conversion between them given the use case.
    - [ ] And sure the global scope might not be ideal but many of my use cases are currently exactly this cause I'm still class-encapsulating the logic.

- [ ] More multicursor progress

- [ ] Determine how you will change the lexer for various file extensions.
    - [ ] Is doing this immediately via the file extension reasonable?
    - [ ] I think so...
        - [ ] so then how do you have the renderer process determine the file extension?
        - [ ] Is the I think it is 'path' is this available in the renderer process?
        - [ ] Also investigate why you have confusion about whether the renderer process would or would not have access to 'path'.

- [ ] A completely in-memory file then save-as
- [ ] save-as but for any file

- [ ] Cost of function invocation
    - [ ] JavaScript function inlining?
        - [ ] There does exist engine level automatic inlining but then the question is how you can determine whether a certain function has a tendency to do this or not
        - [ ] There doesn't seem to an attribute for aggressive inlining

- [ ] 'did-change-text-document-notification'
    - [ ] the first thing this does is:
        - [ ] absolutePath = formatAbsolutePath(absolutePath);
        - [ ] consider storing in renderer process the formatted absolute path so you don't have to do this everytime?
	- [ ] The solution currently is adding another string to the renderer so it is a BAD solution
	- [ ] But this code has to be written first in order to get a final solution or just even do it for the
	    sake of crossing this off and saying I tried but it isn't worth or like literally anything

- [ ] Enums that are strings optimization vs an int?
    - Enums are "objects?" with named property to value mappings?
	- this sounds extremely expensive for what it is?
	- maybe it isn't as bad as it sounds
	- [ ] If I use a string, even if that string is somehow blitted or through interning has extremely minimal overhead on the GC
	    you still have to add that data to the end program so you'd no matter what be better off with a number
		albeit the amount you'd be better off by I'm still not overly certain.
	- [ ] dah, when you switch over the enum if it got converted to a string at any point it doesn't work
	- [ ] I suppose one thing to consider would be re-using the same string literal value
	    because in the UI you need to display a "name" for the menu option.
		This name was "Copy", but the Enum was "COPY" so this resulted in "COPY" existing as data for no reason
	
- [ ] Could you get a reference to the function as a variable?
    - [ ] that presumably would have "some degree of overhead for GC" since you're adding a reference that it has to traverse.
    - [ ] the underlying instance is already allocated.
    - [ ] unless it isn't... because you need to allocate some kind of Action or Func like wrapper of sorts I'm not sure.
    - [ ] Might still be worth while to avoid the switch so much?
    - [ ] Ah but the default case doesn't invoke anything.
    - [ ] So then you'd be better off optimizing elsewhere first I imagine unless measurements show otherwise there is no reason to currently look at this beyond the current solution.

- [ ] Something to consider when syntax highlighting:
    - [ ] If you syntax highlight brace characters either open or close.
    - [ ] You already have logic to say two or more brace characters that are contiguous get wrapped in the same span.
    - [ ] But you also could say, if they are separated by whitespace then you could have 1 span for them and the whitespace?
    - [ ] Because whitespace is invisible so if you colored it, nothing would change?
    - [ ] maybe is a bad idea.

- [ ] Get character when a pending edit needs to be fixed it isn't working.

- [ ] Why does find all not work?

- [ ] Google AI Overview "javascript if I declare a variable as const and its value is an int does the engine optimize the storage" paraphrased:
    - Small Integer Optimization (SMI)
	- Constant Folding and Propagation
	- Escape Analysis

- [ ] I was wondering about this once I forgot a keyword and my code was still working: Accidental globals (variables declared without a keyword)

// I have an edm song playing and I've just been staring at the music video the lyrics are pretty good something like "badadabeepadoooo"
// and no nothing that is related to what I'm watching shows up when you google that.

I'm not feeling well, I'm trying to figure out how I can make any semblance of progress for the day then I'm probably done

That's why I'm trying to visualize the tasks in my mind by typing them out.
It is good no matter what. But especially at the moment because I "feel" like I can't do anything.
Not from a skill perspective but I just am sitting here like "ugh"

So I need to determine what a meaningful amount of progress for the day would be.

I have other tasks too... I don't know if I want to write them down because all in all they're maybe... I guess I'm not focused on them right now but I'm aware.
It sort of comes down to "most of these I am 100% I can get something going but it is because I've already done it before"
So do I really want to write another scroll line of text into view and then lex the line.
Ehh I already know how to do that, and maybe I'll decide later that I don't even like the idea anymore.
That being said I "feel" uneasy about the idea of switching between lexers based on the file extension or something.
So I would actually like to do that because I feel some degree of a desire to procrastinate when I think about it.

That's essentially my number 1 way to measure productivity for the day.
Is what I accomplished something that would typically cause me to feel a desire to procrastinate.
I don't want to just sit here and type out bulk things all the time it kind of is pointless.
It isn't entirely pointless... but you probably get what I'm saying, I want to do something that is uncomfortable because
I have a daily bank of stress resilience that I'd like to deplete a bit because it is time gated I can't just
avoid stress and accrue an infinite amount of stress resilience over time there is a cap so I need to
incur stress responsibly on a day to day basis to keep everything manageable.

Not just that but even though discipline is important.
There also is a degree of "I occassionally find enjoyment" that helps keep you doing something.
I feel like garbage constantly but I take solace in the fact that I occassionally feel incredibly good while coding.
And thus I'm willing to engage in discipline to mend the gaps between the varying moods.

Right now I feel like garbage for example.

And the self perceived progress on any given day is very inaccurate.
Just because you feel like garbage for the entirety of the time you coded that day,
and other days you felt amazing while coding for the entirety of the time you coded that day.
One of those coding sessions isn't necessarily more productive than the other.
You need both moods at separate coding sessions in order to ground yourself
and see the reality of things.
You shouldn't skip out on a coding session because of your mood,
every mood has its own pros and cons.

============

Mood is very complicated.
But it is important not to confuse 'pleasure' and 'competency'.
This is most commonly seen in recreational use of dopaminergic substances without a prescription.
It is a very very bad idea to do these things without the care of a doctor involved.

============

It's been 4 hours and I still haven't written any code.
Today is a very eh kind of vibe for me.
In my mind I'm just focused on "what is the plan to reach the goal long term" I gotta just
do the bare minimum fatigue relative to how I feel that day.
And the bar is very very low for what I need to accomplish today.
The reason my throughput might seem high.
Is because no matter what my mood is I always push to do as much as I can.
By doing that you maximize the amount of good moods you are in.
Because everyday no matter how you feel you sit there and TRY to get into it.
And you can't just make excuses to do nothing.
You have to sit there and achieve something even if it is small.
And some days I'll start off in the worst mood ever and I accomplish a single
goal and suddenly I'm over the moon and can go all day without even trying
("going all day" wouldn't be a good thing because you need to take a break at some point to exercise and etc...
but it emphasizes the idea that you gotta just get started
because your mood at the start isn't necessarily going to be your mood the entire session).

=========

I constantly feel like I don't want to do this anymore.
I want to just play videogames is all I can think while I'm sitting here and I spend hours just sitting here with the code
open and I'm staring at it and I'm getting NOTHING done. It is so frustrating.

I literally have had the code open this entire time and I've done nothing.

I don't want to play videogames actually.
It is just that my brain is completely zeroing out on me.
And the videogames are more quick to take advantage of my brain to make me feel like continuing engaging with them.

What I want to do is write some code and make progress.

I imagine a cartoon in my head. Where my cartoonified brain is a representation of me.
And I like take a stick and poke it and say "do it do something" and I just sit here visualizing that for hours on end.

*/
