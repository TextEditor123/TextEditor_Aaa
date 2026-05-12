
const WidgetKind = {
    None: 'None',
    InputText: 'InputText',
    YesCancel: 'YesCancel',
};

let WIDGET_currentWidgetKind = WidgetKind.None;
let WIDGET_currentCallback = async ({ isCancelled = false, value = '' }) => {};
let WIDGET_restoreFocusToElement = null;
let WIDGET_left = 0;
let WIDGET_top = 0;

const WIDGET_element = document.getElementById('WIDGET');
WIDGET_element.style.visibility = 'hidden';

// You aren't focusing the widget element itself so blur likely won't work.
//WIDGET_element.addEventListener('focusout', () => WIDGET_hide());

function WIDGET_show(widgetKind, left, top, placeholder, callback) {
    if (WIDGET_currentWidgetKind !== WidgetKind.None) {
        WIDGET_hide(true);
    }
    WIDGET_left = left;
    WIDGET_top = top;
    WIDGET_restoreFocusToElement = document.activeElement;
    WIDGET_currentWidgetKind = widgetKind;
    WIDGET_currentCallback = callback;

    WIDGET_element.style.left = WIDGET_left + 'px';
    WIDGET_element.style.top = WIDGET_top + 'px';
    WIDGET_element.style.visibility = '';

    switch (widgetKind) {
        case WidgetKind.InputText:
            WIDGET_CreateInputText(placeholder);
            break;
        case WidgetKind.YesCancel:
            WIDGET_CreateYesCancel(placeholder);
            break;
    }
}

function WIDGET_hide(shouldRestoreFocus) {
    switch (WIDGET_currentWidgetKind) {
        case WidgetKind.InputText:
            let input = document.getElementById('WIDGET_inputText');
            input.removeEventListener('keydown', WIDGET_inputTextOnKeyDown);
            break;
        case WidgetKind.YesCancel:
            let yesButtonElement = document.getElementById('WIDGET_YesCancel_yes');
            yesButtonElement.removeEventListener('onclick', WIDGET_YesCancelButtonOnClick_yes);
            let cancelButtonElement = document.getElementById('WIDGET_YesCancel_cancel');
            cancelButtonElement.removeEventListener('onclick', WIDGET_YesCancelButtonOnClick_cancel);
            break;
    }
    WIDGET_element.innerHTML = '';
    WIDGET_element.style.visibility = 'hidden';
    WIDGET_currentWidgetKind = WidgetKind.None;
    if (shouldRestoreFocus && WIDGET_restoreFocusToElement)
        WIDGET_restoreFocusToElement.focus();
}

async function WIDGET_inputTextOnKeyDown(event) {
    if (event.key === 'Enter') {
        let input = document.getElementById('WIDGET_inputText');
        await WIDGET_currentCallback({
            isCancelled: false,
            value: input.value
        });
        WIDGET_hide(true);
    }
    else if (event.key === 'Escape') {
        let input = document.getElementById('WIDGET_inputText');
        await WIDGET_currentCallback({
            isCancelled: true,
            value: input.value
        });
        WIDGET_hide(true);
    }
}

async function WIDGET_YesCancelButtonOnClick_yes(event) {
    await WIDGET_currentCallback({
        isCancelled: false,
        value: 'Yes'
    });
    WIDGET_hide(true);
}

async function WIDGET_YesCancelButtonOnClick_cancel(event) {
    await WIDGET_currentCallback({
        isCancelled: true,
        value: 'Cancel'
    });
    WIDGET_hide(true);
}

function WIDGET_CreateInputText(placeholder) {
    if (!placeholder)
        placeholder = '';

    let input = document.createElement('input');
    input.type = "text";
    input.placeholder = placeholder;
    input.id = 'WIDGET_inputText';
    input.addEventListener('keydown', WIDGET_inputTextOnKeyDown.bind(this));
    WIDGET_element.appendChild(input);
    input.focus();
}

function WIDGET_CreateYesCancel(placeholder) {
    if (!placeholder)
        placeholder = '';

    let topDivElement = document.createElement('div');
    topDivElement.innerText = placeholder;

    let bottomDivElement = document.createElement('div');
    let yesButtonElement = document.createElement('button');
    yesButtonElement.innerText = 'Yes';
    yesButtonElement.id = 'WIDGET_YesCancel_yes';
    yesButtonElement.addEventListener('click', WIDGET_YesCancelButtonOnClick_yes);
    bottomDivElement.appendChild(yesButtonElement);
    let cancelButtonElement = document.createElement('button');
    cancelButtonElement.innerText = 'Cancel';
    cancelButtonElement.id = 'WIDGET_YesCancel_cancel';
    cancelButtonElement.addEventListener('click', WIDGET_YesCancelButtonOnClick_cancel);
    bottomDivElement.appendChild(cancelButtonElement);

    WIDGET_element.appendChild(topDivElement);
    WIDGET_element.appendChild(bottomDivElement);
    yesButtonElement.focus();
}
