/**
 * When in doubt, behavior should replicate that of an HTML element if applicable.
 * i.e.: What happens if I try to show this in two separate places at the same time?
 * - You remove the current parent prior to drawing it at the new parent with the given child index.
 * - TODO: Are you sure you have it written in a way that conforms to your statements made above ^...
 *     - I think I recall adding event listeners to an HTML element prior to having the element having a parent, and then upon
 *           giving it a parent, the event listeners weren't working.
 *           - Is this true? / are there other oddities you don't expect involved?
 * 
 * Now that I think about it... would it be possible / sensible to somehow tell JavaScript this "inherits" an HTML element or something like this?
 * I looked and it seems possible but I'm not sure I want to do this. It kinda gives me the ick (at least at first glance)
 */
class ListComponent {
    /**
     * @param {*} itemHeight invoker provides or does this class calculate it?
     * TODO: itemHeight is never used
     */
    constructor(itemHeight) {
        
        /**
         * // height is 100% of container, or is set to a value?
         * 
         * TODO: this isn't being used?
         * */
        this.containerHeight = 0;
        /**
         * @type {HTMLDivElement}
         */
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'LIST';
        this.rootElement.tabIndex = 0;
        /** TODO: this isn't being used? */
        this.rootElementHeightNumber = 0;
        this.rootElement.style.height = '100%';

        this.virtualizationElement = document.createElement('div');
        this.virtualizationElement.className = 'LIST_virtualization';
        this.rootElement.appendChild(this.virtualizationElement);

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorElement = document.createElement('div');
        this.cursorElement.className = 'LIST_cursor';
        this.rootElement.appendChild(this.cursorElement);

        this.itemListElement = document.createElement('div');
        this.itemListElement.className = 'LIST_itemList';
        this.rootElement.appendChild(this.itemListElement);

        this.itemHeightTotal = 0;

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorIndex = 0;

        /**
         * This relates to how many extra items will be rendered beyond what naively would fit at an equal scrollTop down to filling the viewport height.
         * 
         * TODO: This isn't being used?
         */
        this.virtualPadding = 1;

        this._ONSCROLLscrollTop = 0;
        this._ONSCROLLvirtualIndex = 0;
        this._ONSCROLLvirtualCount = 0;
        
        this.event_scroll_timer = null;
        this.event_scroll_bool = false;

        /**
         * It could be useful to inherit HTML element due to storage, you'd have to hold a null reference that you can set
         * or store a array of 'List' to somehow hold the reference.
         * 
         * If you inherit HTML element the document likely could do the "storage" of the reference
         * 
         * So then for this reason, you want to be able to understand the context of the section in the app you are working within.
         * This tells you how many ListComponent you need "worst case scenario"
         * 
         * If a certain section of the app only needs to show 1 list at any given moment, you can allocate a single ListComponent
         * and re-use it.
         * 
         * Meanwhile some other section might be displaying 2 lists, so they'd allocate 2 ListComponent.
         * 
         * And if desirable you can set your section's ListComponent to null when you aren't using it
         * with the goal of GC collecting the instance during the time that it isn't being used.
         */
    }

    /**
     * 
     * @param {*} itemHeightNumber '50'; cursorTop = currentIndex * itemHeightNumber;
     * @param {*} itemHeightStyleAttributeValueString '50px'; div.style.height = itemHeightStyleAttributeValueString;
     * @param {*} drawItemAction receives the div that represents the individual item in the list, the index of the item OR -1 to indicate the function should clear the div because there is no entry at that location (need to handle null item due to when viewport isn't filled). This div is empty, and you can do "whatever you want to it" provided the height stays consistent.
     * @param {*} onkeydownAction receives the div that represents the individual item in the list, the index of the item OR -1 to indicate there is no entry at that location.
     * @param {*} getItemsCountFunc returns the total count of items
     */
    setItems(itemHeightNumber, itemHeightStyleAttributeValueString, drawItemAction, onkeydownAction, getItemsCountFunc) {

        this.itemListElement.innerHTML = '';
        this.virtualizationElement.style.height = 1 + 'px';
        this.state_cursor_setIndex(0);

        this.itemHeightNumber = itemHeightNumber;
        this.itemHeightStyleAttributeValueString = itemHeightStyleAttributeValueString;
        /** receives the div that represents the individual item in the list, the index of the item, and the item itself. This div is empty, and you can do "whatever you want to it" provided the height stays consistent. */
        this.drawItemAction = drawItemAction;
        /** receives the div that represents the individual item in the list, the index of the item, and the item itself. */
        this.onkeydownAction = onkeydownAction;

        this.cursorElement.style.height = this.itemHeightStyleAttributeValueString;
        this.getItemsCountFunc = getItemsCountFunc;
        this.itemHeightTotal = this.getItemsCountFunc() * this.itemHeightNumber;
        this.virtualizationElement.style.height = this.itemHeightTotal + 'px';
        this.boundingClientRect = null;
    }

    /**
     * if (this.rootElement.parentElement) return;
     * Because the "list" is already drawn somewhere and 'draw_delete()' needs to be invoked prior to drawing at a different location.
     * 
     * @param {HTMLElement} parentElement 
     * @param {*} insertBeforeThisChild (if falsey, the list UI is appended to the parent element)
     */
    draw_create(parentElement, insertBeforeThisChild) {
        if (this.rootElement.parentElement) return;
        parentElement.insertBefore(this.rootElement, insertBeforeThisChild);
        this.draw_addEvents();
        this.draw_render();
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
        this.rootElement.addEventListener('scroll', this.event_scroll_WRAPIT.bind(this));
        window.addEventListener('resize', this.event_windowResize.bind(this));
    }
    
    draw_removeEvents() {
        this.rootElement.removeEventListener('click', this.event_click.bind(this));
        this.rootElement.removeEventListener('keydown', this.event_keydown.bind(this));
        this.rootElement.removeEventListener('scroll', this.event_scroll_WRAPIT.bind(this));
        window.removeEventListener('resize', this.event_windowResize.bind(this));
    }

    draw_render() {

        /**
         * I don't like the way I do it because I fill the height with divs even if the final divs are empty
         * but maybe this makes sense I well there's no margin in the list.
         */
        
        if (!this.boundingClientRect) {
            this.ensure_boundingClientRect();
        }

        if (this.itemListElement.children.length !== this.virtualCount) {
            this.draw_render_fullReset();
        }
        else {
            /**
             * Determine what the overlap of the previously rendered lines, and the newly rendered lines is.
             * 
             * Consider a step based solution to this so you don't get lost in the weeds.
             * 
             * The lines that aren't part of the previously rendered lines need to be "cleared and re-used" to draw the new lines.
             * 
             * So maybe you do 1 scroll event and look at debugger and make sure the ones that don't overlap are cleared.
             * then ... and ... etc...
             */

            /**
             * Each index per line
             * 
             * 0
             * 1
             * 2
             * 3
             * 4
             * 
             * =====
             * 
             * Then scroll by just 1 line
             * 
             * 0        1
             * 1        2
             * 2   =>   3
             * 3        4
             * 4        5
             * 
             */


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

                // There are 3 cases:
                // - move small lines to end of list with the content changed
                // - move the final lines to the start with the content changed
                // - keep lines in place and redraw over them all

                if (diff > 0 && diff < this.virtualCount) {
                    
                    // move small lines to end of list with the content changed

                    // scrolled down and a non-zero amount of the content is re-useable
                    // thus, draw the larger index item into the smallest index div of the previous render
                    // then append that same smalled div so that it now is being used to show a larger

                    // I don't want to get caught up in any unnecessary complexity so I'm gonna isolate a single case
                    // by duplicating the code and only my singular case hits the new code that I'm adding.
                    //
                    // It's possible the single case is the solution to every case.
                    // But moreso mentally the problem is easier to approach from an anxiety/procrastination perspective.

                    let firstIndexLineThatWasNotAlreadyRendered = prevVli + this._ONSCROLLvirtualCount;

                    let itemsCount = this.getItemsCountFunc();

                    for (var i = 0; i < diff; i++) {
                        let indexItem = prevVli + this._ONSCROLLvirtualCount + i;
            
                        let divItem = this.itemListElement.children[0];
                        // TODO: Should this actually be setting innerHTML to an empty string?
                        divItem.innerHTML = '';

                        if (indexItem >= itemsCount) {
                            this.drawItemAction(divItem, -1);
                        }
                        else {
                            this.drawItemAction(divItem, indexItem);
                        }
            
                        this.itemListElement.appendChild(divItem);
                    }
                }
                else if (diff < 0 && (diff *= -1) < this.virtualCount) {

                    // move the final lines to the start

                    // move large lines to start of list with the content changed

                    // TODO: You might want to have the cutoff be earlier than count, the shifting of the children might be more expensive then the previous way of things at a point earlier than count...
                    // ...in fact since this scroll up case has to insert and shift, it is more expensive than the append.
                    // and an in bulk function is probably highly valuable here.
                    //
                    // It might faster to copy the content around to each existing node.
                    // 
                    // Although I'm not even sure if it does shift internally or not I'm only presuming that.

                    // To reduce shifting you could either:
                    // - Get a reference to all the divs you'll re-use then remove them in bulk
                    // - Ensure you do the lower indices first, so that you can insert AFTER the previously moved divs rather than continually incurring the shift of every element in the list (or maybe every element except 1 cause it doesn't get shifted it moreso gets moved idk)

                    let itemsCount = this.getItemsCountFunc();
                    
                    for (var i = 0; i < diff; i++) {
                        let indexItem = currVli + i;

                        let divItem = this.itemListElement.children[this.itemListElement.children.length - 1];
                        divItem.innerHTML = '';

                        if (indexItem >= itemsCount) {
                            this.drawItemAction(divItem, -1);
                        }
                        else {
                            this.drawItemAction(divItem, indexItem);
                        }
                        
                        this.itemListElement.insertBefore(divItem, this.itemListElement.children[i]);
                    }
                }
                else {
                    // re-use the divs, but keep them in place and redraw over them all

                    let itemsCount = this.getItemsCountFunc();

                    for (var i = 0; i < this.virtualCount; i++) {
                        let indexItem = i + this.virtualIndex;

                        let divItem = this.itemListElement.children[i];
                        divItem.innerHTML = '';

                        if (indexItem >= itemsCount) {
                            this.drawItemAction(divItem, -1);
                        }
                        else {
                            this.drawItemAction(divItem, indexItem);
                        }
                    }
                }
            }
        }
    }

    draw_render_fullReset() {

        this._ONSCROLLvirtualCount = this.virtualCount;

        this.itemListElement.innerHTML = '';
        
        this.virtualIndex = Math.floor(this.rootElement.scrollTop / this.itemHeightNumber);
        this.itemListElement.style.top = this.virtualIndex * this.itemHeightNumber + 'px';

        let itemsCount = this.getItemsCountFunc();

        for (let i = 0; i < this.virtualCount; i++) {
            // TODO: you don't break you still populate and then drawItemAction handles a null case?
            if (this.virtualIndex + i >= itemsCount) {
                break;
            }
            let divItem = document.createElement('div');
            divItem.style.height = this.itemHeightStyleAttributeValueString;
            this.itemListElement.appendChild(divItem);
            this.drawItemAction(divItem, this.virtualIndex + i);
        }
    }

    event_click(event) {
        this.ensure_boundingClientRect();

        let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;
        let index = Math.floor(rY / this.itemHeightNumber);
        index = this.state_cursor_validateIndex(index);
        this.state_cursor_setIndex(index);
    }
    
    event_keydown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.state_cursor_setIndex(
                    this.state_cursor_validateIndex(this.cursorIndex + 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.state_cursor_setIndex(
                    this.state_cursor_validateIndex(this.cursorIndex - 1));
                break;
            case ' ':
                event.preventDefault();
                this.state_cursor_setIndex(
                    this.state_cursor_validateIndex(this.cursorIndex));
                let relativeIndex = this.cursorIndex - this.virtualIndex;
                if (relativeIndex >= 0 && relativeIndex < this.itemListElement.children.length) {
                    this.onkeydownAction(this.itemListElement.children[relativeIndex], this.cursorIndex);
                }
                break;
        }
    }

    /**
     * intra-app resizes or movements will also invoke this; i.e.: if a list is shown in a dialog and the dialog is resized or moved.
     */
    event_windowResize() {
        this.boundingClientRect = null;
    }
    
    event_scroll_WRAPIT() {
        this.event_scroll_bool = true;
	    if (!this.event_scroll_timer) {
	    	this.event_scroll();
            // TODO: I'm not supposed to use 'this.' inside the 'setTimeout(...)' and I don't know why
	        this.event_scroll_timer = setTimeout(event_scroll_timeoutFunc, 100);
	    }
    }
    
    event_scroll_timeoutFunc() {
        if (/*trailing && lastArgs*/ this.event_scroll_bool) {
            this.event_scroll();
            this.event_scroll_bool = false;
            // TODO: I'm not supposed to use 'this.' inside the 'setTimeout(...)' and I don't know why
            this.event_scroll_timer = setTimeout(event_scroll_timeoutFunc, 100);
        } else {
            this.event_scroll_timer = null;
        }
    }
    
    event_scroll() {
        this.draw_render();
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
        let itemsCount = this.getItemsCountFunc();
        if (index >= itemsCount) {
            index = itemsCount - 1;
        }
        if (index < 0) {
            index = 0;
        }
        return index;
    }
}







































