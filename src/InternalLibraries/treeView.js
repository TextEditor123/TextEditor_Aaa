
/**
 * The director maintains a flat optimized list of every element i.e.: represent each element in a uint8array and each one is a byte that maps to the actual.
 * 
 * Then the actual can be a hierarchical datastructure.
 * 
 * You just keep flattening it into a byte array and map back and forth.
 */
class TreeViewComponent {
    constructor(itemHeight) {
        this.rootElement = document.createElement('div');
        this.rootElement.classList.add('TREEVIEW', 'unselectable');
        this.rootElement.tabIndex = 0;
        this.rootElement.style.height = '100%';

        this.virtualizationElement = document.createElement('div');
        this.virtualizationElement.className = 'TREEVIEW_virtualization';
        this.rootElement.appendChild(this.virtualizationElement);

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorElement = document.createElement('div');
        this.cursorElement.className = 'TREEVIEW_cursor';
        this.rootElement.appendChild(this.cursorElement);

        this.itemListElement = document.createElement('div');
        this.itemListElement.className = 'TREEVIEW_itemList';
        this.rootElement.appendChild(this.itemListElement);

        this.itemHeightTotal = 0;

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorIndex = 0;

        this._ONSCROLLscrollTop = 0;
        this._ONSCROLLvirtualIndex = 0;
        this._ONSCROLLvirtualCount = 0;
        
        this.event_scroll_async_timer = null;
        this.event_scroll_async_bool = null;
    }

    /**
     * @param {*} director interface TreeViewDirectory { director.drawItem(divItem, indexItem), director.onkeydown(this.itemListElement.children[relativeIndex], this.cursorIndex, this.items[this.cursorIndex]); }
     * @param {*} itemHeightNumber '50'; cursorTop = currentIndex * itemHeightNumber;
     * @param {*} itemHeightStyleAttributeValueString '50px'; div.style.height = itemHeightStyleAttributeValueString;
     */
    setItems(director, itemHeightNumber, itemHeightStyleAttributeValueString) {
        this.itemListElement.innerHTML = '';
        this.virtualizationElement.style.height = 1 + 'px';
        this.state_cursor_setIndex(0);
        
        this.director = director;
        this.itemHeightNumber = itemHeightNumber;
        this.itemHeightStyleAttributeValueString = itemHeightStyleAttributeValueString;

        this.cursorElement.style.height = this.itemHeightStyleAttributeValueString;
        this.itemHeightTotal = this.director.getTotalCount() * this.itemHeightNumber;
        this.virtualizationElement.style.height = this.itemHeightTotal + 'px';
        this.boundingClientRect = null;
    }

    /**
     * if (this.rootElement.parentElement) { await this.draw_render_fullReset_async(); return; }
     * Because the "list" is already drawn somewhere and 'draw_delete()' needs to be invoked prior to drawing at a different location.
     * 
     * @param {HTMLElement} parentElement 
     * @param {*} insertBeforeThisChild (if falsey, the list UI is appended to the parent element)
     */
    async draw_create_async(parentElement, insertBeforeThisChild) {
        if (this.rootElement.parentElement) {
            // It is the case that I invoke 'draw_create_async' when creating the tree view for the first time.
            // But I also do this when I re-open the os input file dialog and pick either a separate or the same folder.
            // In this scenario having this invoke a "fullReset" is necessary otherwise nothing appears in the treeview.
            //
            // TODO: but, perhaps this is best left to the consumer of the TreeViewComponent to invoke themselves...
            // ...in such a scenario. Until further decision is made I'll have the invocation here.
            await this.draw_render_fullReset_async();
            return;
        }
        parentElement.insertBefore(this.rootElement, insertBeforeThisChild);
        this.draw_addEvents();
        await this.draw_render_async();
    }

    /**
     * if (!this.rootElement.parentElement) return;
     * Because the "list" is not drawn, no UI needs to be removed.
     * (the purpose of this method is more-so related to unsubscribing of events and other such non-automatic actions that need to be performed)
     * 
     * @returns 
     */
    draw_delete() {
        if (!this.rootElement.parentElement) return;
        this.draw_removeEvents();
        this.boundingClientRect = null;
        this.rootElement.parentElement.removeChild(this.rootElement);
    }

    draw_addEvents() {
        this.rootElement.addEventListener('click', this.event_click.bind(this));
        this.rootElement.addEventListener('keydown', this.event_keydown.bind(this));
        this.rootElement.addEventListener('scroll', this.event_scroll_async_WRAPIT.bind(this));
        this.rootElement.addEventListener('dblclick', this.event_dblclick.bind(this));
        this.rootElement.addEventListener('contextmenu', this.event_contextmenu.bind(this));
        window.addEventListener('resize', this.event_windowResize.bind(this));
    }
    
    draw_removeEvents() {
        this.rootElement.removeEventListener('click', this.event_click.bind(this));
        this.rootElement.removeEventListener('keydown', this.event_keydown.bind(this));
        this.rootElement.removeEventListener('scroll', this.event_scroll_async_WRAPIT.bind(this));
        this.rootElement.addEventListener('dblclick', this.event_dblclick.bind(this));
        this.rootElement.addEventListener('contextmenu', this.event_contextmenu.bind(this));
        window.removeEventListener('resize', this.event_windowResize.bind(this));
    }

    async draw_render_async() {

        /**
         * I don't like the way I do it because I fill the height with divs even if the final divs are empty
         * but maybe this makes sense I well there's no margin in the list.
         */
        
        if (!this.boundingClientRect) {
            this.ensure_boundingClientRect();
        }

        if (this.itemListElement.children.length !== this.virtualCount) {
            await this.draw_render_fullReset_async();
        }
        else {
            this.virtualIndex = Math.floor(this.rootElement.scrollTop / this.itemHeightNumber);
            this.itemListElement.style.top = this.virtualIndex * this.itemHeightNumber + 'px';

            if (this._ONSCROLLscrollTop === this.rootElement.scrollTop &&
                this._ONSCROLLvirtualIndex === this.virtualIndex &&
                this._ONSCROLLvirtualCount === this.virtualCount) {
                    return;
            }

            this._ONSCROLLscrollTop = this.rootElement.scrollTop;

            // If I delay setting 'this._ONSCROLLvirtualIndex' then I can just use that.
            // I can't bear to do that right now though. I'm just gonna make this variable.
            let prevVli = this._ONSCROLLvirtualIndex;
            let currVli = this.virtualIndex;

            this._ONSCROLLvirtualIndex = this.virtualIndex;

            if (this._ONSCROLLvirtualCount === this.virtualCount &&
                this.itemListElement.children.length === this.virtualCount) {

                // The same count of lines is on the UI so you can probably
                // redraw them one by one and save "some" of the existing HTML.

                let diff = currVli - prevVli;

                // There are 3 cases (they correspond respectively to the if, else if, else'):
                // - move small lines to end of list with the content changed
                // - move the final lines to the start with the content changed
                // - keep lines in place and redraw over them all

                let totalCount = this.director.getTotalCount();

                if (diff > 0 && diff < this.virtualCount) { // move small lines to end of list with the content changed
                    let firstIndexLineThatWasNotAlreadyRendered = prevVli + this._ONSCROLLvirtualCount;
                    for (var i = 0; i < diff; i++) {
                        let indexItem = prevVli + this._ONSCROLLvirtualCount + i;
                        let divItem = this.itemListElement.children[0];
                        if (indexItem >= totalCount) {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ true);
                        }
                        else {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ false);
                        }
                        this.itemListElement.appendChild(divItem);
                    }
                }
                else if (diff < 0 && (diff *= -1) < this.virtualCount) { // move the final lines to the start
                    for (var i = 0; i < diff; i++) {
                        let indexItem = currVli + i;
                        let divItem = this.itemListElement.children[this.itemListElement.children.length - 1];
                        if (indexItem >= totalCount) {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ true);
                        }
                        else {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ false);
                        }
                        this.itemListElement.insertBefore(divItem, this.itemListElement.children[i]);
                    }
                }
                else { // re-use the divs, but keep them in place and redraw over them all
                    for (var i = 0; i < this.virtualCount; i++) {
                        let indexItem = i + this.virtualIndex;
                        let divItem = this.itemListElement.children[i];
                        if (indexItem >= totalCount) {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ true);
                        }
                        else {
                            await this.director.drawItem_async(divItem, indexItem, /*isNull*/ false);
                        }
                    }
                }
            }
        }
    }

    /**
     * This actually only gets invoked if 'this.itemListElement.children.length !== this.virtualCount'...
     * ...But it is a bit more complicated if you want to involve a change to totalCount, you'd need to force the final 'else' case
     * so it is easier to just invoke this directly when you change totalCount?
     */
    async draw_render_fullReset_async() {

        this._ONSCROLLvirtualCount = this.virtualCount;

        this.virtualIndex = Math.floor(this.rootElement.scrollTop / this.itemHeightNumber);
        this.itemListElement.style.top = this.virtualIndex * this.itemHeightNumber + 'px';

        let totalCount = this.director.getTotalCount();

        if (this.itemListElement.children.length === this.virtualCount) {
            for (let i = 0; i < this.virtualCount; i++) {
                let divItem = this.itemListElement.children[i];
                if (this.virtualIndex + i >= totalCount) {
                    await this.director.drawItem_async(divItem, this.virtualIndex + i, /*isNull*/ true);
                }
                else {
                    await this.director.drawItem_async(divItem, this.virtualIndex + i, /*isNull*/ false);
                }
            }
        }
        else {

            this.itemListElement.innerHTML = '';

            for (let i = 0; i < this.virtualCount; i++) {
                
                let divItem = document.createElement('div');
                divItem.style.height = this.itemHeightStyleAttributeValueString;
                divItem.style.whiteSpace = 'nowrap';
                this.itemListElement.appendChild(divItem);
    
                let iconSpan = document.createElement('span');
                iconSpan.style.width = EXPLORER_firstSpanWidth;
                iconSpan.style.display = 'inline-block';
                // TODO: Consider what differences if any exist between the '' iconSpan having an empty height of 0 when left unset, versus if you were to set it to 1px, does this matter? It doesn't seem to impact the "horizontal" space being taken.
                divItem.appendChild(iconSpan);
                divItem.appendChild(document.createTextNode("..."));

                if (this.virtualIndex + i >= totalCount) {
                    await this.director.drawItem_async(divItem, this.virtualIndex + i, /*isNull*/ true);
                }
                else {
                    await this.director.drawItem_async(divItem, this.virtualIndex + i, /*isNull*/ false);
                }
            }
        }
    }

    /**
     * TODO: To detect whether the "expand/collapse icon" was clicked, the logic 'if(event.target === nodeElement.children[0])' is used...
     * ...this logic is flawed if one ever were to put an element within the span that became the target...
     * ...thus, you should consider checking the x position of the event against the x position of the nodeElement.children[0].
     * @param {*} event 
     */
    async event_click(event) {
        this.ensure_boundingClientRect();

        let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;
        let index = Math.floor(rY / this.itemHeightNumber);
        index = this.state_cursor_validateIndex(index);

        let divItem = this.itemListElement.children[index - this.virtualIndex];

        if (event.target === divItem.children[0]) {
            await this.director.expandCollapseIconWasClicked_async(divItem, index);
        }
        else {
            this.state_cursor_setIndex(index);
        }
    }

    async event_dblclick(event) {
        this.ensure_boundingClientRect();

        let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;
        let index = Math.floor(rY / this.itemHeightNumber);
        index = this.state_cursor_validateIndex(index);

        let divItem = this.itemListElement.children[index - this.virtualIndex];

        if (event.target === divItem.children[0]) {
            // ignore because:
            // await this.director.expandCollapseIconWasClicked_async(divItem, index);
        }
        else {
            let relativeIndex = this.cursorIndex - this.virtualIndex;
            if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                await this.director.ondblclick_async(this.itemListElement.children[relativeIndex], this.cursorIndex);
            }
        }
    }

    async event_contextmenu(event) {
        this.ensure_boundingClientRect();

        if (event.button === 2) {
            let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;

            this.state_cursor_setIndex(this.state_cursor_validateIndex(
                Math.floor(rY / this.itemHeightNumber)));

            let relativeIndex = this.cursorIndex - this.virtualIndex; // TODO: you need to move this above the divItem assignment and do checks earlier... double check all other uses

            if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                await this.director.oncontextmenu_async(this.itemListElement.children[relativeIndex], this.cursorIndex, event, relativeIndex);
            }
        } else {
            if (this.cursorIndex >= this.director.getTotalCount()) {
                return;
            }

            this.state_cursor_setIndex(this.state_cursor_validateIndex(
                this.cursorIndex));
            
            let relativeIndex = this.cursorIndex - this.virtualIndex;

            // TODO: Handle context menu with keyboard when active node is out of view
            if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                await this.director.oncontextmenu_async(this.itemListElement.children[relativeIndex], this.cursorIndex, event, relativeIndex);
            }
        }
    }

    async event_keydown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (event.ctrlKey) {
                    this.rootElement.scrollBy(0, this.itemHeightNumber);
                }
                else {
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex + 1));
                }
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (event.ctrlKey) {
                    this.rootElement.scrollBy(0, -1 * this.itemHeightNumber);
                }
                else {
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex - 1));
                }                
                break;
            case 'ArrowRight':
                if (!event.ctrlKey) {
                    event.preventDefault();
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex));
                    // TODO: 'ArrowRight' when the cursor is on a valid item but isn't part of the virtualization result.
                    //
                    // I am extremely tired. I am trying to do another hour or so just to feel out whether I've truly fatigued myself sufficiently today or not.
                    // It has been around 40 minutes so far and I do believe I am sufficiently fatigued I can't think much at all.
                    // I want this 'ArrowRight' to work properly if I can. But I'm also aware that I need to just stop if need be at any point cause I'm out of it.
                    // 
                    let relativeIndex = this.cursorIndex - this.virtualIndex;
                    if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                        await this.director.expandCollapseIconWasClicked_async(this.itemListElement.children[relativeIndex], this.cursorIndex);
                    }
                }
                break;
            case ' ':
            case 'Enter':
                event.preventDefault();
                this.state_cursor_setIndex(this.state_cursor_validateIndex(
                    this.cursorIndex));
                let relativeIndex = this.cursorIndex - this.virtualIndex;
                if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                    await this.director.onkeydown_async(this.itemListElement.children[relativeIndex], this.cursorIndex, event.key);
                }
                break;
        }
    }

    /**
     * TODO: intra-app resizes or movements will also invoke this; i.e.: if a list is shown in a dialog and the dialog is resized or moved.
     */
    event_windowResize() {
        this.boundingClientRect = null;
    }

    async event_scroll_async_WRAPIT() {
        const timeoutFunc = async () => {
	        if (/*trailing && lastArgs*/ this.event_scroll_async_bool) {
	            await this.event_scroll_async();
	            this.event_scroll_async_bool = false;
	            this.event_scroll_async_timer = setTimeout(timeoutFunc, 100);
	        } else {
	            this.event_scroll_async_timer = null;
	        }
	    };
	
		this.event_scroll_async_bool = true;
		
	    if (!this.event_scroll_async_timer) {
	    	await this.event_scroll_async();
	        this.event_scroll_async_timer = setTimeout(timeoutFunc, 100);
	    }
    }

    async event_scroll_async() {
        await this.draw_render_async();
    }

    ensure_boundingClientRect() {
        if (!this.boundingClientRect) {
            this.boundingClientRect = this.rootElement.getBoundingClientRect();
            this.virtualCount = Math.ceil(this.rootElement.offsetHeight / this.itemHeightNumber);
        }
    }

    /**
     * if (this.cursorIndex === index) return;
     * 
     * @param {*} index 
     */
    state_cursor_setIndex(index) {
        if (this.cursorIndex === index) return;

        this.cursorIndex = index;
        this.cursorTopNumber = this.cursorIndex * this.itemHeightNumber;
        this.cursorElement.style.top = this.cursorTopNumber + 'px';

        this.ensure_boundingClientRect();

        if (this.cursorTopNumber + (2 * this.itemHeightNumber) > this.rootElement.scrollTop + this.boundingClientRect.height) {
            let currentBottom = this.rootElement.scrollTop + this.boundingClientRect.height;
            let changeToMakeBottomTouch = this.cursorTopNumber - currentBottom;
            let entireValueToScrollBy = changeToMakeBottomTouch + (2 * this.itemHeightNumber);
            this.rootElement.scrollBy(0, entireValueToScrollBy);
        }
        else if (this.cursorTopNumber < this.rootElement.scrollTop) {
            this.rootElement.scrollBy(0, this.cursorTopNumber - this.rootElement.scrollTop);
        }
    }

    /**
     * if (this.cursorIndex === index) return;
     * 
     * @param {*} index 
     */
    state_cursor_validateIndex(index) {
        if (index >= this.director.getTotalCount()) {
            index = this.director.getTotalCount() - 1;
        }
        if (index < 0) {
            index = 0;
        }
        return index;
    }
}
