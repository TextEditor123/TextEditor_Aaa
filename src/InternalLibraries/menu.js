let MENU_context = null;
let MENU_target = null;
let MENU_restoreFocusToElement = null;
let MENU_optionList = [];
let MENU_cursorIndex = 0;

const MENU_optionListElement = document.getElementById('MENU_optionList');

const CommandKind = {
  None: 0,
  Submenu: 1,
  Copy: 2,
  CopyAbsolutePath: 3,
  Cut: 4,
  Paste: 5,
  NewFile_Directory: 6,
  NewFile_File: 7,
  DeleteFile_Directory: 8,
  DeleteFile_File: 9,
  RenameFile_Directory: 10,
  RenameFile_File: 11,
  Find: 12,
};

/**
 * This needs to wrap the list.js?
 */
class MenuOption {
    commandKind = CommandKind.None;
    text = '';
    /**
     * If submenu is not null, the commandKind will be overriden to be CommandKind.Submenu
     * @type {MenuOption[]}
     */
    submenu = null;

    /**
     * @param {CommandKind.None} commandKind 
     * @param {string} text 
     * @param {MenuOption[]} submenu If submenu is not null, the commandKind will be overriden to be CommandKind.Submenu
     */
    constructor(commandKind, text, submenu) {
        this.commandKind = commandKind;
        this.text = text;
        if (submenu) {
            this.submenu = submenu;
        }
    }
}


/**
 * You probably want to use 'menuSet', not this method.
 * TODO: Why am I separating 'menuSet' and 'menuShow'?
 */
function menuShow() {
    const menu = document.getElementById('MENU');

    if (menu.style.visibility !== '') {
        menu.style.visibility = '';
    }
}

function menuHide(shouldRestoreFocus) {
    const menu = document.getElementById('MENU');
    const optionListElement = document.getElementById('MENU_optionList');
    if (menu.style.visibility !== 'hidden') {
        menu.style.visibility = 'hidden';
        optionListElement.innerHTML = '';
        recentBoundingClientRect = null;
        recentBoundingClientRect_ID++;

        if (MENU_restoreFocusToElement && shouldRestoreFocus)
            MENU_restoreFocusToElement.focus();
    }
}

/**
 * TODO: Why am I separating 'menuSet' and 'menuShow'?
 * @param {*} context 
 * @param {*} target 
 * @param {*} optionList 
 * @param {*} left 
 * @param {*} top 
 * @param {*} NOTshouldFocus 
 * @param {*} index 
 */
function menuSet(context, target, optionList, left, top, NOTshouldFocus, index) {

    if (!index) {
        index = 0;
        if (MENU_cursorIndex !== index) {
            MENU_setCursorIndex(index);
        }
    }

    recentBoundingClientRect = null;
    recentBoundingClientRect_ID++;

    MENU_context = context;
    MENU_target = target;
    MENU_optionList = optionList;

    // When rendering the menu, you need to preferably NOT use getBoundingClientRect
    // but instead have a cached value.
    //
    // And invalidate the cache under certain scenarios.
    //
    const menuElement = document.getElementById('MENU');
    const optionListElement = document.getElementById('MENU_optionList');
    
    menuShow();
    menuElement.style.left = left + 'px';
    menuElement.style.top = top + 'px';

    // TODO: make the explorer treeview a "component" and re-use much of the functionality here?
    optionListElement.innerHTML = '';

    for (var i = 0; i < MENU_optionList.length; i++) {
        const entry = MENU_optionList[i];
        const optionElement = document.createElement('div');
        optionElement.className = 'menuOption';
        optionElement.innerText = entry.text;

        if (entry.submenu) {
            optionElement.setAttribute("data-command-kind", CommandKind.Submenu);
            optionElement.innerText += '>';
        }
        else {
            optionElement.setAttribute("data-command-kind", entry.commandKind);
        }

        optionListElement.appendChild(optionElement);
    }

    MENU_restoreFocusToElement = document.activeElement;

    if (!NOTshouldFocus) {
        menuElement.focus();
    }
}

const menuElement = document.getElementById('MENU');

let recentBoundingClientRect = null;
let recentBoundingClientRect_ID = null;

let MENU_onMouseMove_timer = null;
let MENU_onMouseMove_event = null;

// Google AI Overview for "javascript is a const local function created recreated every invocation of the parent" paraphrased:
// ```
// Yes, in JavaScript, a function declared with const inside another function is re-created every time the parent function is called.
// Because it is a new scope, a fresh const identifier is created for each invocation, holding a new reference, even though the behavior remains the same.
// ```
//
// I think my worry is const is that it is making a "static" variable that always exists. It seems to be recreated everytime you get the scope.

function MENU_onMouseMove_WRAPIT(event) {
	const timeoutFunc = () => {
        if (/*trailing && lastArgs*/ MENU_onMouseMove_event) {
            MENU_onMouseMove(MENU_onMouseMove_event);
            MENU_onMouseMove_event = null;
            MENU_onMouseMove_timer = setTimeout(timeoutFunc, 90);
        } else {
            MENU_onMouseMove_timer = null;
        }
    };

	MENU_onMouseMove_event = event;
	
    if (!MENU_onMouseMove_timer) {
    	MENU_onMouseMove(event);
        MENU_onMouseMove_timer = setTimeout(timeoutFunc, 90);
    }
}

// TODO: I know this kinda is a mess but I'm all over the place right now and just trying to force some progress
function MENU_onMouseMove(event) {
	let local_recentBoundingClientRect_ID = recentBoundingClientRect_ID;
    if (local_recentBoundingClientRect_ID != recentBoundingClientRect_ID)
        return;
    if (!recentBoundingClientRect) {
        recentBoundingClientRect = MENU_optionListElement.getBoundingClientRect();
    }
    
    let { indexClicked, elementClicked } = menuGetRelativeMouseEventData(event, recentBoundingClientRect.top, MENU_optionListElement);
    MENU_setCursorIndex(indexClicked);
}

async function optionOnClick(indexClicked, elementClicked) {
    switch (MENU_context) {
        case 'EXPLORER':
            await EXPLORER_MenuOnClick(indexClicked, elementClicked);
            break;
        case 'EDITOR':
            await EDITOR_MenuOnClick(indexClicked, elementClicked);
            break;
    }
    menuHide(/*shouldRestoreFocus*/ true);
}

// padding, mouse events?

function menuGetRelativeMouseEventData(event, top) {
    let relativeY = event.clientY - top;
    let sumHeight = 4; // The menu 'padding-top: 4px'
    let indexClicked = -1;
    let elementClicked = null;

    for (var i = 0; i < MENU_optionListElement.children.length; i++) {
        let nodeElement = MENU_optionListElement.children[i];

        if ((sumHeight += nodeElement.clientHeight) >= relativeY) {
            elementClicked = nodeElement;
            indexClicked = i;
            break;
        }
    }

    return {
        indexClicked: indexClicked,
        elementClicked: elementClicked
    };
}

function MENU_init() {

    let menu = document.getElementById('MENU');

    menu.addEventListener('blur', () => {
        menuHide();
    });

    menu.addEventListener('click', async event => {
        let listBoundingClientRect = MENU_optionListElement.getBoundingClientRect();
        let { indexClicked, elementClicked } = menuGetRelativeMouseEventData(event, listBoundingClientRect.top);
        await optionOnClick(indexClicked, elementClicked);
    });
    
    menu.addEventListener('keydown', MENU_onKeyDown);

    menu.addEventListener('mousemove', MENU_onMouseMove_WRAPIT.bind(this));

    menuHide();
}

// submenus:
// =========
// Add salt to the "MENU" id specifically.
// Then all the inner elements can be specified by the hardcoded index that they reside at within the "MENU" element's child list.

function MENU_setCursorIndex(index) {
    const cursorElement = document.getElementById('MENU_cursor');
     // The menu 'padding-top: 4px'
    cursorElement.style.top = 4 + (APP_lineHeight * index) + 'px';
    MENU_cursorIndex = index;
}

function MENU_validateCursor() {
    if (MENU_cursorIndex >= MENU_optionListElement.children.length) {
        if (MENU_optionListElement.children.length > 0) {
            MENU_setCursorIndex(MENU_optionListElement.children.length - 1);
        }
        else {
            MENU_setCursorIndex(0);
        }
        return;
    }
    else if (MENU_cursorIndex < 0) {
        MENU_cursorIndex = 0;
    }
}

function MENU_onKeyDown(event) {
    MENU_validateCursor();
    if (MENU_optionListElement.children.length === 0) return;

    switch (event.key) {
        case 'ArrowDown':
            if (MENU_cursorIndex < MENU_optionListElement.children.length - 1) {
                MENU_setCursorIndex(MENU_cursorIndex + 1);
            }
            break;
        case 'ArrowUp':
            if (MENU_cursorIndex > 0) {
                MENU_setCursorIndex(MENU_cursorIndex - 1);
            }
            break;
        case 'Escape':
            menuHide(/*shouldRestoreFocus*/ true);
            break;
        case 'Enter':
        case ' ':
            return optionOnClick(MENU_cursorIndex, MENU_optionListElement.children[MENU_cursorIndex], MENU_optionListElement);
    }
}

// Is blur event guaranteed if you click something other than the menu?
//
// ... in my app it seems to be guaranteed.
// but you no longer eat the mousedown event...
//
/*function listenHandlerToCloseMenu(event) {
    if (event.target.id === 'MENU_virtualizationBoundary' ||
        event.target.id === 'MENU_cursor' ||
        event.target.id === 'MENU_optionList' ||
        event.target.className === 'menuOption') {

        return;
    }
    event.preventDefault();
    event.stopPropagation();
    menuHide();
}*/
/*
//let bodyElement = document.getElementById('ROOT');
//bodyElement.removeEventListener('mousedown', listenHandlerToCloseMenu, /*useCapturing*//* true);
*/
/*
// Is blur event guaranteed if you click something other than the menu?
//
// ... in my app it seems to be guaranteed.
// but you no longer eat the mousedown event...
//
//let bodyElement = document.getElementById('ROOT');
//bodyElement.addEventListener('mousedown', listenHandlerToCloseMenu, /*useCapturing*//* true);
*/
