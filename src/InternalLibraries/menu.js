let MENU_context = null;
let MENU_target = null;
let MENU_restoreFocusToElement = null;
let MENU_optionList = [];
let MENU_cursorIndex = 0;
let MENU_throttleMousemove = (...args) => {};

const MENU_optionListElement = document.getElementById('MENU_optionList');

const CommandKind = {
  None: "NONE",
  Submenu: "SUBMENU",
  Copy: "COPY",
  CopyAbsolutePath: "COPY_ABSOLUTE_PATH",
  Cut: "CUT",
  Paste: "PASTE",
  NewFile_Directory: "NewFile_Directory",
  NewFile_File: "NewFile_File",
  DeleteFile_Directory: "DeleteFile_Directory",
  DeleteFile_File: "DeleteFile_File",
  RenameFile_Directory: "RenameFile_Directory",
  RenameFile_File: "RenameFile_File",
  Find: "FIND",
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
    let menu = document.getElementById('MENU');

    if (menu.style.visibility !== '') {
        menu.style.visibility = '';
    }
}

function menuHide(shouldRestoreFocus) {
    let menu = document.getElementById('MENU');
    let optionListElement = document.getElementById('MENU_optionList');
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
    let menuElement = document.getElementById('MENU');
    let optionListElement = document.getElementById('MENU_optionList');
    
    menuShow();
    menuElement.style.left = left + 'px';
    menuElement.style.top = top + 'px';

    // TODO: make the explorer treeview a "component" and re-use much of the functionality here?
    optionListElement.innerHTML = '';

    for (var i = 0; i < MENU_optionList.length; i++) {
        let entry = MENU_optionList[i];
        let optionElement = document.createElement('div');
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

// TODO: I know this kinda is a mess but I'm all over the place right now and just trying to force some progress
function MENU_onMouseMove(event, local_recentBoundingClientRect_ID) {
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

function MENU_wrapOnMouseMove(event) {
    MENU_throttleMousemove(event, recentBoundingClientRect_ID);
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

    // Google AI overview for "javascript throttle trailing edge" generated the 'throttle(...)' function
    // ... I then asked how to invoke it and it gave me this:
    //
    // Using vanilla JS throttle with trailing edge support
    MENU_throttleMousemove = MENU_throttle(MENU_onMouseMove, 90, { leading: true, trailing: true });
    menu.addEventListener('mousemove', MENU_wrapOnMouseMove.bind(this));

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

/*
If an exception occurs, you need to set the throttle timer to null,
otherwise no further events will ever run, because it was left in a bad state.
*/
let MENU_restoreThrottle = () => {};

// Google AI overview for "javascript throttle trailing edge" generated this code:
function MENU_throttle(func, wait, options = { leading: false, trailing: true }) {
    let timer = null;
    let lastArgs;
    let context;

    MENU_restoreThrottle = () => {
        timer = null;
    };

    const timeoutFunc = () => {
        if (options.trailing && lastArgs) {
            func.apply(context, lastArgs);
            lastArgs = null;
            timer = setTimeout(timeoutFunc, wait);
        } else {
            timer = null;
        }
    };

    return function (...args) {
        context = this;
        lastArgs = args;

        if (!timer) {
            if (options.leading) {
                func.apply(context, args);
            }
            timer = setTimeout(timeoutFunc, wait);
        }
    };
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
