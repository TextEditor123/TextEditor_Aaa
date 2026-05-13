// TODO: reduce the count of live objects by creating local variables to the children of explorerElement...
// ...via variable defined constants that say the index for the respective element in the explorerElement.children list that you'd find the element.
// And have the first ... children be conventionally known to be hardcoded indices at which they reside.
const EXPLORER_Element = document.getElementById('EXPLORER');
const EXPLORER_PickFolder = document.getElementById('EXPLORER_pickFolder');

const EXPLORER_isExpandedText = '-';
const EXPLORER_NOTisExpandedText = '+';
const EXPLORER_cannotBeExpandedText = '';

/** Pixels */
const EXPLORER_offsetPerDepth = 8;

let EXPLORER_show = true;

/** 8 */
let EXPLORER_firstSpanWidthValue = 8;
/** 8px */
let EXPLORER_firstSpanWidth = 8;

let menuOptionX = 0;
let menuOptionY = 0;

let EXPLORER_menuOptionCut_object = null;

let EXPLORER_treeViewComponent = new TreeViewComponent();

class EXPLORER_TreeViewDirector {

    constructor() {
        /** @type {string} */
        this.chosenDirectory = null;

        /**
         * TODO: Don't use 'TrackedSyntaxList' for this.
         * 
         * // Yes, this is nonsense I need to just make a different type or something.
         * 
         * this.flatList.insert(..., { TrackedSyntaxKind.HACK_isExpandable_isExpanded | ... }, absolutePathId, depth);
         * 
         * @type {TrackedSyntaxList}
         * */
        this.flatList = new TrackedSyntaxList(32);
    }

    setChosenDirectory(chosenDirectory, chosenDirectoryAbsolutePathId) {
        this.chosenDirectory = chosenDirectory;
        this.chosenDirectoryAbsolutePathId = chosenDirectoryAbsolutePathId;

        this.flatList.clear();

        if (!this.chosenDirectory) {
            return;
        }

        let isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;
        this.flatList.insert(this.flatList.count_abstract, isExpandable_isExpanded_enum, this.chosenDirectoryAbsolutePathId, 0);
        EXPLORER_treeViewComponent.itemHeightTotal = this.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
        EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';
        // Invoke this?: 'await EXPLORER_treeViewComponent.draw_render_fullReset_async();'
    }
    
    setChosenWorkspace(chooseWorkspaceResult) {
        this.chosenWorkspace = chooseWorkspaceResult.workspaceFileAbsolutePath;

        this.flatList.clear();

        if (!this.chosenWorkspace) {
            return;
        }

        for (let i = 0; i < chooseWorkspaceResult.directories.length; i++) {
            let directory = chooseWorkspaceResult.directories[i];
            let isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;
            this.flatList.insert(this.flatList.count_abstract, isExpandable_isExpanded_enum, directory.id, 0);
        }

        EXPLORER_treeViewComponent.itemHeightTotal = this.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
        EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';
        // Invoke this?: 'await EXPLORER_treeViewComponent.draw_render_fullReset_async();'
    }

    /**
     * This method should not modify the returned value of 'getTotalCount()' because it is invoked from within a loop in which the upperLimit is cached as the result of 'getTotalCount()'.
     * @param {*} divItem every divItem contains a span as its first child, this child is designated to contain innerText that represents expandable/expanded state or not. There exists a textnode as the final "child" as well for the display text.
     * @param {*} indexItem 
     * @param {*} isNull the amount of divs that fill the screen is always rendered at all times. So when a div that was populated, is no longer populated you need to clear any previously rendered content for that div, and then set the 'display: none'.
     */
    async drawItem_async(divItem, indexItem, isNull) {

        if (isNull) {
            // TODO: Will the user agent remove a text node that has an "empty" nodeValue?
            divItem.lastChild.nodeValue = 'a';
            divItem.lastChild.title = '';
            divItem.style.display = 'none';
            return;
        }

        divItem.style.display = '';

        // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
        let start = EDITOR_pooledTrackedSyntax.start; // id
        let length = EDITOR_pooledTrackedSyntax.length; // depth
        let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum

        // TODO: ipc to main in bulk with all ids that are to be rendered in the current render...
        // ...don't include the ones that are already rendered either only the new ones that came into view.
        
        let isDirectory = trackedSyntaxKind === TrackedSyntaxKind.HACK_isExpandable_isExpanded ||
                          trackedSyntaxKind === TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;

        // If there are any display: none virtualized that then go on to become populated (i.e.: you added to the list or something)
        // - TODO: then you'd need to have extra logic for that because you would've fit that entry in the virtualize count but you didn't because it wasn't existing at the time.
        // probably vice versa too:
        // - TODO: if you remove...

        let textNode = divItem.lastChild;
        if (textNode.nodeType !== Node.TEXT_NODE) throw new Error('if (textNode.nodeType !== Node.TEXT_NODE)');
        
        let entry = await window.myAPI.getFilesystemEntryById(start);
        textNode.nodeValue = entry.basename;
        textNode.title = entry.absolutePath;

        if (isDirectory && !entry.isDirectory) {
            // A file was deleted then a directory was created with same absolute file path or vice versa.
            this.flatList.setTrackedSyntaxKind(indexItem, TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded);
        }

        // Thus you don't store isDirectory, you store isExpandable/isExpanded?
        // ... if you are just storing a string, you could add to the enum and just use isExpandable_isExpanded, isExpandable_NOTisExpanded, NOTisExpandable_isExpanded, NOTisExpandable_NOTisExpanded
        //
        // I'm not making this for someone, in this exact moment I have no interest in changing the list so long as it doesn't cause me any confusion I already know I can write the other thing so I don't really care I'll do it later. I'm not saying this is a good idea either. Just that I'm lazy and I don't wanna do it right now because this explorer is more interesting and I am aware and willing to eat the cost of rewriting later.
        //
        switch (trackedSyntaxKind) {
            case TrackedSyntaxKind.HACK_isExpandable_isExpanded:
                divItem.children[0].innerText = '-';
                break;
            case TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded:
                divItem.children[0].innerText = '+';
                break;
            case TrackedSyntaxKind.HACK_NOTisExpandable_isExpanded:
                // TODO: the 'explorer.js' file currently uses the text '}' for 'case TrackedSyntaxKind.HACK_NOTisExpandable_isExpanded:'...
                // ...this case isn't currently being hit...
                // ...but if it ever were to be hit, perhaps the width of the span would act weirdly if '}' turns out to be the largest width.
                divItem.children[0].innerText = '}';
                break;
            case TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded:
                divItem.children[0].innerText = '';
                break;
        }

        divItem.style.marginLeft = EXPLORER_offsetPerDepth * length + 'px';
    }
    
    /**
     * Not every key invokes this. 
     */
    async onkeydown_async(divItem, indexItem, key) {
        switch (key) {
            case ' ':
            case 'Enter':
                // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
                this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
                let start = EDITOR_pooledTrackedSyntax.start; // id
                let length = EDITOR_pooledTrackedSyntax.length; // depth
                let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum
                if (trackedSyntaxKind === TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded) {
                    // TODO: open the file by id in one ipc call
                    const entry = await window.myAPI.getFilesystemEntryById(start);
                    if (!entry) return;
        
                    if (!entry.isDirectory) {
                        let shouldFocus;
                        if (key === ' ') {
                            shouldFocus = false;
                        }
                        else if (key === 'Enter') {
                            shouldFocus = true;
                        }
                        await EXPLORER_openInEditor(entry.absolutePath, shouldFocus);
                    }
                }
                break;
        }
    }
    
    async ondblclick_async(divItem, indexItem) {
        // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
        let start = EDITOR_pooledTrackedSyntax.start; // id
        let length = EDITOR_pooledTrackedSyntax.length; // depth
        let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum

        if (trackedSyntaxKind === TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded) {
            // TODO: open the file by id in one ipc call
            const entry = await window.myAPI.getFilesystemEntryById(start);
            if (!entry) return;

            if (!entry.isDirectory) {
                await EXPLORER_openInEditor(entry.absolutePath, /*shouldFocus*/ true);
            }
        }
    }
    
    async oncontextmenu_async(divItem, indexItem, event, relativeIndex) {
        let optionList = [
            new MenuOption(CommandKind.Copy, 'Copy', null),
            new MenuOption(CommandKind.CopyAbsolutePath, 'Copy Absolute Path', null),
        ];

        EXPLORER_treeViewComponent.ensure_boundingClientRect();
        let nodeListBoundingClientRect = EXPLORER_treeViewComponent.boundingClientRect;

        // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
        let start = EDITOR_pooledTrackedSyntax.start; // id
        let length = EDITOR_pooledTrackedSyntax.length; // depth
        let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum

        let target = {
            id: start,
            depth: length,
            isExpandable_isExpanded_enum: trackedSyntaxKind,
            indexItem: indexItem,
            divRelativeIndex: relativeIndex,
        };

        if (event.button === 2) {
            this.addSpecificMenuOptionsForTarget(optionList, divItem, target);
            menuSet('EXPLORER', target, optionList, menuOptionX=event.clientX, menuOptionY=event.clientY);
        } else {
            this.addSpecificMenuOptionsForTarget(optionList, divItem, target);
            menuSet('EXPLORER', target, optionList, menuOptionX=nodeListBoundingClientRect.left, menuOptionY=(nodeListBoundingClientRect.top + ((EXPLORER_treeViewComponent.cursorIndex + 1) * EXPLORER_treeViewComponent.itemHeightNumber)));
        }
    }

    addSpecificMenuOptionsForTarget(optionList, divItem, target) {
        if (!divItem) return;

        // check the "text icon": { '-', '+', '' }
        if (target.isExpandable_isExpanded_enum === TrackedSyntaxKind.HACK_isExpandable_isExpanded ||
            target.isExpandable_isExpanded_enum === TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded) {
            
            // Directory
            optionList.push(new MenuOption(CommandKind.NewFile_File, 'NewFile', null));
            optionList.push(new MenuOption(CommandKind.NewFile_Directory, 'NewDirectory', null));
            optionList.push(new MenuOption(CommandKind.DeleteFile_Directory, 'Delete', null));
            optionList.push(new MenuOption(CommandKind.RenameFile_Directory, 'Rename', null));
            optionList.push(new MenuOption(CommandKind.Paste, 'Paste', null));
            optionList.push(new MenuOption(CommandKind.Cut, 'Cut', null));
        }
        else {
            // File
            optionList.push(new MenuOption(CommandKind.DeleteFile_File, 'Delete', null));
            optionList.push(new MenuOption(CommandKind.RenameFile_File, 'Rename', null));
            optionList.push(new MenuOption(CommandKind.Cut, 'Cut', null));
        }
    }

    /**
     * TODO: To detect whether the "expand/collapse icon" was clicked, the logic 'if(event.target === nodeElement.children[0])' is used...
     * ...this logic is flawed if one ever were to put an element within the span that became the target...
     * ...thus, you should consider checking the x position of the event against the x position of the nodeElement.children[0].
     * @param {*} event 
     */
    async expandCollapseIconWasClicked_async(divItem, indexItem) {
        // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
        let start = EDITOR_pooledTrackedSyntax.start; // id
        let length = EDITOR_pooledTrackedSyntax.length; // depth
        let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum

        if (trackedSyntaxKind === TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded) {

            divItem.children[0].innerText === '-';
            this.flatList.setTrackedSyntaxKind(indexItem, TrackedSyntaxKind.HACK_isExpandable_isExpanded);

            const filesystemEntries = await window.myAPI.getFilesystemEntries_argumentIsId(start);
    
            for (let i = 0; i < filesystemEntries.length; i++) {
                let entry = filesystemEntries[i];
                let isExpandable_isExpanded_enum;
                if (entry.isDirectory) {
                    isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;
                }
                else {
                    isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded;
                }
                // TODO: Insert range, or at the least 'pre-emptively' resize the list so that it fits each insertion without resizing per insertion.
                this.flatList.insert(indexItem + 1 + i, isExpandable_isExpanded_enum, entry.id, length + 1);
                EXPLORER_treeViewComponent.itemHeightTotal = this.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';
            }

            await EXPLORER_treeViewComponent.draw_render_fullReset_async();
        }
        else if (trackedSyntaxKind === TrackedSyntaxKind.HACK_isExpandable_isExpanded) {

            divItem.children[0].innerText === '+';
            this.flatList.setTrackedSyntaxKind(indexItem, TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded);

            let countChildren = 0;
            for (let i = indexItem + 1; i < this.flatList.count_abstract; i++) {
                // If currentDepth < ithElementDepth; // then current is a parent of ithElement.
                if (length < this.flatList.getLength(i)) {
                    countChildren++;
                }
                else {
                    break;
                }
            }
            if (countChildren > 0) { // TODO: is this check necessary?
                this.flatList.removeAt(indexItem + 1, countChildren);
                EXPLORER_treeViewComponent.itemHeightTotal = this.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';
                await EXPLORER_treeViewComponent.draw_render_fullReset_async();
            }
        }
    }

    /**
     * This method should only pertain itself with the contents of the flat list, any UI changes will be made based on the returned 'changeCount'
     * which is interpreted as one for the item itself, plus the count of any children that were recursively removed.
     * 
     * TODO: Include the word "directory"?
     * 
     * @param {*} indexItem 
     * @returns 
     */
    async removeFromFlatList_async(indexItem) {
        // TODO: !!!! You might need to be careful with async and the EDITOR_pooledTrackedSyntax; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.flatList.getElementAt(EDITOR_pooledTrackedSyntax, indexItem);
        let start = EDITOR_pooledTrackedSyntax.start; // id
        let length = EDITOR_pooledTrackedSyntax.length; // depth
        let trackedSyntaxKind = EDITOR_pooledTrackedSyntax.trackedSyntaxKind; // isExpandable_isExpanded_enum

        if (trackedSyntaxKind === TrackedSyntaxKind.HACK_NOTisExpandable_isExpanded) {
            alert("TODO: if (trackedSyntaxKind === TrackedSyntaxKind.HACK_NOTisExpandable_isExpanded)");
            return;
        }

        if (trackedSyntaxKind === TrackedSyntaxKind.HACK_isExpandable_isExpanded) {

            let countChildren = 0;
            for (let i = indexItem + 1; i < this.flatList.count_abstract; i++) {
                // If currentDepth < ithElementDepth; // then current is a parent of ithElement.
                if (length < this.flatList.getLength(i)) {
                    countChildren++;
                }
                else {
                    break;
                }
            }
            this.flatList.removeAt(indexItem, 1 + countChildren);
            EXPLORER_treeViewComponent.itemHeightTotal = this.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
            EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';
            return 1 + countChildren;
        }
    }

    async setFlatListEntryId_async(indexItem, pathId) {
        this.flatList.setStart(indexItem, pathId);
    }

    getTotalCount() {
        return this.flatList.count_abstract;
    }
}

let EXPLORER_director = new EXPLORER_TreeViewDirector();

function EXPLORER_init() {
    EXPLORER_PickFolder.addEventListener('click', async () => {
        // { basename: basename, openedDirectory: openedDirectory }
        let chooseDirectoryResult = await window.myAPI.chooseDirectory();
        if (chooseDirectoryResult.canceled) return;

		EXPLORER_setShow(true);
        let chosenDirectory = chooseDirectoryResult.openedDirectory;
        EXPLORER_PickFolder.innerText = chooseDirectoryResult.basename;
        EXPLORER_PickFolder.title = chosenDirectory;

        EXPLORER_director.setChosenDirectory(chosenDirectory, chooseDirectoryResult.id);
        EXPLORER_treeViewComponent.setItems(EXPLORER_director, APP_lineHeight, APP_lineHeight + 'px');
        await EXPLORER_treeViewComponent.draw_create_async(EXPLORER_Element, null);
    });
    
    let pickWorkspaceButton = document.getElementById('EXPLORER_pickWorkspace');
    pickWorkspaceButton.addEventListener('click', async () => {
        
        let chooseWorkspaceResult = await window.myAPI.chooseWorkspace();
        if (chooseWorkspaceResult.canceled) return;

		EXPLORER_setShow(true);

        let pickWorkspaceButton = document.getElementById('EXPLORER_pickWorkspace');
        pickWorkspaceButton.innerText = chooseWorkspaceResult.workspaceFileNameWithoutExtension;
        pickWorkspaceButton.title = chooseWorkspaceResult.workspaceFileAbsolutePath;

        EXPLORER_director.setChosenWorkspace(chooseWorkspaceResult);
        EXPLORER_treeViewComponent.setItems(EXPLORER_director, APP_lineHeight, APP_lineHeight + 'px');
        await EXPLORER_treeViewComponent.draw_create_async(EXPLORER_Element, null);
    });

    
    let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
    toggleShowExplorerButton.checked = EXPLORER_show;
    toggleShowExplorerButton.addEventListener('click', () => {
    	// TODO: Will shadowing 'toggleShowExplorerButton' with a declaration of the same name in here cause any oddities in relation to app long garbage collection overhead....
    	// ...presumably the answer is 99.999% no but I can't bear to deal with this right now, thus the variable name 'avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton'.
    	let avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
    	if (avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton) {
    		EXPLORER_setShow(avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton.checked);
    	}
    });
}

/**
Hiding an element's visibility rather than removing the HTML has a cost associated with it.
If a UI piece isn't integral to the app, I wouldn't even transitionally use this as a solution
because it could "slip through the cracks" and never get optimized.

That being said, the explorer in this app IS integral, so I'll go down this route to start off.

...more details involved but I'm thinking and deciding.
*/
function EXPLORER_setShow(shouldShow) {
	if (shouldShow && !EXPLORER_show) {
		let editorHackElement = document.getElementById('EDITOR_hack');
		EXPLORER_Element.style.width = '200px';
		EXPLORER_Element.style.visibility = '';
		editorHackElement.style.width = 'calc(100% - 200px)';
		EXPLORER_show = shouldShow;
		let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
		toggleShowExplorerButton.checked = EXPLORER_show;
		EDITOR_onResize();
	}
	else if (!shouldShow && EXPLORER_show) {
		// !show is redundant, but exists for readability.
		let editorHackElement = document.getElementById('EDITOR_hack');
		EXPLORER_Element.style.width = '0px';
		EXPLORER_Element.style.visibility = 'hidden';
		editorHackElement.style.width = '100%';
		EXPLORER_show = shouldShow;
		let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
		toggleShowExplorerButton.checked = EXPLORER_show;
		EDITOR_onResize();
	}
}

async function EXPLORER_openInEditor(absolutePath, shouldFocus) {
    const itHasBom = await window.myAPI.editorReadAllText(absolutePath);

    if (!itHasBom.text && itHasBom.text != '') {
        return;
    }

    EDITOR_setText(
        itHasBom.text,
        itHasBom.fileStartsWithBom,
        /*textSourceIdentifier*/ absolutePath,
        /*FORMATTED_textSourceIdentifier*/ itHasBom.formattedAbsolutePath,
        /*extensionKind*/ EDITOR_toExtensionKind(itHasBom.extension));
    if (shouldFocus) {
        let editor = document.getElementById('EDITOR');
        if (editor) {
            editor.focus();
        }
    }
}

async function EXPLORER_MenuOnClick(indexClicked, elementClicked) {
    const commandKind = elementClicked.dataset.commandKind;

    if (commandKind !== CommandKind.Cut & commandKind !== CommandKind.Paste) {
        EXPLORER_menuOptionCut_object = null;
    }

    switch (commandKind) {
        case CommandKind.Copy:
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                await window.myAPI.setClipboard('file:///' + entry.absolutePath);
            }
            break;
        case CommandKind.Cut:
            // they don't fully work but I'm not feeling overly interested in anything at the moment I wanna just lay down and do nothing so I'm pleased that I did something at all
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let text = 'file:///' + entry.absolutePath;
                EXPLORER_menuOptionCut_object = {
                    id: text,
                    indexItem: MENU_target.indexItem,
                    divRelativeIndex: MENU_target.divRelativeIndex
                };

                await window.myAPI.setClipboard(text);
            }
            break;
        case CommandKind.CopyAbsolutePath:
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                await window.myAPI.setClipboard(entry.absolutePath);
            }
            break;
        case CommandKind.Paste:
            {
                let local_EXPLORER_menuOptionCut_object = EXPLORER_menuOptionCut_object;
                EXPLORER_menuOptionCut_object = null;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let pasteResult = await window.myAPI.copyClipboardAbsolutePathToDirectory(entry.absolutePath, local_EXPLORER_menuOptionCut_object.id);
                if (pasteResult.success) {
                        /*
                        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

                        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
                        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
                        */

                        // TODO: I belive this final paste logic that comes after this comment and within this scope is extremely similar to the new file logic...

                        let isExpandable_isExpanded_enum;
                        if (pasteResult.isDirectory) {
                            isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;
                        }
                        else {
                            isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded;
                        }

                        let newIndexItem = MENU_target.indexItem + 1 + pasteResult.indexOf;
                        EXPLORER_director.flatList.insert(newIndexItem, isExpandable_isExpanded_enum, pasteResult.pathId, MENU_target.depth + 1);

                        if (EXPLORER_treeViewComponent.virtualCount > 0) {
                            let largestIndexItemBeingShown = EXPLORER_treeViewComponent.virtualIndex + (EXPLORER_treeViewComponent.virtualCount - 1);
                            if (newIndexItem >= EXPLORER_treeViewComponent.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                                let finalDiv = EXPLORER_treeViewComponent.itemListElement.children[EXPLORER_treeViewComponent.itemListElement.children.length - 1];

                                EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                                EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                                await EXPLORER_director.drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                                if (newIndexItem !== largestIndexItemBeingShown) {
                                    EXPLORER_treeViewComponent.itemListElement.insertBefore(finalDiv, EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex + 1 + pasteResult.indexOf]);
                                }
                            }

                            if (pasteResult.sourceFileWasDeleted) {
                                let id = local_EXPLORER_menuOptionCut_object.id;
                                let indexItem = local_EXPLORER_menuOptionCut_object.indexItem;
                                let divRelativeIndex = local_EXPLORER_menuOptionCut_object.divRelativeIndex;

                                // TODO: it isn't just about whether the cut-directory is in the virtualization result...
                                // ...if you paste below you could have some children of the cut-directory in view, but not the cut-directory itself.
    
                                // TODO: Just check indexItem (is easier to tell whether the insertion happened "above" the cut items position in the treeview)?
                                if (MENU_target.divRelativeIndex + 1 + pasteResult.indexOf >= local_EXPLORER_menuOptionCut_object.divRelativeIndex) {
                                    divRelativeIndex += 1;
                                    indexItem += 1;
                                }
    
                                if (divRelativeIndex <= largestIndexItemBeingShown) {

                                    let countOfMoreEntriesToShow = EXPLORER_director.getTotalCount() - (EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount);

                                    let countChanges;
                                    
                                    if (pasteResult.isDirectory) {
                                        countChanges = await EXPLORER_director.removeFromFlatList_async(indexItem);
                                    }
                                    else {
                                        EXPLORER_director.flatList.removeAt(indexItem, 1);
                                        countChanges = 1;
                                    }

                                    EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                                    EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                                    let remainingChangesToRender = countChanges < EXPLORER_treeViewComponent.virtualCount ? countChanges : EXPLORER_treeViewComponent.virtualCount - divRelativeIndex;

                                    if (countOfMoreEntriesToShow > remainingChangesToRender) {
                                        countOfMoreEntriesToShow = remainingChangesToRender;
                                    }

                                    for (let i = 0; i < remainingChangesToRender; i++) {
                                        let divItem = EXPLORER_treeViewComponent.itemListElement.children[divRelativeIndex];
                
                                        // TODO: if you remove including the eventual final div in the itemListElement then this moving of the div isn't accomplishing anything and could be skipped.
                                        EXPLORER_treeViewComponent.itemListElement.insertBefore(divItem, undefined);

                                        if (countOfMoreEntriesToShow <= 0) {
                                            await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - 1, /*isNull*/ true);
                                        }
                                        else {
                                            await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - (remainingChangesToRender - i), /*isNull*/ false);
                                            countOfMoreEntriesToShow--;
                                        }
                                    }
                                }
                            }
                        }

                    }
                break;
            }
        case CommandKind.NewFile_Directory:
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                WIDGET_show(WidgetKind.InputText, menuOptionX, menuOptionY, 'filename', async result => {
                    if (result.isCancelled) return;
                    let newFileResult = await window.myAPI.newFile(entry.absolutePath, result.value, /*isDirectory*/ true);
                    if (newFileResult.success) {
                        /*
                        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

                        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
                        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
                        */

                        // TODO: I belive this final new directory logic that comes after this comment and within this scope is 1 to 1 an exact duplication of the new file logic...
                        
                        let isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_isExpandable_NOTisExpanded;
                        let newIndexItem = MENU_target.indexItem + 1 + newFileResult.indexOf;
                        EXPLORER_director.flatList.insert(newIndexItem, isExpandable_isExpanded_enum, newFileResult.pathId, MENU_target.depth + 1);

                        if (EXPLORER_treeViewComponent.virtualCount > 0) {
                            let largestIndexItemBeingShown = EXPLORER_treeViewComponent.virtualIndex + (EXPLORER_treeViewComponent.virtualCount - 1);
                            if (newIndexItem >= EXPLORER_treeViewComponent.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                                let finalDiv = EXPLORER_treeViewComponent.itemListElement.children[EXPLORER_treeViewComponent.itemListElement.children.length - 1];

                                EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                                EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                                await EXPLORER_director.drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                                if (newIndexItem !== largestIndexItemBeingShown) {
                                    EXPLORER_treeViewComponent.itemListElement.insertBefore(finalDiv, EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex + 1 + newFileResult.indexOf]);
                                }
                            }
                        }
                    }
                });
                break;
            }
        case CommandKind.NewFile_File:
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                WIDGET_show(WidgetKind.InputText, menuOptionX, menuOptionY, 'filename', async result => {
                    if (result.isCancelled) return;
                    let newFileResult = await window.myAPI.newFile(entry.absolutePath, result.value, /*isDirectory*/ false);
                    if (newFileResult.success) {
                        /*
                        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

                        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
                        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
                        */

                        let isExpandable_isExpanded_enum = TrackedSyntaxKind.HACK_NOTisExpandable_NOTisExpanded;
                        let newIndexItem = MENU_target.indexItem + 1 + newFileResult.indexOf;
                        EXPLORER_director.flatList.insert(newIndexItem, isExpandable_isExpanded_enum, newFileResult.pathId, MENU_target.depth + 1);

                        if (EXPLORER_treeViewComponent.virtualCount > 0) {
                            let largestIndexItemBeingShown = EXPLORER_treeViewComponent.virtualIndex + (EXPLORER_treeViewComponent.virtualCount - 1);
                            if (newIndexItem >= EXPLORER_treeViewComponent.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                                let finalDiv = EXPLORER_treeViewComponent.itemListElement.children[EXPLORER_treeViewComponent.itemListElement.children.length - 1];

                                EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                                EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                                await EXPLORER_director.drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                                if (newIndexItem !== largestIndexItemBeingShown) {
                                    EXPLORER_treeViewComponent.itemListElement.insertBefore(finalDiv, EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex + 1 + newFileResult.indexOf]);
                                }
                            }
                        }
                    }
                });
                break;
            }
        case CommandKind.DeleteFile_Directory:
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_show(WidgetKind.YesCancel, menuOptionX, menuOptionY, 'delete ' + filename, async result => {
                    if (result.isCancelled) return;
                    let deleteFileResult = await window.myAPI.deleteFile(entry.absolutePath, /*isDirectory*/ true);
                    if (deleteFileResult) {
                        let countOfMoreEntriesToShow = EXPLORER_director.getTotalCount() - (EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount);

                        let countChanges = await EXPLORER_director.removeFromFlatList_async(MENU_target.indexItem);

                        EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                        EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                        let remainingChangesToRender = countChanges < EXPLORER_treeViewComponent.virtualCount ? countChanges : EXPLORER_treeViewComponent.virtualCount - MENU_target.divRelativeIndex;

                        if (countOfMoreEntriesToShow > remainingChangesToRender) {
                            countOfMoreEntriesToShow = remainingChangesToRender;
                        }

                        for (let i = 0; i < remainingChangesToRender; i++) {
                            let divItem = EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex];
    
                            // TODO: if you remove including the eventual final div in the itemListElement then this moving of the div isn't accomplishing anything and could be skipped.
                            EXPLORER_treeViewComponent.itemListElement.insertBefore(divItem, undefined);

                            if (countOfMoreEntriesToShow <= 0) {
                                await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - 1, /*isNull*/ true);
                            }
                            else {
                                await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - (remainingChangesToRender - i), /*isNull*/ false);
                                countOfMoreEntriesToShow--;
                            }
                        }
                    }
                });
                break;
            }
        case CommandKind.DeleteFile_File:
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_show(WidgetKind.YesCancel, menuOptionX, menuOptionY, 'delete ' + filename, async result => {
                    if (result.isCancelled) return;
                    let deleteFileResult = await window.myAPI.deleteFile(entry.absolutePath, /*isDirectory*/ false);
                    if (deleteFileResult) {
                        let noMoreEntriesToShow = EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount >= EXPLORER_director.getTotalCount();

                        EXPLORER_director.flatList.removeAt(MENU_target.indexItem, 1);

                        if (EXPLORER_treeViewComponent.virtualCount > 0) {
                            let divItem = EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex];

                            EXPLORER_treeViewComponent.itemHeightTotal = EXPLORER_director.getTotalCount() * EXPLORER_treeViewComponent.itemHeightNumber;
                            EXPLORER_treeViewComponent.virtualizationElement.style.height = EXPLORER_treeViewComponent.itemHeightTotal + 'px';

                            EXPLORER_treeViewComponent.itemListElement.insertBefore(divItem, undefined);
                            if (noMoreEntriesToShow) {
                                await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - 1, /*isNull*/ true);
                            }
                            else {
                                await EXPLORER_director.drawItem_async(divItem, EXPLORER_treeViewComponent.virtualIndex + EXPLORER_treeViewComponent.virtualCount - 1, /*isNull*/ false);
                            }
                        }
                    }
                });
                break;
            }
        case CommandKind.RenameFile_Directory:
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_show(WidgetKind.InputText, menuOptionX, menuOptionY, 'rename', async result => {
                    if (result.isCancelled) return;
                    let renameFileResult = await window.myAPI.renameFile(entry.absolutePath, result.value, /*isDirectory*/ true);
                    if (renameFileResult.success) {
                        await EXPLORER_director.setFlatListEntryId_async(MENU_target.indexItem, renameFileResult.pathId);
                        let divItem = EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex];
                        divItem.lastChild.nodeValue = result.value;
                    }
                });
                let input = document.getElementById('WIDGET_inputText');
                if (input) {
                    input.value = filename;
                }
                break;
            }
        case CommandKind.RenameFile_File:
            {
                /*
                Maybe the only difference between the _Directory and _File cases for each ..._...
                is the bool for isDirectory.

                But I'm exhausted and I cannot reduce the code duplication here because my head doesn't function.
                */

                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_show(WidgetKind.InputText, menuOptionX, menuOptionY, 'rename', async result => {
                    if (result.isCancelled) return;
                    let renameFileResult = await window.myAPI.renameFile(entry.absolutePath, result.value, /*isDirectory*/ false);
                    if (renameFileResult.success) {
                        await EXPLORER_director.setFlatListEntryId_async(MENU_target.indexItem, renameFileResult.pathId);
                        let divItem = EXPLORER_treeViewComponent.itemListElement.children[MENU_target.divRelativeIndex];
                        divItem.lastChild.nodeValue = result.value;
                    }
                });
                let input = document.getElementById('WIDGET_inputText');
                if (input) {
                    input.value = filename;
                }
                break;
            }
    }
}

/*EXPLORER_gotoParentNode(indexTarget, nodeElement, listElement) {
	if (nodeElement.children[0].innerText === EXPLORER_isExpandedText) {
        const depthTarget = EXPLORER_getDepth(nodeElement);

        let upperLimit = listElement.children.length;
        for (var i = indexTarget + 1; i < upperLimit; i++) {
            const iteration = listElement.children[i];
            const depthIteration = EXPLORER_getDepth(iteration);
            if (depthIteration <= depthTarget) break;

            // TODO: should the nodes be removed by a method that "does it all in one" or is deleting one by one fine due to the event loop not redrawing until "..."?

            // I don't want to loop backwards because at this current point there is no virtualization.
            // The distance you have to skip from the end is more complicated than just looping until you are back at the same depth or lower.
            listElement.removeChild(iteration);
            i--;
            upperLimit--;
        }

        nodeElement.children[0].innerText = EXPLORER_NOTisExpandedText;
    }
}*/
