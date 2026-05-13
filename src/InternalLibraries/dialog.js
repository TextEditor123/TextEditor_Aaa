const DialogKind = {
    None: "None",
    FindAll: "FindAll",
    Settings: "Settings",
    DocumentSymbol: "DocumentSymbol",
    Debug: "Debug",
};

const DIALOG_element = document.getElementById('DIALOG');

let DIALOG_currentDialogKind = DialogKind.None;
let DIALOG_restoreFocusToElement = null;

let DIALOG_windowExists = false;

let DIALOG_hasBeenMeaasured = false;

/**
 * defaults to viewport size then getBoundingClientRect says the exact pixels upon trying to resize
 * need to track resizes and store the useragent width/height by the onmousedown and then on resize get proportion and update left top width height.
 */
let DIALOG_left = 0;
let DIALOG_top = 0;
let DIALOG_width = 0;
let DIALOG_height = 0;

let DIALOG_before_X = 0;
let DIALOG_before_Y = 0;

let DIALOG_after_X = 0;
let DIALOG_after_Y = 0;

let DIALOG_FindAll_options_matchWord = false;

let DIALOG_Settings_isDark = true;
let DIALOG_Settings_trueTabs_falseSpaces = true;
let DIALOG_Settings_editorDebugShowAdjacentCharacters = false;

const DIALOG_minTop = 8;
const DIALOG_minLeft = 8;
const DIALOG_minHeight = 100;
const DIALOG_minWidth = 100;

let DIALOG_onResizeAction = () => {};

async function DIALOG_show_async(dialogKind, onResizeAction) {
    if (DIALOG_currentDialogKind !== DialogKind.None) {
        await DIALOG_hide_async(true);
    }
    DIALOG_restoreFocusToElement = document.activeElement;
    DIALOG_currentDialogKind = dialogKind;
    DIALOG_onResizeAction = onResizeAction;

    DIALOG_element.style.visibility = '';

    DIALOG_createWindow();

    switch (dialogKind) {
        case DialogKind.FindAll:
            await DIALOG_FindAll_Create_async();
            break;
        case DialogKind.Settings:
            await DIALOG_Settings_Create_async();
            break;
        case DialogKind.DocumentSymbol:
            await DIALOG_DocumentSymbol_Create_async();
            break;
        case DialogKind.Debug:
            await DIALOG_Debug_Create_async();
            break;
    }
}

async function DIALOG_hide_async(shouldRestoreFocus) {
    switch (DIALOG_currentDialogKind) {
        case DialogKind.FindAll:
            await DIALOG_FindAll_Delete_async();
            break;
        case DialogKind.Settings:
            await DIALOG_Settings_Delete_async();
            break;
        case DialogKind.DocumentSymbol:
            await DIALOG_DocumentSymbol_Delete_async();
            break;
        case DialogKind.Debug:
            await DIALOG_Debug_Delete_async();
            break;
    }

    DIALOG_deleteWindow();

    // Don't do this...? if done correctly this won't be an issue. If someone had no events subscribed and wanted to do this themselves they can just do so
    // otherwise you risk memory leaks from unsubscribed events.
    //
    DIALOG_element.innerHTML = '';

    DIALOG_element.style.visibility = 'hidden';
    DIALOG_currentDialogKind = DialogKind.None;
    if (shouldRestoreFocus && DIALOG_restoreFocusToElement)
        DIALOG_restoreFocusToElement.focus();
}

async function DIALOG_closeButton_onclick() {
    await DIALOG_hide_async(true);
}

function DIALOG_resize_onmouseenter(event) {

    if (event.buttons & 1) {
        // while resizing you went from one end to the other and it bugged out
        return;
    }

    let resize = document.getElementById('DIALOG_resize');
    if (!resize) return;

    // TODO: cache the bounding client rect
    let dialogBoundingClientRect = DIALOG_element.getBoundingClientRect();

    DIALOG_resize_setCursor(event, dialogBoundingClientRect, resize);
}

/* body and the resize are siblings so the events can't propagate */

function DIALOG_resize_onmousedown(event) {
    let resize = document.getElementById('DIALOG_resize');
    if (!resize) return;

    // TODO: cache the bounding client rect
    let dialogBoundingClientRect = DIALOG_element.getBoundingClientRect();

    DIALOG_resize_setCursor(event, dialogBoundingClientRect, resize);

    DIALOG_before_X = event.clientX;
    DIALOG_before_Y = event.clientY;
    DIALOG_after_X = 0;
    DIALOG_after_Y = 0;

    DIALOG_left = dialogBoundingClientRect.left;
    DIALOG_top = dialogBoundingClientRect.top;
    DIALOG_width = dialogBoundingClientRect.width;
    DIALOG_height = dialogBoundingClientRect.height;
    DIALOG_hasBeenMeaasured = true;

    document.body.classList.add('unselectable');
    window.addEventListener('mousemove', DIALOG_resize_body_onmousemove, /*useCapture*/ true);
}

/** does not redraw, only preps the state to be redrawn */
function DIALOG_n_resize_calcOnly(diff_Y, clientY) {
    if (diff_Y < 0) {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_top <= DIALOG_minTop) {
            return; // TODO: ...
        }
        else if (DIALOG_top - absdiff_Y < DIALOG_minTop) {
            clientY += (absdiff_Y - (DIALOG_top - DIALOG_minTop));
            absdiff_Y = DIALOG_top - DIALOG_minTop;
        }
        DIALOG_top -= absdiff_Y;
        DIALOG_height += absdiff_Y;
        DIALOG_before_Y = clientY;
    }
    else {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_height <= DIALOG_minHeight) {
            return; // TODO: ...
        }
        else if (DIALOG_height - absdiff_Y < DIALOG_minHeight) {
            clientY -= (absdiff_Y - (DIALOG_height - DIALOG_minHeight));
            absdiff_Y = DIALOG_height - DIALOG_minHeight;
        }
        DIALOG_height -= absdiff_Y;
        DIALOG_top += absdiff_Y;
        DIALOG_before_Y = clientY;
    }
}

/** does not redraw, only preps the state to be redrawn */
function DIALOG_e_resize_calcOnly(diff_X, clientX) {
    if (diff_X < 0) {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_width <= DIALOG_minWidth) {
            return; // TODO: ...
        }
        else if (DIALOG_width - absdiff_X < DIALOG_minWidth) {
            clientX += (absdiff_X - (DIALOG_width - DIALOG_minWidth));
            absdiff_X = DIALOG_width - DIALOG_minWidth;
        }
        DIALOG_width -= absdiff_X;
        DIALOG_before_X = clientX;
    }
    else {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_left + DIALOG_width + 8 >= window.innerWidth) {
            return; // TODO: ...
        }
        else if (DIALOG_left + DIALOG_width + 8 + absdiff_X > window.innerWidth) {
            let DIALOG_maxWidth = window.innerWidth - 8 - DIALOG_left;
            clientX -= (absdiff_X - (DIALOG_maxWidth - DIALOG_width));
            absdiff_X = DIALOG_maxWidth - DIALOG_width;
        }
        DIALOG_width += absdiff_X;
        DIALOG_before_X = clientX;
    }
}

/** does not redraw, only preps the state to be redrawn */
function DIALOG_s_resize_calcOnly(diff_Y, clientY) {
    if (diff_Y < 0) {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_height <= DIALOG_minHeight) {
            return; // TODO: ...
        }
        else if (DIALOG_height - absdiff_Y < DIALOG_minHeight) {
            // tighten in the other direction because overshoot
            clientY += (absdiff_Y - (DIALOG_height - DIALOG_minHeight));
            absdiff_Y = DIALOG_height - DIALOG_minHeight;
        }
        DIALOG_height -= absdiff_Y;
        DIALOG_before_Y = clientY;
    }
    else {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_top + 8 + DIALOG_height >= window.innerHeight) {
            return; // TODO: ...
        }
        else if (DIALOG_top + 8 + DIALOG_height + absdiff_Y > window.innerHeight) {
            // tighten in the other direction because overshoot
            // -8 is the hardcoded pixel size that the resize element overhangs the dialog.
            let DIALOG_maxHeight = window.innerHeight - 8 - DIALOG_top;
            clientY -= (absdiff_Y - (DIALOG_maxHeight - DIALOG_height));
            absdiff_Y = DIALOG_maxHeight - DIALOG_height;
        }
        DIALOG_height += absdiff_Y;
        DIALOG_before_Y = clientY;
    }
}

/** does not redraw, only preps the state to be redrawn */
function DIALOG_w_resize_calcOnly(diff_X, clientX) {
    if (diff_X < 0) {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_left <= DIALOG_minLeft) {
            return; // TODO: ...
        }
        else if (DIALOG_left - absdiff_X < DIALOG_minLeft) {
            clientX += (absdiff_X - (DIALOG_left - DIALOG_minLeft));
            absdiff_X = DIALOG_left - DIALOG_minLeft;
        }
        DIALOG_width += absdiff_X;
        DIALOG_left -= absdiff_X;
        DIALOG_before_X = clientX;
    }
    else {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_width <= DIALOG_minWidth) {
            return; // TODO: ...
        }
        else if (DIALOG_width - absdiff_X < DIALOG_minWidth) {
            clientX += (absdiff_X - (DIALOG_width - DIALOG_minWidth));
            absdiff_X = DIALOG_width - DIALOG_minWidth;
        }
        DIALOG_width -= absdiff_X;
        DIALOG_left += absdiff_X;
        DIALOG_before_X = clientX;
    }
}

function DIALOG_resize_body_onmousemove(event) {

    let resize = document.getElementById('DIALOG_resize');
    if (!resize) return;

    if (event.buttons & 1) {
        // TODO: I literally can't even right now with this empty if statement
    }
    else {
        document.body.classList.remove('unselectable');
        window.removeEventListener('mousemove', DIALOG_resize_body_onmousemove, /*useCapture*/ true);
        if (DIALOG_onResizeAction) DIALOG_onResizeAction();
        return;
    }

    let diff_X = event.clientX - DIALOG_before_X;
    let diff_Y = event.clientY - DIALOG_before_Y;

    if (diff_Y > -1 && diff_Y < 1) diff_Y = 0;
    if (diff_X > -1 && diff_X < 1) diff_X = 0;

    if (diff_X === 0 && diff_Y === 0) {
        return;
    }

    let clientX = event.clientX;
    let clientY = event.clientY;

    switch (resize.style.cursor) {
        case 'nw-resize':
            DIALOG_n_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            DIALOG_element.style.top = DIALOG_top + 'px';
            DIALOG_w_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            DIALOG_element.style.left = DIALOG_left + 'px';
            break;
        case 'w-resize':
            DIALOG_w_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            DIALOG_element.style.left = DIALOG_left + 'px';
            break;
        case 'sw-resize':
            DIALOG_s_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            DIALOG_w_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            DIALOG_element.style.left = DIALOG_left + 'px';
            break;
        case 'n-resize':
            DIALOG_n_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            DIALOG_element.style.top = DIALOG_top + 'px';
            break;
        case 's-resize':
            DIALOG_s_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            break;
        case 'ne-resize':
            DIALOG_n_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            DIALOG_element.style.top = DIALOG_top + 'px';
            DIALOG_e_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            break;
        case 'e-resize':
            DIALOG_e_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            break;
        case 'se-resize':
            DIALOG_s_resize_calcOnly(diff_Y, clientY);
            DIALOG_element.style.height = DIALOG_height + 'px';
            DIALOG_e_resize_calcOnly(diff_X, clientX);
            DIALOG_element.style.width = DIALOG_width + 'px';
            break;
    }
}

function DIALOG_resize_setCursor(event, dialogBoundingClientRect, resize) {
    let rX = event.clientX - dialogBoundingClientRect.left;
    let rY = event.clientY - dialogBoundingClientRect.top;
    // left to right
    //     top to bottom
    if (rX < 0) {
        if (rY < 0) {
            resize.style.cursor = 'nw-resize';
        }
        else if (event.clientY < dialogBoundingClientRect.top + dialogBoundingClientRect.height) {
            resize.style.cursor = 'w-resize';
        }
        else {
            resize.style.cursor = 'sw-resize';
        }
    }
    else if (event.clientX < dialogBoundingClientRect.left + dialogBoundingClientRect.width) {
        if (rY < 0) {
            resize.style.cursor = 'n-resize';
        }
        else if (event.clientY < dialogBoundingClientRect.top + dialogBoundingClientRect.height) {
            //resize.style.cursor = 'ns-resize';
        }
        else {
            resize.style.cursor = 's-resize';
        }
    }
    else {
        if (rY < 0) {
            resize.style.cursor = 'ne-resize';
        }
        else if (event.clientY < dialogBoundingClientRect.top + dialogBoundingClientRect.height) {
            resize.style.cursor = 'e-resize';
        }
        else {
            resize.style.cursor = 'se-resize';
        }
    }
}

/** This is the wellknown JS window object: 'window.addEventListener...' not to be confused with what I call the "window" of the dialog. */
function DIALOG_window_onresize() {
    if (!DIALOG_hasBeenMeaasured) return;

    // Max width and min width depend on the left/top so they need to come first.
    if (DIALOG_left <= DIALOG_minLeft) {
        DIALOG_left = DIALOG_minLeft;
        DIALOG_element.style.left = DIALOG_left + 'px';
    }
    if (DIALOG_top <= DIALOG_minTop) {
        DIALOG_top = DIALOG_minTop;
        DIALOG_element.style.top = DIALOG_top + 'px';
    }

    if (DIALOG_height <= DIALOG_minHeight) {
        DIALOG_height = DIALOG_minHeight;
        DIALOG_element.style.height = DIALOG_height + 'px';
    }
    else if (DIALOG_height + DIALOG_top + 8 >= window.innerHeight) {
        DIALOG_height = window.innerHeight - 8 - DIALOG_top;
        DIALOG_element.style.height = DIALOG_height + 'px';
    }

    if (DIALOG_width <= DIALOG_minWidth) {
        DIALOG_width = DIALOG_minWidth;
        DIALOG_element.style.width = DIALOG_width + 'px';
    }	
    else if (DIALOG_left + DIALOG_width + 8 >= window.innerWidth) {
        DIALOG_width = window.innerWidth - 8 - DIALOG_left;
        DIALOG_element.style.width = DIALOG_width + 'px';
    }
}

function DIALOG_toolbar_body_onmousemove(event) {

    let resize = document.getElementById('DIALOG_resize');
    if (!resize) return;

    if (event.buttons & 1) {
        // TODO: I literally can't even right now with this empty if statement
    }
    else {
        document.body.classList.remove('unselectable');
        window.removeEventListener('mousemove', DIALOG_toolbar_body_onmousemove, /*useCapture*/ true);
        if (DIALOG_onResizeAction) DIALOG_onResizeAction();
        return;
    }

    let diff_X = event.clientX - DIALOG_before_X;
    let diff_Y = event.clientY - DIALOG_before_Y;

    if (diff_Y > -1 && diff_Y < 1) diff_Y = 0;
    if (diff_X > -1 && diff_X < 1) diff_X = 0;

    if (diff_X === 0 && diff_Y === 0) {
        return;
    }

    let clientX = event.clientX;
    let clientY = event.clientY;

    if (diff_X < 0) {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_left <= DIALOG_minLeft) {
            //return; // TODO: ...
        }
        else if (DIALOG_left - absdiff_X < DIALOG_minLeft) {
            clientX += (absdiff_X - (DIALOG_left - DIALOG_minLeft));
            absdiff_X = DIALOG_left - DIALOG_minLeft;

            DIALOG_left -= absdiff_X;
            DIALOG_before_X = clientX;
            DIALOG_element.style.left = DIALOG_left + 'px';
        }
        else {
            DIALOG_left -= absdiff_X;
            DIALOG_before_X = clientX;
            DIALOG_element.style.left = DIALOG_left + 'px';
        }
    }
    else if (diff_X > 0) {
        let absdiff_X = Math.abs(diff_X);
        if (DIALOG_left + DIALOG_width + 8 >= window.innerWidth) {
            //return; // TODO: ...
        }
        else if (DIALOG_left + DIALOG_width + 8 + absdiff_X > window.innerWidth) {
            let DIALOG_maxLeft = window.innerWidth - 8 - DIALOG_width;
            clientX -= (absdiff_X - (DIALOG_maxLeft - DIALOG_left));
            absdiff_X = DIALOG_maxLeft - DIALOG_left;

            DIALOG_left += absdiff_X;
            DIALOG_before_X = clientX;
            DIALOG_element.style.left = DIALOG_left + 'px';
        }
        else {
            DIALOG_left += absdiff_X;
            DIALOG_before_X = clientX;
            DIALOG_element.style.left = DIALOG_left + 'px';
        }
    }

    if (diff_Y < 0) {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_top <= DIALOG_minTop) {
            //return; // TODO: ...
        }
        else if (DIALOG_top - absdiff_Y < DIALOG_minTop) {
            clientY += (absdiff_Y - (DIALOG_top - DIALOG_minTop));
            absdiff_Y = DIALOG_top - DIALOG_minTop;
            
            DIALOG_top -= absdiff_Y;
            DIALOG_before_Y = clientY;
            DIALOG_element.style.top = DIALOG_top + 'px';
        }
        else {
            DIALOG_top -= absdiff_Y;
            DIALOG_before_Y = clientY;
            DIALOG_element.style.top = DIALOG_top + 'px';
        }
    }
    else if (diff_Y > 0) {
        let absdiff_Y = Math.abs(diff_Y);
        if (DIALOG_top + 8 + DIALOG_height >= window.innerHeight) {
            //return; // TODO: ...
        }
        else if (DIALOG_top + 8 + DIALOG_height + absdiff_Y > window.innerHeight) {
            let DIALOG_maxTop = window.innerHeight - 8 - DIALOG_height;
            clientY -= (absdiff_Y - (DIALOG_maxTop - DIALOG_top));
            absdiff_Y = DIALOG_maxTop - DIALOG_top;
            
            DIALOG_top += absdiff_Y;
            DIALOG_before_Y = clientY;
            DIALOG_element.style.top = DIALOG_top + 'px';
        }
        else {
            DIALOG_top += absdiff_Y;
            DIALOG_before_Y = clientY;
            DIALOG_element.style.top = DIALOG_top + 'px';
        }
    }
}

function DIALOG_toolbar_onmousedown(event) {
    let resize = document.getElementById('DIALOG_toolbar');
    if (!resize) return;

    // TODO: cache the bounding client rect
    let dialogBoundingClientRect = DIALOG_element.getBoundingClientRect();

    DIALOG_before_X = event.clientX;
    DIALOG_before_Y = event.clientY;
    DIALOG_after_X = 0;
    DIALOG_after_Y = 0;

    DIALOG_left = dialogBoundingClientRect.left;
    DIALOG_top = dialogBoundingClientRect.top;
    DIALOG_width = dialogBoundingClientRect.width;
    DIALOG_height = dialogBoundingClientRect.height;
    DIALOG_hasBeenMeaasured = true;

    document.body.classList.add('unselectable');
    window.addEventListener('mousemove', DIALOG_toolbar_body_onmousemove, /*useCapture*/ true);
}

/**
 * Window is the title bar, maximize, minimize, close etc...
 */
function DIALOG_createWindow() {
    // TODO: Might want to check if the HTML element exists instead.
    if (DIALOG_windowExists) return;
    DIALOG_windowExists = true;

    let toolbar = document.createElement('div');
    toolbar.id = 'DIALOG_toolbar';
    let body = document.createElement('div');
    body.id = 'DIALOG_body';
    let resize = document.createElement('div');
    resize.id = 'DIALOG_resize';

    toolbar.addEventListener('mousedown', DIALOG_toolbar_onmousedown);

    resize.addEventListener('mouseenter', DIALOG_resize_onmouseenter);
    resize.addEventListener('mousedown', DIALOG_resize_onmousedown);
    window.addEventListener('resize', DIALOG_window_onresize);

    DIALOG_element.appendChild(resize);
    DIALOG_element.appendChild(toolbar);
    DIALOG_element.appendChild(body);

    // TODO: You have to actually make sure the text fits
    toolbar.innerText = DIALOG_currentDialogKind;

    let closeButton = document.createElement('button');
    closeButton.innerText = 'x';
    closeButton.id = 'DIALOG_closeButton';

    closeButton.addEventListener('click', DIALOG_closeButton_onclick);

    toolbar.appendChild(closeButton);

    closeButton.focus();
}

/**
 * Window is the title bar, maximize, minimize, close etc...
 */
function DIALOG_deleteWindow() {
    // TODO: Might want to check if the HTML element exists instead.
    if (!DIALOG_windowExists) return;
    // TODO: Perhaps move these respective sets to the end of their functions.
    // This way them being set as a certain value reflects that the entirety of their respective code had been ran but then again... idk
    DIALOG_windowExists = false;

    DIALOG_left = 0;
    DIALOG_top = 0;
    DIALOG_width = 0;
    DIALOG_height = 0;

    DIALOG_before_X = 0;
    DIALOG_before_Y = 0;
    DIALOG_after_X = 0;
    DIALOG_after_Y = 0;

    let toolbar = document.getElementById('DIALOG_toolbar');
    toolbar.removeEventListener('mousedown', DIALOG_toolbar_onmousedown);

    document.body.classList.remove('unselectable');
    window.removeEventListener('mousemove', DIALOG_resize_body_onmousemove, /*useCapture*/ true);
    window.removeEventListener('mousemove', DIALOG_toolbar_body_onmousemove, /*useCapture*/ true);
    if (DIALOG_onResizeAction) DIALOG_onResizeAction();

    window.removeEventListener('resize', DIALOG_window_onresize);

    let resize = document.getElementById('DIALOG_resize');
    resize.removeEventListener('mouseenter', DIALOG_resize_onmouseenter);
    resize.removeEventListener('mousedown', DIALOG_resize_onmousedown);

    let closeButton = document.getElementById('DIALOG_closeButton');
    closeButton.removeEventListener('click', DIALOG_closeButton_onclick);

    DIALOG_element.innerHTML = '';
}

async function DIALOG_FindAll_Create_async() {
    let dialogBody = document.getElementById('DIALOG_body');

    let searchTextInput = document.createElement('input');
    searchTextInput.type = "text";
    searchTextInput.placeholder = 'find all';
    searchTextInput.id = 'DIALOG_FindAll_searchTextInput';
    searchTextInput.style.marginLeft = '5px';
    searchTextInput.style.marginTop = '5px';
    searchTextInput.style.height = 'var(--APP-line-height)';
    searchTextInput.addEventListener('keydown', DIALOG_FindAll_searchTextInput_onkeydown);
    dialogBody.appendChild(searchTextInput);
    searchTextInput.focus();
    
    let divOptions = document.createElement('div');
    divOptions.style.height = 'var(--APP-line-height)';
    divOptions.style.whiteSpace = 'nowrap';
    let checkboxMatchWord = document.createElement('input');
    checkboxMatchWord.type = 'checkbox';
    checkboxMatchWord.id = 'DIALOG_FindAll_checkboxMatchWord';
    checkboxMatchWord.checked = DIALOG_FindAll_options_matchWord;
    checkboxMatchWord.addEventListener('change', DIALOG_FindAll_checkboxMatchWord_onchange);
    divOptions.appendChild(checkboxMatchWord);
    let label_for_checkboxMatchWord = document.createElement('label');
    label_for_checkboxMatchWord.htmlFor = 'DIALOG_FindAll_checkboxMatchWord';
    label_for_checkboxMatchWord.textContent = 'matchWord ';
    divOptions.appendChild(label_for_checkboxMatchWord);
    // TODO: The dialog body doesn't currently have an overflow scrollbar, so this will just clip if text goes offscreen due to...
    // ...the encompassing div having 'white-space: nowrap' style.
    // But this behavior is contrary to the ctrl+f. So I wanted to note it in some way with some immediacy before I continued.
    let spanNotes = document.createElement('span');
    spanNotes.id = 'DIALOG_FindAll_spanNotes';
    spanNotes.className = 'eC';
    divOptions.appendChild(spanNotes);
    dialogBody.appendChild(divOptions);

    let searchResultsDiv = document.createElement('div');
    searchResultsDiv.id = 'DIALOG_FindAll_searchResultsDiv';
    dialogBody.appendChild(searchResultsDiv);
    searchResultsDiv.addEventListener('click', DIALOG_FindAll_searchResult_onclick);
}

async function DIALOG_FindAll_Delete_async() {
    let searchTextInput = document.getElementById('DIALOG_FindAll_searchTextInput');
    if (searchTextInput) {
        searchTextInput.removeEventListener('keydown', DIALOG_FindAll_searchTextInput_onkeydown);
    }
    
    let checkboxMatchWord = document.getElementById('DIALOG_FindAll_checkboxMatchWord');
    if (checkboxMatchWord) {
    	checkboxMatchWord.removeEventListener('change', DIALOG_FindAll_checkboxMatchWord_onchange);
    }

    let searchResultsDiv = document.getElementById('DIALOG_FindAll_searchResultsDiv');
    if (searchResultsDiv) {
        searchResultsDiv.removeEventListener('click', DIALOG_FindAll_searchResult_onclick);
    }
}

async function DIALOG_FindAll_searchTextInput_onkeydown(event) {
    if (event.key === 'Enter') {

        let dialogBody = document.getElementById('DIALOG_body');
        if (!dialogBody) return;

        let searchResultsDiv = document.getElementById('DIALOG_FindAll_searchResultsDiv');
        if (!searchResultsDiv) return;

        let searchTextInput = document.getElementById('DIALOG_FindAll_searchTextInput');
        if (!searchTextInput) return;
        
        let spanNotes = document.getElementById('DIALOG_FindAll_spanNotes');
	    if (spanNotes) {
	        spanNotes.innerText = '';
	    }

        searchResultsDiv.innerHTML = '';

        let search = searchTextInput.value;
        if (!search) {
            return;
        }

        let results = await window.myAPI.findAll(search, DIALOG_FindAll_options_matchWord);

        for (var i = 0; i < results.length; i++) {
            let item = results[i];
            let div = document.createElement('div');
            let span = document.createElement('span');
            span.innerText = '+';
            
            div.innerText = item.filename + '(' + item.count + ')';
            div.appendChild(span);
            div.title = item.absolutePath;

            // TODO: (speculation) I've never liked saying "line height" I believe that deals with the vertical alignment of text within some container...
            // ...is "line height" a good wording.

            div.className = 'FINDALL_lineHeight';
            searchResultsDiv.appendChild(div);
        }
    }
}

function DIALOG_FindAll_checkboxMatchWord_onchange() {
	// for an onchange event, event.target might always be precise?
	let checkboxMatchWord = document.getElementById('DIALOG_FindAll_checkboxMatchWord');
    if (checkboxMatchWord) {
    	DIALOG_FindAll_options_matchWord = checkboxMatchWord.checked;
    	let spanNotes = document.getElementById('DIALOG_FindAll_spanNotes');
	    if (spanNotes) {
	        spanNotes.innerText = 'NOTE: changing \'matchWord\' here does not re-do the search';
	    }
    }
}

async function DIALOG_FindAll_searchResult_onclick(event) {
    // TODO: Investigate "componentizing" the code so you don't have to rewrite the same UI a hundred times.

    let searchResultsDiv = document.getElementById('DIALOG_FindAll_searchResultsDiv');

    // TODO: Store recent bounding client rect, resize user agent then sets this recent bounding client rect to null...
    // ...check here if it is null, if so getBoundingClientRect because this function causes layout/reflow (I'm not overly certain on what word I'm looking for).
    //
    // (perhaps this scenario is negligible enough I'm not sure)
    // (I personally lean towards this NOT being negligible enough, I just have other things I need to do at this very moment)
    //
    let boundingClientRect = searchResultsDiv.getBoundingClientRect();
    let relativeY = event.clientY - boundingClientRect.top + searchResultsDiv.scrollTop;
    let yIndex = Math.floor(relativeY / APP_lineHeight);

    if (yIndex > searchResultsDiv.children.length) return;

    let element = searchResultsDiv.children[yIndex];

    if (element.style.marginLeft === '24px') {
        await position_pseudoonclick(element, searchResultsDiv, yIndex);
    }
    else {
        await searchResultElement_pseudoonclick(element, searchResultsDiv, yIndex);
    }
}

async function searchResultElement_pseudoonclick(element, searchResultsDiv, yIndex) {
    if (element.children.length === 0) return;

    if (element.children[0].innerText === '/' || element.children[0].innerText !== '+') {
        // already expanded, I'm not gonna write collapse right now so return.
        return;
    }

    if (!element.title) {
        return;
    }

    element.children[0].innerText = '/';

    let searchTextInput = document.getElementById('DIALOG_FindAll_searchTextInput');
    if (!searchTextInput) return;

    let results = await window.myAPI.findAllGetPositions(element.title, searchTextInput.value, DIALOG_FindAll_options_matchWord);
    if (!results) {
        return;
    }

    // For some reason the results are descending if I iterate forwards, thus reverse iteration.
    for (var i = results.length - 1; i >= 0; i--) {
        let div = document.createElement('div');
        div.innerText = results[i];
        div.className = 'FINDALL_lineHeight';
        div.style.marginLeft = '24px';
        // yIndex + 1 is undefined if > length and this adds to the end in that case
        searchResultsDiv.insertBefore(div, searchResultsDiv.children[yIndex + 1]);
    }
}

async function position_pseudoonclick(element, searchResultsDiv, yIndex) {
    const intValue = parseInt(element.innerText, 10);
    let absolutePath = null;

    for (var i = yIndex - 1; i >= 0; i--) {
        if (searchResultsDiv.children[i].marginLeft !== '24px') {
            // find the first non-indented UI element, that is the parent of the clicked
            absolutePath = searchResultsDiv.children[i].title;
            break;
        }
    }

    if (!absolutePath) {
        return;
    }
    
    await EXPLORER_openInEditor(absolutePath, /*shouldFocus*/ true);
    
    // It was wrong cuz of all the '\0\0\0\t' or something?
    if (intValue > EDITOR_textByteList.count) {
        return;
    }

    EDITOR_moveCursor_position(intValue);
}

async function DIALOG_Settings_Create_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;

    let buttonTheme = document.createElement('button');
    buttonTheme.id = 'SETTINGS_theme';
    buttonTheme.innerText = 'Theme';
    buttonTheme.addEventListener('click', DIALOG_buttonTheme_onclick);
    dialogBody.appendChild(buttonTheme);

    let checkboxTrueTabsFalseSpaces = document.createElement('input');
    checkboxTrueTabsFalseSpaces.type = 'checkbox';
    checkboxTrueTabsFalseSpaces.id = 'SETTINGS_trueTabs_falseSpaces';
    checkboxTrueTabsFalseSpaces.checked = DIALOG_Settings_trueTabs_falseSpaces; // Optional: sets the initial state to checked
    checkboxTrueTabsFalseSpaces.addEventListener('change', DIALOG_checkboxTrueTabsFalseSpaces_onchange);
    dialogBody.appendChild(checkboxTrueTabsFalseSpaces);
	// -----------------------------------------------------------
    let label_for_checkboxTrueTabsFalseSpaces = document.createElement('label');
    label_for_checkboxTrueTabsFalseSpaces.htmlFor = 'SETTINGS_trueTabs_falseSpaces';
    label_for_checkboxTrueTabsFalseSpaces.textContent = 'trueTabs_falseSpaces';
    dialogBody.appendChild(label_for_checkboxTrueTabsFalseSpaces);
    
    let checkboxEditorDebugShowAdjacentCharacters = document.createElement('input');
    checkboxEditorDebugShowAdjacentCharacters.type = 'checkbox';
    checkboxEditorDebugShowAdjacentCharacters.id = 'SETTINGS_editorDebugShowAdjacentCharacters';
    checkboxEditorDebugShowAdjacentCharacters.checked = DIALOG_Settings_editorDebugShowAdjacentCharacters; // Optional: sets the initial state to checked
    checkboxEditorDebugShowAdjacentCharacters.addEventListener('change', DIALOG_checkboxEditorDebugShowAdjacentCharacters_onchange);
    dialogBody.appendChild(checkboxEditorDebugShowAdjacentCharacters);
	// -----------------------------------------------------------
    let label_for_checkboxEditorDebugShowAdjacentCharacters = document.createElement('label');
    label_for_checkboxEditorDebugShowAdjacentCharacters.htmlFor = 'SETTINGS_editorDebugShowAdjacentCharacters';
    label_for_checkboxEditorDebugShowAdjacentCharacters.textContent = 'editorDebugShowAdjacentCharacters';
    dialogBody.appendChild(label_for_checkboxEditorDebugShowAdjacentCharacters);
}

async function DIALOG_Settings_Delete_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;
    
    let buttonTheme = document.getElementById('SETTINGS_theme');
    if (buttonTheme) {
        buttonTheme.removeEventListener('click', DIALOG_buttonTheme_onclick);
    }

    let checkboxTrueTabsFalseSpaces = document.getElementById('SETTINGS_trueTabs_falseSpaces');
    if (checkboxTrueTabsFalseSpaces) {
        checkboxTrueTabsFalseSpaces.removeEventListener('change', DIALOG_checkboxTrueTabsFalseSpaces_onchange);
    }
    
    let checkboxEditorDebugShowAdjacentCharacters = document.getElementById('SETTINGS_editorDebugShowAdjacentCharacters');
    if (checkboxEditorDebugShowAdjacentCharacters) {
    	checkboxEditorDebugShowAdjacentCharacters.removeEventListener('change', DIALOG_checkboxEditorDebugShowAdjacentCharacters_onchange);
    }
}

function DIALOG_buttonTheme_onclick() {
    if (DIALOG_Settings_isDark) {
        DIALOG_Settings_isDark = false;
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
    else {
        DIALOG_Settings_isDark = true;
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
}

function DIALOG_checkboxTrueTabsFalseSpaces_onchange() {
    let checkboxTrueTabsFalseSpaces = document.getElementById('SETTINGS_trueTabs_falseSpaces');
    if (!checkboxTrueTabsFalseSpaces) return;

    DIALOG_Settings_trueTabs_falseSpaces = checkboxTrueTabsFalseSpaces.checked;
    if (DIALOG_Settings_trueTabs_falseSpaces) {
        EDITOR_on_tab_bytes = EDITOR_tab_tabsbytes;
    }
    else {
        EDITOR_on_tab_bytes = EDITOR_tab_spacesbytes;
    }
}

function DIALOG_checkboxEditorDebugShowAdjacentCharacters_onchange() {
    let checkboxEditorDebugShowAdjacentCharacters = document.getElementById('SETTINGS_editorDebugShowAdjacentCharacters');
    if (!checkboxEditorDebugShowAdjacentCharacters) return;

    DIALOG_Settings_editorDebugShowAdjacentCharacters = checkboxEditorDebugShowAdjacentCharacters.checked;
    EDITOR_drawCursor(EDITOR_primaryCursor);
}

async function DIALOG_DocumentSymbol_Create_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;

    if (EDITOR_documentSymbolResult) {
        let div = document.createElement('div');
        div.innerText = 'EDITOR_documentSymbolResult.length: ' + EDITOR_documentSymbolResult.length;
        div.style.height = APP_lineHeight + 'px';
        div.style.whiteSpace = 'nowrap';
        dialogBody.appendChild(div);
        EDITOR_listComponent.rootElement.style.height = `calc(100% - ${div.style.height})`;
        EDITOR_listComponent.draw_create(dialogBody, null);
    }
    else {
        dialogBody.innerText = 'EDITOR_documentSymbolResult is falsey';
    }
}

async function DIALOG_DocumentSymbol_Delete_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;
    EDITOR_listComponent.draw_delete();
}

async function DIALOG_Debug_Create_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;
    
    //EXPLORER_treeViewComponent.setItems(EXPLORER_director, APP_lineHeight, APP_lineHeight + 'px');
    
    // you were missing an await here the entire time?
    // EXPLORER_treeViewComponent.draw_create_async(dialogBody, null);
}

async function DIALOG_Debug_Delete_async() {
    let dialogBody = document.getElementById('DIALOG_body');
    if (!dialogBody) return;

    EXPLORER_treeViewComponent.draw_delete();
}
