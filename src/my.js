/** TODO: The decimals are being truncated by default / ought to be avoided regardless for performance? Use Math.Ceiling? */
let APP_lineHeight = 20;

init();

// TODO: Measure app line height and use that instead of hacking around with the text editor's line height...
// ...was measured, some places changed usage but not all.

function APP_measureLineHeightAndCharacterWidth() {
    const body = document.getElementById('ROOT');

    const measureElement = document.createElement('div');
    measureElement.style.width = "fit-content";
    measureElement.innerText = "0";
    body.appendChild(measureElement);

    // TODO: This is currently a whole number but regardless, it presumably could end up having a decimal part.
    APP_lineHeight = Math.ceil(measureElement.offsetHeight);

    /*
    The app currently measures the 'APP_lineHeight'.

    I am going to change it so the width of a span when containing either the innerText '-', or '+'; that the
    innerText which results in the largest offsetWidth for the parent span is tracked.

    This permits me to in 'explorer.js' set the first span of every "tree-view-node"
    to be the same width, regardless of whether its content is '-', '+', or '' (an empty string).

    In theory the character that I put inside the 'measureElement' in order to measure
    the currently measured 'APP_lineHeight' does not matter.

    But I will be adding these two innerText, offsetWidth measurements as separate measurements
    rather than trying to combine things in any way.

    This is because I cannot 'bear' to do it at the moment.
    And I just need some progress for the day so I'm taking this win cause mentally I'm at a bit of a standstill.
    */

    measureElement.innerText = "-";
    const minusWidth = measureElement.offsetWidth;
    measureElement.innerText = "+";
    const plusWidth = measureElement.offsetWidth;

    // TODO: the 'explorer.js' file currently uses the text '}' for 'case TrackedSyntaxKind.HACK_NOTisExpandable_isExpanded:'...
    // ...this case isn't currently being hit...
    // ...but if it ever were to be hit, perhaps the width of the span would act weirdly if '}' turns out to be the largest width.

    const largerWidth = Math.ceil(minusWidth > plusWidth ? minusWidth : plusWidth);

    EXPLORER_firstSpanWidthValue = largerWidth;
    EXPLORER_firstSpanWidth = EXPLORER_firstSpanWidthValue + 'px';

    const root = document.documentElement;
    const computedStyles = window.getComputedStyle(root);
    const appLineHeight = APP_lineHeight + 'px';
    const propertyName = '--APP-line-height';
    if (computedStyles.getPropertyValue(propertyName) !== appLineHeight) {
        // avoid layout with if statement
        root.style.setProperty(propertyName, appLineHeight);
    }

    body.removeChild(measureElement);
}

function init() {

    document
        .getElementById('HEADER_buttonSettings')
        .addEventListener('click', async () => {
            return DIALOG_show_async(DialogKind.Settings);
        });

    window.myAPI.onMessage(async (data) => {
        EDITOR_documentSymbolResult = data;
        EDITOR_listComponent.setItems(APP_lineHeight, APP_lineHeight + 'px',
            /*drawItemAction*/ (div, index) => {
                if (index === -1) {
                    div.innerText = '';
                    div.title = '';
                    div.style.display = 'none';
                }
                else {
                    let item = EDITOR_documentSymbolResult[index];
                    div.innerText = item.name;
                    div.title = JSON.stringify(item.range.start);
                    div.style.display = '';
                }
            },
            /*onkeydownAction*/ (div, index) => {
                if (index === -1) {
                    // TODO: if (index === -1)
                }
                else {
                    // TODO: Ensure that json parsing the title like this is a safe way of doing things
                    const startPosition = JSON.parse(div.title);
                    EDITOR_moveCursor_lineIndex_columnIndex(startPosition.line, startPosition.character);
                }
            },
            /*getItemsCountFunc*/ () => {
                return EDITOR_documentSymbolResult.length;
            });
        await DIALOG_show_async(DialogKind.DocumentSymbol, () => {
            EDITOR_listComponent.boundingClientRect = null;
            EDITOR_listComponent.event_scroll();
        });
    });

    APP_measureLineHeightAndCharacterWidth();

    const EDITOR_gotoF_button = document.getElementById('EDITOR_gotoF');
    EDITOR_gotoF_button.addEventListener('click', window.myAPI.editorDocumentSymbolsRequest);

    const body = document.getElementById('ROOT');
    body.addEventListener('keydown', async event => {
        
        switch (event.key) {
            case 's':
            case 'S':

                if (!event.ctrlKey) {
                    return;
                }

                const unvalidatedAbsolutePath = EDITOR_textSourceIdentifier;
                const rawData = EDITOR_getFinalizedEditsAndRawSaveFileData();
                if (rawData.uint8arrayTextBytes) {
                    event.preventDefault();
                    event.stopPropagation();
                    await window.myAPI.editorSaveFile(unvalidatedAbsolutePath, rawData.uint8arrayTextBytes, rawData.countOfBytesInUse, rawData.lineEndString, rawData.fileStartsWithBom);
                }

                break;
            case 'F':

                if (!event.ctrlKey) {
                    return;
                }

                return DIALOG_show_async(DialogKind.FindAll);
            case 'Escape':
            	// TODO: Provide a way to disable the next (body, and useCapture) 'Escape' keypress...
            	// ...so a widget can restore focus to the relevant UI rather than
            	// the 'EDITOR' when the user presses 'Escape' to "cancel".
				const editor = document.getElementById('EDITOR');
		        if (editor) {
		            editor.focus();
		        }
                break;
        	case 'e':
        		if (event.altKey) {
        			EXPLORER_setShow(true);
        			const EXPLORER_Element = document.getElementById('EXPLORER');
        			if (EXPLORER_Element.children.length === 1) {
        				EXPLORER_Element.children[0].focus();
        			}
        		}
                break;
            case 'E':
        		if (event.altKey && event.shiftKey) {
        			const editor = document.getElementById('EDITOR');
			        if (editor) {
			            editor.focus();
			            EXPLORER_setShow(false);
			        }
        		}
                break;
            case 'd':
        		if (event.altKey) {
        			const dialogCloseButton = document.getElementById('DIALOG_closeButton');
        			if (dialogCloseButton) {
        				dialogCloseButton.focus();
        			}
        		}
                break;
            case 'h':
        		if (event.altKey) {
        			const settingsButton = document.getElementById('HEADER_buttonSettings');
        			if (settingsButton) {
        				settingsButton.focus();
        			}
        		}
                break;
        }
    }, /*useCapture*/ true);

    MENU_init();
    EXPLORER_init();
}
