// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// preload with contextIsolation enabled

const { contextBridge, ipcRenderer } = require('electron')

// Exposes in the renderer API to interact with the main process.
// You turn on context isolation to avoid accidentally leaking any priviledged information / api
// from the preload.
//
// the contextBridge and exposeInMainWorld is a means of creating
// a readonly API on the 'window' object for the renderer.
contextBridge.exposeInMainWorld('myAPI', {
  onMessage: (callback) => ipcRenderer.on('from-main', (_event, value) => callback(value)),
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  chooseWorkspace: () => ipcRenderer.invoke('choose-workspace'),
  didChangeTextDocumentNotification: (absolutePath, version, startLine, startCharacter, endLine, endCharacter, text) => ipcRenderer.invoke('did-change-text-document-notification', absolutePath, version, startLine, startCharacter, endLine, endCharacter, text),
  /**
   * The provided absolute file path is validated by the main process.
   * If the absolute file path is NOT recognized by the main process, then an empty enumeration is returned.
   * @returns 
   */
  getFilesystemEntries: absoluteFilePath => ipcRenderer.invoke('get-filesystem-entries', absoluteFilePath, /*argumentIsId*/ false),
  getFilesystemEntries_argumentIsId: id => ipcRenderer.invoke('get-filesystem-entries', id, /*argumentIsId*/ true),
  getFilesystemEntryById: id => ipcRenderer.invoke('get-filesystem-entry-by-id', id),
  /**
   * See also 'editorReadAllText'
   */
  readAllText: absoluteFilePath => ipcRenderer.invoke('read-all-text', absoluteFilePath),
  /**
   * This carries LSP "intent" of opening the file in the editor and will result in
   * in a method: ‘textDocument/didOpen’ notification being sent to the LSP.
   * 
   * TODO: Decide on the naming between 'readAllText', and 'editorReadAllText', and whether they both need to exist.
   * 
   * You can't store tabs as '\0\0\0\t' because the LSP interactions will be horrible to deal with?
  */
  editorReadAllText: absoluteFilePath => ipcRenderer.invoke('editor-read-all-text', absoluteFilePath),
  editorDocumentSymbolsRequest: () => ipcRenderer.invoke('editor-document-symbols-request'),
  // I've seen people saying you can access the clipboard the same way as the main process from renderer process
  // but I'm not touching that at the moment.
  setClipboard: text => ipcRenderer.invoke('set-clipboard', text),
  editorSetClipboard: (uint8Array, offset, length, EDITOR_lineEndString) => ipcRenderer.invoke('editor-set-clipboard', uint8Array, offset, length, EDITOR_lineEndString),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  findAll: (search, matchWord) => ipcRenderer.invoke('find-all', search, matchWord),
  findAllGetPositions: (absolutePath, search, matchWord) => ipcRenderer.invoke('find-all-getPositions', absolutePath, search, matchWord),
  newFile: (parentDirectoryAbsolutePath, filename, isDirectory) => ipcRenderer.invoke('new-file', parentDirectoryAbsolutePath, filename, isDirectory),
  deleteFile: (absolutePath, isDirectory) => ipcRenderer.invoke('delete-file', absolutePath, isDirectory),
  renameFile: (absolutePath, filename, isDirectory) => ipcRenderer.invoke('rename-file', absolutePath, filename, isDirectory),
  saveFile: (unvalidatedAbsolutePath, text) => ipcRenderer.invoke('save-file', unvalidatedAbsolutePath, text),
  editorSaveFile: (unvalidatedAbsolutePath, uint8Array, count, EDITOR_lineEndString, EDITOR_fileStartsWithBom) => ipcRenderer.invoke('editor-save-file', unvalidatedAbsolutePath, uint8Array, count, EDITOR_lineEndString, EDITOR_fileStartsWithBom),
  copyClipboardAbsolutePathToDirectory: (directory, menuOptionCut_id) => ipcRenderer.invoke('copy-clipboard-absolute-path-to-directory', directory, menuOptionCut_id),
})