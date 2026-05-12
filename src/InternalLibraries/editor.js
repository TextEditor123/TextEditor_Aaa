/**
 * This provides the last valid position index for a line.
 * 
 * ```
 * Apple\n
 * Sauce\n
 * ```
 * 
 * lineEndPositionList = [
 *     5,  // \n
 *     12, // \n
 *     13  // EOF
 * ];
 * 
 * ----------------------------
 * 
 * The following example is an empty string:
 * ```
 * ```
 * 
 * lineEndPositionList = [
 *     0  // EOF
 * ];
 * 
 * ----------------------------
 * 
 * A major remaining question in my mind is whether people store the line end positions.
 * I need to do this at the very least for a moment while I get this structured a bit.
 * I'm not sure if you could do without this or not.
 * 
 * -----------------------------
 * 
 * Something to consider... does JavaScript box an int if I put it in an array?
 * I might want to use that byte array thing.
 * 
 * Google says the ints aren't boxed.
 * I'm just gonna continue with this for now.
 * 
 * ------------------------------
 * 
 * All "line end characters" are stored as '\n' regardless of the provided "line end character".
 * 
 * Long term, when getting the text the editor should output each '\n' as the first "line end character" that it saw
 * while looping over the original text content.
 * 
 * -----------------------------
 * 
 * Somewhat random comment about tabs:
 * Tab positions are NOT stored.
 * Instead every tab is represented by "\t\0\0\0".
 * 
 * It is important to note that when reading the character at EOF you will get back '\0'.
 * 
 * Thus, if you ever encounter '\0' when the cursor is NOT at EOF,
 * then you likely are "within a tab" and need to fix the cursor's position.
 * 
 * It is presumed that inline-hints if ever supported would work similarly.
 * 
 * Then when getting the text the editor should stream the expected "text" rather than the "text + visual_representation".
 * 
 * -----------------------------
 * 
 * Somewhat random comment about syntax highlighting:
 * stream store syntax as render while
 * 
 * Instead of storing a byte for every character.
 * The UI when rendering text will ask what "syntax" exists at the text location.
 * It groups contiguous characters of the same "syntax" into a single span with a class to get color.
 * 
 * The main point is that you could have 10,000 characters of text.
 * And a single "comment" that spans 5 of those characters.
 * You'd only store the start position and length of the comment,
 * rather than 9,995 bytes of bytes to signify plain text and another 5 bytes to signify the comment.
 * 
 * >>>> another comment about syntax highlighting
 * 
 * A debounce for keyboard events will notify some method.
 * If there is a pending "edit" then you at first will skip that event.
 * But if the file doesn't have any pending edits (i.e.: the singular large string
 * truly represents the "text + visual_representation" without needing to look at the cursors)
 * then you'd have an opportunity to run code.
 * Perhaps this opportunity is used to lex the text for example.
 * 
 * -----------------------------
 * 
 * Somewhat random comment about text editing:
 * Gap buffer per cursor,
 * Eventual goal is that the gap buffers edit an underlying Rope datastructure.
 * But first only a gap buffer and one large backing string will be used.
 * 
 * >>>> another comment about text editing
 * 
 * I'm not going to worry about interactions of a pending insertion and an incoming removal of text.
 * 
 * i.e.: even if the removal of the text is done via a backspace keystroke
 * after typing the letter 'a'.
 * 
 * I'm going to write the pending letter 'a' to the underlying large string,
 * then start a pending removal of text to remove that 'a'.
 * 
 * Long term you should likely allow this interaction so that you never write the 'a' since the text
 * being removed is just in a gap buffer.
 * 
 * >>>> another comment about text editing
 * 
 * A pending removal of text doesn't delete any text immediately.
 * The editor knows to look at every cursor, and it just "skips" characters that
 * a cursor says it will remove.
 * 
 */

// DeleteLtr and BackspaceRtl are both forms of removing text,
// their edits are stored the same (i.e.: both in "the form of a delete" keypress)
// The kind delete/backspace tells you how to restore the cursor when doing a ctrl+z and etc...?
const EditKind = {
    None: 0,
    InsertLtr: 1,
    DeleteLtr: 2,
    BackspaceRtl: 3,
    RemoveTextNoBatching: 4,
    Tab: 5,   // Tab and enter are extra special cases
    Enter: 6, // Tab and enter are extra special cases
};

const TrackedSyntaxKind = {
    None: 0,
    String: 1,
    /**
     * only multi-line-comments that span multiple lines are stored in EDITOR_trackedSyntaxList with the 'TrackedSyntaxKind.Comment'
    */
    Comment: 2,
    HACK_isExpandable_isExpanded: 3,
    HACK_isExpandable_NOTisExpanded: 4,
    HACK_NOTisExpandable_isExpanded: 5,
    HACK_NOTisExpandable_NOTisExpanded: 6,
};

class TrackedSyntaxList {
    data_literal;
    capacity_literal;

    capacity_abstract;
    count_abstract = 0;

    // Storing the trackedSyntaxKind as an int32 isn't the most ideal thing in the world.
    // Previously the ints were being grouped via a class instance.
    // So this still ought to be better than what was done previously.
    field_count = 3;
    // this.trackedSyntaxKind = trackedSyntaxKind;
    // this.start = start;
    // this.length = length;

    trackedSyntaxKind_offset = 0;
    start_offset = 1;
    length_offset = 2;

    constructor(initialCapacity_abstract) {
        let temp_capacity_literal = initialCapacity_abstract * this.field_count;

        this.data_literal = new Uint32Array(temp_capacity_literal);
        this.capacity_abstract = initialCapacity_abstract;
        this.capacity_literal = temp_capacity_literal;

        this.count_abstract = 0;
    }

    /**
     * Does not clear the information, only sets 'this.count' to '0'.
     */
    clear() {
        this.count_abstract = 0;
    }

    /**
     * 
     * @param {TrackedSyntax} trackedSyntax a place to read the data into, since it is stored as just int32 data (not the class)
     * @returns {TrackedSyntax}
     */
    getElementAt(trackedSyntax, index_abstract) {
        let index_literal = index_abstract * this.field_count;
        trackedSyntax.trackedSyntaxKind = this.data_literal[index_literal + this.trackedSyntaxKind_offset];
        trackedSyntax.start = this.data_literal[index_literal + this.start_offset];
        trackedSyntax.length = this.data_literal[index_literal + this.length_offset];
    }

    getStart(index_abstract) {
        return this.data_literal[(index_abstract * this.field_count) + this.start_offset];
    }

    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} value 
     */
    setStart(index_abstract, value) {
        this.data_literal[(index_abstract * this.field_count) + this.start_offset] = value;
    }
    
    getLength(index_abstract) {
        return this.data_literal[(index_abstract * this.field_count) + this.length_offset];
    }
    
    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} value 
     */
    setLength(index_abstract, value) {
        this.data_literal[(index_abstract * this.field_count) + this.length_offset] = value;
    }
    
    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} value 
     */
    setTrackedSyntaxKind(index_abstract, value) {
        this.data_literal[(index_abstract * this.field_count) + this.trackedSyntaxKind_offset] = value;
    }

    /**
     * TODO: ensure all the parameters are encoded, especially because I'm noticing myself forgetting.
     */
    insert(index_abstract, trackedSyntaxKind, start, length) {
        this.ensureCapacityForInsertion(index_abstract, 1);

        let index_literal = index_abstract * this.field_count;

        if (index_abstract !== this.count_abstract) {
            this.copyTo(this.data_literal, index_abstract, this.data_literal, index_abstract + 1, this.count_abstract - index_abstract);
        }

        this.data_literal[index_literal + this.trackedSyntaxKind_offset] = trackedSyntaxKind;
        this.data_literal[index_literal + this.start_offset] = start;
        this.data_literal[index_literal + this.length_offset] = length;

        this.count_abstract++;
    }

    /**
     * Does not clear trailing information.
     * 
     * count === 0 immediately returns
     */
    removeAt(index_abstract, count_abstract) {

        if (index_abstract > this.count_abstract) { throw new Error('removeAt(...): index_abstract > this.count_abstract'); }
        if (index_abstract + count_abstract > this.count_abstract) { throw new Error('removeAt(...): index_abstract + count_abstract > this.count_abstract'); }
        if (count_abstract === 0) { return; }

        if (index_abstract + count_abstract === this.count_abstract) {
            let shiftableCount_abstract = this.count_abstract - (index_abstract + count_abstract);
            if (shiftableCount_abstract > 0) {
                this.copyTo(
                    this.data_literal,
                    index_abstract + count_abstract,
                    this.data_literal,
                    index_abstract,
                    shiftableCount_abstract);
            }
        }
        else {
            this.copyTo(
                this.data_literal,
                index_abstract + count_abstract,
                this.data_literal,
                index_abstract,
                this.count_abstract - (index_abstract + count_abstract));
        }

        this.count_abstract -= count_abstract;
    }

    /**
     * - If the size asked for cannot be allocated, an exception will be thrown. (presumably the wording "thrown by the runtime" is involved.)
     * - JavaScript numbers do not wrap around to negative values when the value is very large.
     *       They instead approach infinity and lose precision.
     *       - There still is a check for whether the new, expected to be larger, capacity is smaller for whatever reason.
     *         Since this ought to be a negligible check for this method to perform.
     *         And failure to catch that case if it happens is an infinite loop.
     */
    ensureCapacityForInsertion(index_abstract, count_abstract) {
        let capacityPrevious_abstract = this.capacity_abstract;
        while (true) {
            if (this.count_abstract + count_abstract > this.capacity_abstract) {
                this.doubleCapacity();
            }
            else if (index_abstract >= this.capacity_abstract) {
                this.doubleCapacity();
            }
            else {
                break;
            }

            if (this.capacity_abstract === capacityPrevious_abstract) {
                break;
            }
            if (this.capacity_abstract < capacityPrevious_abstract) {
                throw new Error('ensureCapacityForInsertion(...): this.capacity_abstract < capacityPrevious_abstract');
            }

            capacityPrevious_abstract = this.capacity_abstract;
        }
    }

    doubleCapacity() {
        let capacityNew_literal = this.capacity_literal * 2;
        let dataNew_literal = new Uint32Array(capacityNew_literal);
        this.copyTo(this.data_literal, 0, dataNew_literal, 0, this.count_abstract);
        this.data_literal = dataNew_literal;
        this.capacity_literal = capacityNew_literal;
        this.capacity_abstract *= 2;
    }

    /**
     * inclusive/exclusive
     */
    copyTo(dataSource_literal, sourceStart_abstract, dataDestination_literal, destinationStart_abstract, length_abstract) {

        if (dataSource_literal === dataDestination_literal) {
            if (dataSource_literal !== this.data_literal) {
                throw new Error('dataSource_literal === dataDestination_literal ; but dataSource_literal !== this.data_literal');
            }

            let distance_abstract = destinationStart_abstract - sourceStart_abstract;

            if (distance_abstract > 0) {
                for (var i_abstract = sourceStart_abstract + length_abstract - 1; i_abstract >= sourceStart_abstract; i_abstract--) {
                    let iplusd_abstract = i_abstract + distance_abstract;
                    let iplusd_literal = iplusd_abstract * this.field_count;
                    let i_literal = i_abstract * this.field_count;
                    this.data_literal[iplusd_literal + this.trackedSyntaxKind_offset] = this.data_literal[i_literal + this.trackedSyntaxKind_offset];
                    this.data_literal[iplusd_literal + this.start_offset] = this.data_literal[i_literal + this.start_offset];
                    this.data_literal[iplusd_literal + this.length_offset] = this.data_literal[i_literal + this.length_offset];
                }
            }
            else {
                for (var i_abstract = destinationStart_abstract; i_abstract < this.count_abstract; i_abstract++) {
                    let iminusd_abstract = i_abstract - distance_abstract;
                    let iminusd_literal = iminusd_abstract * this.field_count;
                    let i_literal = i_abstract * this.field_count;
                    this.data_literal[i_literal + this.trackedSyntaxKind_offset] = this.data_literal[iminusd_literal + this.trackedSyntaxKind_offset];
                    this.data_literal[i_literal + this.start_offset] = this.data_literal[iminusd_literal + this.start_offset];
                    this.data_literal[i_literal + this.length_offset] = this.data_literal[iminusd_literal + this.length_offset];
                }
            }
        }
        else {
            // TODO: use the existing method to copy between arrays.
            // TODO: use google to search for this already existing method.
            // TODO: I'm gonna push this code that doesn't run and break the main branch
            //
            for (var i_abstract = 0; i_abstract < length_abstract; i_abstract++) {
                let dSplusi_abstract = destinationStart_abstract + i_abstract;
                let dSplusi_literal = dSplusi_abstract * this.field_count;
                let sSplusi_abstract = sourceStart_abstract + i_abstract;
                let sSplusi_literal = sSplusi_abstract * this.field_count;
                dataDestination_literal[dSplusi_literal + this.trackedSyntaxKind_offset] = dataSource_literal[sSplusi_literal + this.trackedSyntaxKind_offset];
                dataDestination_literal[dSplusi_literal + this.start_offset] = dataSource_literal[sSplusi_literal + this.start_offset];
                dataDestination_literal[dSplusi_literal + this.length_offset] = dataSource_literal[sSplusi_literal + this.length_offset];
            }
        }
    }
}

/**
 * Strings and comments are the "only syntax" that entirely clobber how text should be lexed.
 * 
 * Thus if I do one full file lex to get the positions of them,
 * then at any scroll position, I can give the respective lexer
 * that subset of text that the user sees, and lex it quite accurately if not 100% accurately... I'm not sure.
 * 
 * TODO: These need to be stored in more optimized way. Storing each one as a class instance is extremely expensive overhead for what it is doing.
 */
class TrackedSyntax {
    constructor (trackedSyntaxKind, start, length) {
        this.trackedSyntaxKind = trackedSyntaxKind;
        this.start = start;
        this.length = length;
    }
}

let EDITOR_pooledTrackedSyntax = new TrackedSyntax(TrackedSyntaxKind.None, 0, 0);

let EDITOR_trackedSyntaxList = new TrackedSyntaxList(32);

class ByteList {
    bytes;
    capacity;
    count;

    constructor(initialCapacity) {
        // The Uint8Array avoids serialization during IPC
        this.bytes = new Uint8Array(initialCapacity);
        this.capacity = initialCapacity;
        this.count = 0;
    }

    /**
     * Does not clear the information, only sets 'this.count' to '0'.
     */
    clear() {
        this.count = 0;
    }

    /**
     * TODO: ensure all the parameters are encoded, especially because I'm noticing myself forgetting.
     */
    insert(index, byte) {
        this.ensureCapacityForInsertion(index, 1);

        if (index !== this.count) {
            this.copyTo(this.bytes, index, this.bytes, index + 1, this.count - index);
        }

        this.bytes[index] = byte;

        this.count++;
    }

    insertString(index, string, encoder) {
        this.ensureCapacityForInsertion(index, string.length);

        if (index !== this.count) {
            this.copyTo(this.bytes, index, this.bytes, index + string.length, this.count - index);
        }

        for (var i = 0; i < string.length; i++) {
            this.bytes[index + i] = encoder.encode(string[i]);
        }

        this.count += string.length;
    }
    
    /**
     * @param {*} index 
     * @param {*} incomingBs Uint8Array, avoid naming conflict with this.bytes
     * @param {*} offset
     * @param {*} length
     */
    insertBytes(index, incomingBs, offset, length) {
        this.ensureCapacityForInsertion(index, length);

        if (index !== this.count) {
            this.copyTo(this.bytes, index, this.bytes, index + length, this.count - index);
        }

        for (var i = 0; i < length; i++) {
            this.bytes[index + i] = incomingBs[offset + i];
        }

        this.count += length;
    }

    /**
     * @param {number} index 
     * @param {Uint8Array} incomingBs the incoming bytes, name avoids confusion with this.bytes
     * @param {number} offset the offset to begin reading from
     * @param {number} length the amount of bytes to read
     */
    insertBytes(index, incomingBs, offset, length) {
        this.ensureCapacityForInsertion(index, length);

        if (index !== this.count) {
            this.copyTo(this.bytes, index, this.bytes, index + length, this.count - index);
        }

        for (var i = 0; i < length; i++) {
            this.bytes[index + i] = incomingBs[offset + i];
        }

        this.count += length;
    }

    /**
     * Does not clear trailing information.
     * 
     * count === 0 immediately returns
     */
    removeAt(index, count) {

        if (index > this.count) { throw new Error('removeAt(...): index > this.count'); }
        if (index + count > this.count) { throw new Error('removeAt(...): index + count > this.count'); }
        if (count === 0) { return; }

        if (index + count === this.count) {
            let shiftableCount = this.count - (index + count);
            if (shiftableCount > 0) {
                this.copyTo(
                    this.bytes,
                    index + count,
                    this.bytes,
                    index,
                    shiftableCount);
            }
        }
        else {
            this.copyTo(
                this.bytes,
                index + count,
                this.bytes,
                index,
                this.count - (index + count));
        }

        this.count -= count;
    }

    /**
     * - If the size asked for cannot be allocated, an exception will be thrown. (presumably the wording "thrown by the runtime" is involved.)
     * - JavaScript numbers do not wrap around to negative values when the value is very large.
     *       They instead approach infinity and lose precision.
     *       - There still is a check for whether the new, expected to be larger, capacity is smaller for whatever reason.
     *         Since this ought to be a negligible check for this method to perform.
     *         And failure to catch that case if it happens is an infinite loop.
     */
    ensureCapacityForInsertion(index, count) {
        let capacityPrevious = this.capacity;
        while (true) {
            if (this.count + count > this.capacity) {
                this.doubleCapacity();
            }
            else if (index >= this.capacity) {
                this.doubleCapacity();
            }
            else {
                break;
            }

            if (this.capacity === capacityPrevious) {
                break;
            }
            if (this.capacity < capacityPrevious) {
                throw new Error('ensureCapacityForInsertion(...): this.capacity < capacityPrevious');
            }

            capacityPrevious = this.capacity;
        }
    }

    doubleCapacity() {
        let capacityNew = this.capacity * 2;
        let bytesNew = new Uint8Array(capacityNew);
        this.copyTo(this.bytes, 0, bytesNew, 0, this.count);
        this.bytes = bytesNew;
        this.capacity = capacityNew;
    }

    /**
     * inclusive/exclusive
     */
    copyTo(bytesSource, sourceStart, bytesDestination, destinationStart, length) {

        if (bytesSource === bytesDestination) {
            if (bytesSource !== this.bytes) {
                throw new Error('bytesSource === bytesDestination ; but bytesSource !== this');
            }

            let distance = destinationStart - sourceStart;

            if (distance > 0) {
                for (var i = sourceStart + length - 1; i >= sourceStart; i--) {
                    this.bytes[i + distance] = this.bytes[i];
                }
            }
            else {
                for (var i = destinationStart; i < this.count; i++) {
                    this.bytes[i] = this.bytes[i - distance];
                }
            }
        }
        else {
            // TODO: use the existing method to copy between arrays.
            // TODO: use google to search for this already existing method.
            // TODO: I'm gonna push this code that doesn't run and break the main branch
            //
            for (var i = 0; i < length; i++) {
                bytesDestination[destinationStart + i] = bytesSource[sourceStart + i];
            }
        }
    }
}

class UInt32List {
    data;
    capacity;
    count;

    constructor(initialCapacity) {
        // The Uint8Array avoids serialization during IPC
        this.data = new Uint32Array(initialCapacity);
        this.capacity = initialCapacity;
        this.count = 0;
    }

    /**
     * Does not clear the information, only sets 'this.count' to '0'.
     */
    clear() {
        this.count = 0;
    }

    /**
     * TODO: ensure all the parameters are encoded, especially because I'm noticing myself forgetting.
     */
    insert(index, int32Value) {
        this.ensureCapacityForInsertion(index, 1);

        if (index !== this.count) {
            this.copyTo(this.data, index, this.data, index + 1, this.count - index);
        }

        this.data[index] = int32Value;

        this.count++;
    }

    /**
     * Does not clear trailing information.
     * 
     * count === 0 immediately returns
     */
    removeAt(index, count) {

        if (index > this.count) { throw new Error('removeAt(...): index > this.count'); }
        if (index + count > this.count) { throw new Error('removeAt(...): index + count > this.count'); }
        if (count === 0) { return; }

        if (index + count === this.count) {
            let shiftableCount = this.count - (index + count);
            if (shiftableCount > 0) {
                this.copyTo(
                    this.data,
                    index + count,
                    this.data,
                    index,
                    shiftableCount);
            }
        }
        else {
            this.copyTo(
                this.data,
                index + count,
                this.data,
                index,
                this.count - (index + count));
        }

        this.count -= count;
    }

    /**
     * - If the size asked for cannot be allocated, an exception will be thrown. (presumably the wording "thrown by the runtime" is involved.)
     * - JavaScript numbers do not wrap around to negative values when the value is very large.
     *       They instead approach infinity and lose precision.
     *       - There still is a check for whether the new, expected to be larger, capacity is smaller for whatever reason.
     *         Since this ought to be a negligible check for this method to perform.
     *         And failure to catch that case if it happens is an infinite loop.
     */
    ensureCapacityForInsertion(index, count) {
        let capacityPrevious = this.capacity;
        while (true) {
            if (this.count + count > this.capacity) {
                this.doubleCapacity();
            }
            else if (index >= this.capacity) {
                this.doubleCapacity();
            }
            else {
                break;
            }

            if (this.capacity === capacityPrevious) {
                break;
            }
            if (this.capacity < capacityPrevious) {
                throw new Error('ensureCapacityForInsertion(...): this.capacity < capacityPrevious');
            }

            capacityPrevious = this.capacity;
        }
    }

    doubleCapacity() {
        let capacityNew = this.capacity * 2;
        let bytesNew = new Uint32Array(capacityNew);
        this.copyTo(this.data, 0, bytesNew, 0, this.count);
        this.data = bytesNew;
        this.capacity = capacityNew;
    }

    /**
     * inclusive/exclusive
     */
    copyTo(bytesSource, sourceStart, bytesDestination, destinationStart, length) {

        if (bytesSource === bytesDestination) {
            if (bytesSource !== this.data) {
                throw new Error('bytesSource === bytesDestination ; but bytesSource !== this');
            }

            let distance = destinationStart - sourceStart;

            if (distance > 0) {
                for (var i = sourceStart + length - 1; i >= sourceStart; i--) {
                    this.data[i + distance] = this.data[i];
                }
            }
            else {
                for (var i = destinationStart; i < this.count; i++) {
                    this.data[i] = this.data[i - distance];
                }
            }
        }
        else {
            // TODO: What is the uint8array 'set' function
            //
            // TODO: use the existing method to copy between arrays.
            // TODO: use google to search for this already existing method.
            // TODO: I'm gonna push this code that doesn't run and break the main branch
            //
            for (var i = 0; i < length; i++) {
                bytesDestination[destinationStart + i] = bytesSource[sourceStart + i];
            }
        }
    }
}

const ASCII_LINE_FEED = 10;
const ASCII_TAB = 9;
const ASCII_SPACE = 32;

/**
 * @type {UInt32List}
 */
let EDITOR_findOverlay_searchResultPositionList;

let EDITOR_textByteList = new ByteList(1024);
const EDITOR_encoder = new TextEncoder();
const EDITOR_decoder = new TextDecoder();

class EDITOR_Cursor {

    static STATIC_CURSOR_ID = 1;
    /**
     * I'm not sure how large I want this, what matters is that I just have a size of anything for the time being, then can change this constant later.
     */
    static GAP_BUFFER_CAPACITY = 32;

    /**
     * After invoking the constructor you likely would want to add to:
     * - EDITOR_cursorListElement,
     * - EDITOR_cursorList,
     * 
     * `EDITOR_cursorListElement.appendChild(cursorInstance.caretRow)`
     * `EDITOR_cursorList.splice(index, 0, cursorInstance)`
     */
    constructor() {
        this.indexLine = 0;
        this.indexColumn = 0;
        /**
         * When moving cursor vertically, if the current column index cannot be matched due to the upcoming line being too short,
         * then this will allow a later vertical movement to a line that is long enough to match the original column rather than the minimized one.
         */
        this.STORED_indexColumn = 0;
        this.cursorTopValue = 0;
        this.cursorLeftValue = 0;
        this.selectionAnchor = 0;
        this.selectionEnd = 0;
        this.DRAWN_selectionAnchor = 0;
        this.DRAWN_selectionEnd = 0;
        this.editKind = EditKind.None;
        this.editLength = 0;
        this.editPosition = 0;
        this.editIndexLine = 0;
        this.editIndexColumn = 0;
        this.END_editIndexLine = 0;
        this.END_editIndexColumn = 0;
        // TODO: This is supposed to say 'cursorId'
        this.cursorIndex = EDITOR_Cursor.STATIC_CURSOR_ID++;
        this.htmlId = "EDITOR_cursor-" + this.cursorIndex;
        
        /**
         * When this is cleared the information is not removed, only 'gapBufferCount' is set to 0.
         */
        this.gapBuffer = new Uint8Array(EDITOR_Cursor.GAP_BUFFER_CAPACITY);
        this.gapBufferCount = 0;
        this.gapBufferWriteToSpanElement = null;
        this.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;

        this.caretRow = document.createElement('div');
        this.caretRow.id = "EDITOR_caretRow-" + this.cursorIndex;
        this.caretRow.className = "EDITOR_caretRow";
        this.cursorElement = document.createElement('div');
        this.cursorElement.id = "EDITOR_cursor-" + this.cursorIndex;
        this.cursorElement.className = "EDITOR_cursor";
        
        this.caretRow.appendChild(this.cursorElement);
    }

    hasSelection() {
        return this.selectionAnchor >= 0 &&
               this.selectionEnd >= 0 &&
               this.selectionAnchor != this.selectionEnd;
    }
    
    /**
     * The code that clears the editor is dependent on this method NOT clearing 'cursor.selectionDivExists'
     * 
     * Somewhat duplicated code: This messes with the language features if I invoke clear() in the constructor, it puts "| undefined" on all the types.
     */
    clear() {
        this.indexLine = 0;
        this.indexColumn = 0;
        this.STORED_indexColumn = 0;
        this.cursorTopValue = 0;
        this.cursorLeftValue = 0;
        this.selectionAnchor = 0;
        this.selectionEnd = 0;
        this.DRAWN_selectionAnchor = 0;
        this.DRAWN_selectionEnd = 0;
        this.editKind = EditKind.None;
        this.editLength = 0;
        this.editPosition = 0;
        this.editIndexLine = 0;
        this.editIndexColumn = 0;
        this.END_editIndexLine = 0;
        this.END_editIndexColumn = 0;

        this.gapBufferCount = 0;
    }

    /**
     * Not all properties are necessarily cloned in this method:
     */
    clone() {
        let clone = new EDITOR_Cursor();
        clone.indexLine = this.indexLine;
        clone.indexColumn = this.indexColumn;
        clone.STORED_indexColumn = this.STORED_indexColumn;
        clone.cursorTopValue = this.cursorTopValue;
        clone.cursorLeftValue = this.cursorLeftValue;
        return clone;
    }
}

const EDITOR_baseElement = document.getElementById('EDITOR');
const EDITOR_virtualizationBoundary = document.getElementById('EDITOR_virtualizationBoundary');
const EDITOR_gutter = document.getElementById('EDITOR_gutter_container');
const EDITOR_horizontal_scrollbar = document.getElementById('EDITOR_horizontal_scrollbar');
const EDITOR_horizontal_scrollbar_virtualization_boundary = document.getElementById('EDITOR_horizontal_scrollbar_virtualization_boundary');
const EDITOR_body = document.getElementById('EDITOR_body');
const EDITOR_presentation = document.getElementById('EDITOR_presentation');
const EDITOR_cursorListElement = document.getElementById('EDITOR_cursorList');
const EDITOR_textElement = document.getElementById('EDITOR_text');
const EDITOR_debug = document.getElementById('EDITOR_debug');
const EDITOR_findOverlay = document.getElementById('EDITOR_findOverlay');
EDITOR_findOverlay.style.visibility = 'hidden';

let EDITOR_drawn_count_of_digits_longest_line_number = 0;

/**
 * Upon an enter keystroke this is inserted onto the newly added line.
 * 
 * The value is stored here to avoid high overhead from indentation matching when holding down the Enter key.
 * 
 * TODO: ^ that being said, you preferably wouldn't store this string allocation long term. If a more "localized" caching can be implemented, that would be preferable. (or the timing upon which this is set to null)
 * 
 * TODO: Don't null this just change the count to 0 and use a separate bool to indicate "nullness". UNLESS if clearing cache and this is for some reason MASSIVE idk maybe > 256 then maybe clear it idk
 * 
 * TODO: clear these when setting text, if not already? My code isn't working so I can't give a better TODO than this
 * 
 * @type {ByteList | null}
 */
let EDITOR_cached_indentation_byteList = null;
let EDITOR_cached_indentation_string = null;

let EDITOR_horizontal_scrollbar_widthValue = 0;
let EDITOR_horizontal_scrollbar_scrollWidth = 0;

let EDITOR_findOverlay_show = false;
let EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = false;
let EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber = 0;

const EDITOR_tab_tabsbytes = new Uint8Array(4);
EDITOR_tab_tabsbytes[0] = ASCII_TAB;
EDITOR_tab_tabsbytes[1] = 0;
EDITOR_tab_tabsbytes[2] = 0;
EDITOR_tab_tabsbytes[3] = 0;
const EDITOR_tab_spacesbytes = new Uint8Array(4);
EDITOR_tab_spacesbytes[0] = ASCII_SPACE;
EDITOR_tab_spacesbytes[1] = ASCII_SPACE;
EDITOR_tab_spacesbytes[2] = ASCII_SPACE;
EDITOR_tab_spacesbytes[3] = ASCII_SPACE;
/**
 * Null characters provide visual width for proportional fonts. They do not get copied or saved out.
 */
let EDITOR_on_tab_bytes = EDITOR_tab_tabsbytes;

/**
 * IMPORTANT: use EDITOR_readLineEndPositionList(...) rather than indexing into this directly...
 * ...due to the possibility of pending edits.
 */
let EDITOR_lineEndPositionList = new UInt32List(128);

/** TODO: The decimals are being truncated by default / ought to be avoided regardless for performance? Use Math.Ceiling? */
let EDITOR_lineHeight = 20;

let EDITOR_characterWidth = 8;
let EDITOR_recentBoundingClientRect = null;
let EDITOR_primaryCursor = new EDITOR_Cursor();
EDITOR_cursorListElement.appendChild(EDITOR_primaryCursor.caretRow);
/**
 * Ensure that the cursors are sorted ascending by positionIndex (which is calculated via the method 'EDITOR_getPositionIndex(...)') at all times.
 */
let EDITOR_cursorList = [EDITOR_primaryCursor];

let EDITOR_throttleMousemove = (...args) => {};
let EDITOR_throttleScroll = (...args) => {};
let EDITOR_throttleResize = (...args) => {};

/*
If an exception occurs, you need to set the throttle timer to null,
otherwise no further events will ever run, because it was left in a bad state.
*/
let EDITOR_restoreThrottle_mouseMove = () => {};
let EDITOR_restoreThrottle_scroll = () => {};
let EDITOR_restoreThrottle_resize = () => {};

let EDITOR_isSourceOfLeftMouseButton = false;

let EDITOR_detailRank = 0;

let EDITOR_detailSmallLarge = {
    SmallPosition: 0,
    LargePosition: 0,
};

let EDITOR_detailRank3OriginLine = 0;

let EDITOR_textSourceIdentifier = '';
let EDITOR_fileStartsWithBom = false;

let EDITOR_lineEndString = null;

/**
 * Pixels.
 * 
 * The gutter width changes far more frequently than the line height.
 * That is why the gutter width is a JavaScript variable, and the styles are updated from JavaScript.
 * 
 * Whereas the line height is a css variable (and thus could cause layout for the entire application whenever it changes).
 */
let EDITOR_gutterWidthStyleValue = 32;
/**
 * This is the sum of the 'EDITOR_gutterWidthStyleValue' in addition to the left and right padding
 */
let EDITOR_gutterWidthTotal = 32;
let EDITOR_gutterPaddingLeft = 3;
let EDITOR_gutterPaddingRight = 6;

let EDITOR_virtualLineIndex;
let EDITOR_virtualCount;

/** LSP: array of DocumentSymbol */
let EDITOR_documentSymbolResult;
/**
 * @type {ListComponent}
 */
let EDITOR_listComponent = new ListComponent();

EDITOR_measureLineHeightAndCharacterWidth();

EDITOR_gutter.style.paddingLeft = EDITOR_gutterPaddingLeft + 'px';
EDITOR_gutter.style.paddingRight = EDITOR_gutterPaddingRight + 'px';
EDITOR_gutter.style.width = EDITOR_characterWidth + 'px';

let left = (EDITOR_gutterPaddingLeft + EDITOR_gutterPaddingRight + EDITOR_characterWidth) + 'px';
let width = 'calc(100% - ' + left + ')';

EDITOR_body.style.marginLeft = left;

EDITOR_body.style.width = width;

EDITOR_drawHorizontalScrollbar();

EDITOR_registerHandlers();

/**
 * @param {*} indexLine
 * @returns {number} the last valid POSITION index on the line, but with respect to any pending edits.
 */
function EDITOR_readLineEndPositionList(indexLine) {
    let lineEndPositionIndex = EDITOR_lineEndPositionList.data[indexLine];

    // If you need to determine the text without finalizing an edit, you DO have to loop forwards right?
    for (var i = 0; i < EDITOR_cursorList.length; i++) {
        let cursor = EDITOR_cursorList[i];
        if (cursor.editLength > 0 & cursor.editPosition <= lineEndPositionIndex) {
            switch (cursor.editKind) {
                case EditKind.InsertLtr:
                    lineEndPositionIndex += cursor.editLength;
                    break;
                case EditKind.DeleteLtr:
                case EditKind.BackspaceRtl:
                case EditKind.RemoveTextNoBatching:
                    lineEndPositionIndex -= cursor.editLength;
                    break;
            }
        }
    }

    return lineEndPositionIndex;
}

function EDITOR_clear() {
    EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
    EDITOR_primaryCursor.clear();
    EDITOR_clearSelectionStyle(EDITOR_primaryCursor);
    EDITOR_recentBoundingClientRect = null;
    EDITOR_textSourceIdentifier = '';
    EDITOR_fileStartsWithBom = '';
    EDITOR_lineEndString = null;
    EDITOR_textElement.innerHTML = '';
    EDITOR_lineEndPositionList.clear();
    EDITOR_gutter.innerHTML = '';
    EDITOR_textByteList.clear();
    EDITOR_trackedSyntaxList.clear();
    EDITOR_drawCursor(EDITOR_primaryCursor);
}

/**
 * This function finalizes any pending edits foreach cursor in the EDITOR_cursorList.
 * 
 * Does NOT clear multicursors, only finalizes their respective edits;
 * 
 * see also: 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'
 * 
 * TODO: many places where this is invoked, it is likely intended to actually invoke 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...in order to permit slow 1 by 1 support for multicursor foreach scenario...
 * ...actually that's a good point...
 * ...you might wanna start by enabling multi-cursor insertion, but anything else invokes 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...then you can slowly add in support without breaking things?...
 * ...so specifically what I'm saying here is, an upcoming task would be...
 * ...simply to ensure that nearly every event invokes 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...and that the ones which can't i.e.: batch insertions; you could do a check if cursor count >1 then finalize only the non-primary or some such...
 * ...then you remove the safeguard for 1 feature at a time.
 */
function EDITOR_finalizeAllCursors() {
    for (let i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        EDITOR_finalizeEdit(EDITOR_cursorList[i]);
    }
}

/**
 * This function finalizes pending edits foreach cursor in the EDITOR_cursorList
 * AND removes any non-EDITOR_primaryCursor from the EDITOR_cursorList.
 * 
 * see also: 'EDITOR_finalizeAllCursors'
 * 
 * TODO: a good name for this function
 */
function EDITOR_finalizeAllCursors_andClearNonPrimaryCursors() {
    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        let cursor = EDITOR_cursorList[i];
        EDITOR_finalizeEdit(cursor);
        if (cursor !== EDITOR_primaryCursor) {
            // A cursor is not necessarily rendered, thus this check
            if (cursor.caretRow.parentElement === EDITOR_cursorListElement) {
                EDITOR_cursorListElement.removeChild(cursor.caretRow);
            }
            EDITOR_clearSelectionStyle(cursor);
            EDITOR_cursorList.splice(i, 1);
        }
    }
}

/**
 * Returns the underlying uint8array that contains the encoded characters for the text.
 * The uint8array's capacity (i.e.: length) is not what should be saved out.
 * Instead only save the countOfBytesInUse.
 * 
 * The editor stores all line endings as '\n'.
 * When saving the bytes, swap out any '\n' for the 'lineEndString' which may or may not be '\n' (i.e.: it could be '\r\n' or '\r').
 * 
 * Tab characters are stored as '\t\0\0\0'.
 * When saving out the bytes you need to skip over these '\0' characters.
 * 
 * A '\0' character does NOT terminate the subarray's bytes that are in use.
 * You need to iterate specifically for 'countOfBytesInUse'.
 * 
 * @param {*} NOTfinalizePendingEdits if there is a pending edit, it needs to be finalized in order to see the updated text. The default behavior is to finalize the pending edits. To use default behavior, do NOT provide the parameter, or provide a falsey expression like 'null'.
 * @returns
 */
function EDITOR_getFinalizedEditsAndRawSaveFileData(NOTfinalizePendingEdits) {
    if (!NOTfinalizePendingEdits) {
        EDITOR_finalizeAllCursors();
    }
    return {
        uint8arrayTextBytes: EDITOR_textByteList.bytes,
        countOfBytesInUse: EDITOR_textByteList.count,
        lineEndString: EDITOR_lineEndString,
        fileStartsWithBom: EDITOR_fileStartsWithBom
    };
}

/**
 * 
 * @param {string} text 
 * @param {string} textSourceIdentifier I intend to have this be an absolute path. Then when the app saves a file, it can verify against the database that this absolute path is "safe" and then write to the file.
 * @param {string} lineEndString pass null (or do not include the parameter) to have line endings set to the first encountered kind in the text. Otherwise specify here. The string is used EXACTLY AS PROVIDED if non-falsey.
 */
function EDITOR_setText(text, fileStartsWithBom, textSourceIdentifier, lineEndString) {
    EDITOR_clear();

    EDITOR_fileStartsWithBom = fileStartsWithBom;

    EDITOR_textSourceIdentifier = textSourceIdentifier;
    EDITOR_lineEndString = lineEndString;

    // When doing a "full reset" it is easier to just add EOF at the end.
    EDITOR_lineEndPositionList.clear();

    for (var sourceI = 0; sourceI < text.length; sourceI++) {
        switch (text[sourceI]) {
            case '\r':
                if (sourceI < text.length - 1 & text[sourceI + 1] === '\n') {
                    if (!EDITOR_lineEndString) {
                        EDITOR_lineEndString = '\r\n';
                    }
                    sourceI++;
                }
                else {
                    if (!EDITOR_lineEndString) {
                        EDITOR_lineEndString = '\r';
                    }
                }
                EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);
                EDITOR_textByteList.insert(EDITOR_textByteList.count, ASCII_LINE_FEED);
                break;
            case '\n':
                if (!EDITOR_lineEndString) {
                    EDITOR_lineEndString = '\n';
                }
                EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);
                EDITOR_textByteList.insert(EDITOR_textByteList.count, ASCII_LINE_FEED);
                break;
            case '\t':
                EDITOR_textByteList.insertBytes(EDITOR_textByteList.count, EDITOR_tab_tabsbytes, /*offset*/ 0, /*length*/ 4);
                break;
            default:
                // TODO: add a function for '.add' and avoid the "pointless" passing of count in scenarios like this.
                //
                // tbh: TODO: 'charCodeAt' also might be more allocation expensive than you expect. It returns a JavaScript number. Switching and returning an index from byte array prehardcoded might avoid an allocation per number returned?
                // ... although I hear most engines store numbers such that the pointer represents the value and you avoid the allocation but even then where is the metadata that tells you how to read that pointer differently than the other ones etc...
                //
                EDITOR_textByteList.insert(EDITOR_textByteList.count, text.charCodeAt(sourceI));
                break;
        }
    }

    EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);

    update_VirtualLineIndex();
    update_virtualCount();

    update_verticalVirtualizationBoundary();

    if (JS_full_lex) {
        EDITOR_trackedSyntaxList = JS_full_lex(EDITOR_textByteList.bytes, EDITOR_textByteList.count);
    }

    EDITOR_drawGutter_Width();
    EDITOR_drawViewPort();
}

/**
 * You may want to update the vertical virtualization boundary prior to actually updating the EDITOR_lineEndPositionList.
 * Thus this function takes a 'lineCount' which defaults to EDITOR_lineEndPositionList.count if falsey.
 * @param {number | null | undefined} lineCount In order to permit arbitrarily updating the vertical virtualization boundary, this takes a lineCount. If falsey, then EDITOR_lineEndPositionList.count is used.
 */
function update_verticalVirtualizationBoundary(lineCount) {
    if (!lineCount) lineCount = EDITOR_lineEndPositionList.count;
    EDITOR_virtualizationBoundary.style.height = ((lineCount + EDITOR_virtualCount - 1) * EDITOR_lineHeight) + 'px';
}

function update_VirtualLineIndex() {
    EDITOR_virtualLineIndex = Math.floor(EDITOR_baseElement.scrollTop / EDITOR_lineHeight);
    let top = (EDITOR_virtualLineIndex * EDITOR_lineHeight) + 'px';
    EDITOR_gutter.style.top = top;
    EDITOR_textElement.style.top = top;
}

function update_virtualCount() {
    EDITOR_virtualCount = Math.ceil(EDITOR_baseElement.offsetHeight / EDITOR_lineHeight);
}

/**
 * If the 'EDITOR_drawn_count_of_digits_longest_line_number === positiveNumbersOnly_countDigitsLoop(EDITOR_lineEndPositionList.count)'
 * then the function does nothing.
 * 
 * TODO: Track the min and max until length changes and then only 2 operations at worst case than while
 */
function EDITOR_drawGutter_Width() {
    let digitCountOfLargestLineNumber = positiveNumbersOnly_countDigitsLoop(EDITOR_lineEndPositionList.count);
    if (EDITOR_drawn_count_of_digits_longest_line_number === digitCountOfLargestLineNumber) return;

    EDITOR_drawn_count_of_digits_longest_line_number = digitCountOfLargestLineNumber;

    EDITOR_gutterWidthStyleValue = Math.ceil(digitCountOfLargestLineNumber * EDITOR_characterWidth);
    EDITOR_gutterWidthTotal = EDITOR_gutterWidthStyleValue + EDITOR_gutterPaddingLeft + EDITOR_gutterPaddingRight;
    EDITOR_gutter.style.width = EDITOR_gutterWidthStyleValue + 'px';
    
    let left = EDITOR_gutterWidthTotal + 'px';
    let width = 'calc(100% - ' + left + ')';
    EDITOR_body.style.marginLeft = left;
    EDITOR_body.style.width = width;

    EDITOR_drawHorizontalScrollbar();
}

/*
 # Drawing text / gutter
 TODO: this comment is needs to be updated, and likely fails to account for when the line being edited is not part of the "virtualization result"
 =======================

 Table of Contents:
 - Modify the existing HTML directly:
     - divs that represent lines of text or
     - the child spans that represent chunks of same styled text on the same line.
 - redraw specific lines in their entirety.
 - redraw entire viewport

 ------------------------------------------------------------

 - Modify the existing HTML directly:
     - divs that represent lines of text or
     - the child spans that represent chunks of same styled text on the same line.
     - This is the most complex, but most optimized solution.
     - The statement 'let walked = walkLineUntilColumnIndex(...);' can be used to conditionally branch off the 'walked' variable in order to possibly ease the complexity.
         - ```csharp
           if (walked.goalColumnI === -1) {
               return;
           }
           if (walked.goalColumnI == 0) {
               if (walked.lineDiv.children.length > 0) {
                   // This is the expected case
               }
               else {
                   // This case perhaps should be removed since you are to ensure there always exists at least 1 div,
                   // and within every div at least 1 span (regardless of whether that span is empty or not)
               }
           }
           else {
               let spanElement = walked.lineDiv.children[walked.indexSpanChild];
   
               if (walked.goalColumnI == walked.runColumnI + spanElement.textContent.length) {
                   // ...
               }
               else {
                   let relativeColumnI = walked.goalColumnI - walked.runColumnI;
                   // ...
               }
           }
           ```
 - redraw specific lines in their entirety.
     - Must empty the innerHTML of the 'gutterLineElement' and 'lineDiv'
         - i.e.: 'someElement.innerHTML = ""';
     - Then invoke EDITOR_drawLine(...)
         - You provide the two HTML elements that were previously mentioned, along with the index of the line that should be drawn into those respective elements.
 - redraw entire viewport
     - Must empty the innerHTML of the 'EDITOR_gutter' and 'EDITOR_textElement'
     - EDITOR_drawViewPort()
 */

/**
 * If the state is bad then the following is returned:
 * { goalColumnI: -1, runColumnI: -1, indexChild: -1, lineDiv: null, };
 * 
 * if (walked.goalColumnI === -1) { throw new Error('walked.goalColumnI === -1'); }
 * 
 * if (walked.lineDiv.children.length === 0) { throw new Error('walked.lineDiv.children.length === 0'); }
 * 
 * NOTE: when copying and pasting code be sure the snippet uses the respective 'break' or 'return' that you're interested in...
 * ...as those keywords are common in code that use the result of this function, but can vary on a case by case basis.
 * 
 * NOTE: 
 * 
 * @param {EDITOR_Cursor} cursor
 * @returns
 */
function walkLineUntilColumnIndex(cursor) {
    let indexLine_VirtualRelative = cursor.indexLine - EDITOR_virtualLineIndex;

    if (cursor.indexLine >= EDITOR_lineEndPositionList.count ||
        indexLine_VirtualRelative >= EDITOR_textElement.children.length ||
        indexLine_VirtualRelative < 0) {

        return {
            indexColumn_Goal: -1,
            indexColumn_Sum: -1,
            indexColumn_SpanTextContentRelative: -1,
            indexSpan: -1,
            span: null,
            div: null,
        };
    }
    
    let div = EDITOR_textElement.children[indexLine_VirtualRelative];
    let indexColumn_Goal = cursor.indexColumn + EDITOR_offsetColumn;
    let indexColumn_Sum = 0;

    for (var indexSpan = 0; indexSpan < div.children.length; indexSpan++) {
        let span = div.children[indexSpan];
        if (indexColumn_Goal <= indexColumn_Sum + span.textContent.length) {
            // '<=' because end-of-line text insertion (end of line but prior to the line ending itself).
            // The line ending isn't written to the span, it is represented by the encompassing div itself.
            return {
                indexColumn_Goal: indexColumn_Goal,
                indexColumn_Sum: indexColumn_Sum,
                indexColumn_SpanTextContentRelative: indexColumn_Goal - indexColumn_Sum,
                indexSpan: indexSpan,
                span: span,
                div: div,
            };
        }
        else {
            indexColumn_Sum += span.textContent.length;
        }
    }

    // TODO: When the column index is too large, how should this be handled?
    return {
        indexColumn_Goal: -1,
        indexColumn_Sum: -1,
        indexColumn_SpanTextContentRelative: -1,
        indexSpan: -1,
        span: null,
        div: null,
    };
}

/**
 * Use case: HTML was previously rendered, but the content of the line was modified
 * and logic to more efficiently manipulate the existing HTML is not yet written.
 * 
 * Example modifications:
 * - The same line index had its contents modified.
 * - Visually the line index that virtually appears as that child element is not the same as it previously was
 *   due to various reasons, perhaps a change in scroll position.
 * 
 * Prior to invoking this function ensure the provided elements's innerHTML is empty:
 * - "gutterLineElement.innerHTML = '';"
 * - "divElement.innerHTML = '';"
 * @param {number} indexLine 
 * @param {HTMLElement} gutterLineElement 
 * @param {HTMLElement} divElement 
 */
function EDITOR_drawLine(indexLine, gutterLineElement, textLineElement) {
    if (indexLine >= EDITOR_lineEndPositionList.count) {
        gutterLineElement.innerText = '~';
    }
    else {
        gutterLineElement.innerText = indexLine + 1;
    }

    let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(indexLine);
    if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
        trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
    }
    let line = EDITOR_getLineBoundaryPositions(indexLine);
    EDITOR_createSpansForLineOfText(textLineElement, line, trackedSyntax_StartingIndex);
}

/**
 * Invoker needs to empty the inner HTML of the 'EDITOR_gutter' and 'EDITOR_textElement'
 * 
 * TODO: I in practice find that the invoker needing to empty was confusing? Like I forgot to do it one time.
 * 
 * TODO: There is a more optimal way than this method that is still a 'drawViewPort'... where the lineCount is the same so you re-use the existing div elements in the gutter and the text. I do this elsewhere. Maybe put it here too or something?
 */
function EDITOR_drawViewPort() {
    let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(0 + EDITOR_virtualLineIndex);
    if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
        trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
    }

    let trackedSyntax_I = trackedSyntax_StartingIndex;

    for (var i = 0; i < EDITOR_virtualCount; i++) {
        let indexLine = i + EDITOR_virtualLineIndex;

        // EDITOR_drawGutter_Content()
        let gutterLineElement = document.createElement('div');
        if (indexLine >= EDITOR_lineEndPositionList.count) {
            gutterLineElement.innerText = '~';
        }
        else {
            gutterLineElement.innerText = indexLine + 1;
        }
        gutterLineElement.className = 'eG';
        EDITOR_gutter.appendChild(gutterLineElement);

        // EDITOR_drawText()
        let line = EDITOR_getLineBoundaryPositions(indexLine);

        let div = document.createElement('div');
        div.className = 'eT';

        trackedSyntax_I = EDITOR_createSpansForLineOfText(div, line, trackedSyntax_I);
        
        EDITOR_textElement.appendChild(div);
    }
}

/**
 * if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) { trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract; }
 * @param {*} indexLine 
 * @returns 
 */
function EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(indexLine) {
    let line = EDITOR_getLineBoundaryPositions(indexLine);
    let positionIndex = line.start;

    let left = 0;
    let right = EDITOR_trackedSyntaxList.count_abstract - 1;

    let lineIndex = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, mid);
        
        if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > positionIndex) {
            lineIndex = mid;

            if (EDITOR_pooledTrackedSyntax.start === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length <= positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return lineIndex;
}

/**
 * if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) { trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract; }
 * Probably should make 1 of these and accept a predicate.
 */
function EDITOR_trackedSyntaxReposition_find(positionIndex) {

    let left = 0;
    let right = EDITOR_trackedSyntaxList.count_abstract - 1;

    let lineIndex = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        let start = EDITOR_trackedSyntaxList.getStart(mid);
        
        if (positionIndex <= start) {
            lineIndex = mid;

            if (positionIndex === start) {
                break;
            }
            
            right = mid - 1;
        }
        else if (positionIndex > start) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return lineIndex;
}

// modification of Google AI Overview "javascript count of digits":
function positiveNumbersOnly_countDigitsLoop(number) {
  if (number <= 0) return 1;
  let count = 0;

  while (number > 0) {
    number = Math.floor(number / 10); // Remove the last digit
    count++; // Increment the count
  }

  return count;
}

/**
 * The returned div contains a single span which is empty.
 * This div is NOT added to EDITOR_textElement.
 */
function EDITOR_getNewAndEmptyLineElement() {
    let div = document.createElement('div');
    div.className = 'eT';
    let span = document.createElement('span');
    div.appendChild(span);
    return div;
}

function EDITOR_appendSimpleLine(string) {
    let div = document.createElement('div');
    div.className = 'eT';
    let span = document.createElement('span');
    span.innerText = string;
    div.appendChild(span);
    EDITOR_textElement.appendChild(div);
}

/**
 * This method will NOT "put a cursor on screen". You need to ensure
 * your cursor exists as a child by appendChild'ing to EDTIOR_cursorListElement.
 * This method instead only moves a cursor that ALREADY is being shown on screen.
 * 
 * If the 'cursor' is not EDITOR_primaryCursor, then the 'NOTscrollCursorIntoView' parameter has no effect.
 * i.e.: only the EDITOR_primaryCursor will ever be scrolled into view via this method.
 * 
 * @param {EDITOR_Cursor} cursor 
 * @param {boolean} NOTscrollCursorIntoView 
 */
function EDITOR_drawCursor(cursor, NOTscrollCursorIntoView) {
    cursor.cursorTopValue = cursor.indexLine * EDITOR_lineHeight;
    cursor.cursorLeftValue = (cursor.indexColumn + EDITOR_offsetColumn) * EDITOR_characterWidth;

    cursor.caretRow.style.top = cursor.cursorTopValue + 'px';
    cursor.cursorElement.style.left = cursor.cursorLeftValue + 'px';

    EDITOR_createStyleForSelection(cursor);

    if (cursor === EDITOR_primaryCursor) {
        

        EDITOR_debug.innerHTML = '';
        EDITOR_debug.innerText += '(' + cursor.indexLine + ', ' + cursor.indexColumn + ')';
        
        if (DIALOG_Settings_editorDebugShowAdjacentCharacters) {
	        let previous = EDITOR_getCharacterPrevious(cursor.indexColumn, EDITOR_getPositionIndex(cursor));
	        if (previous === '\n') previous = '\\n';
	        else if (previous === '\t') previous = '\\t';
	        let current = EDITOR_getCharacterCurrent(cursor.indexColumn, EDITOR_getPositionIndex(cursor), EDITOR_getLineBoundaryPositions(cursor.indexLine));
	        if (current === '\n') current = '\\n';
	        else if (current === '\t') current = '\\t';
	        EDITOR_debug.innerText += ' | (' + previous + ', ' + current + ')';
        }
        
        EDITOR_debug.innerText += ' | (' + cursor.editLength + ')';

        if (!NOTscrollCursorIntoView) {
            EDITOR_scrollCursorIntoView(cursor);
        }
    }
}

function EDITOR_getLineAndColumnIndices_raw(positionIndex) {
    let left = 0;
    let right = EDITOR_lineEndPositionList.count - 1;

    let lineIndex = -1;
    let columnIndex = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (EDITOR_lineEndPositionList.data[mid] >= positionIndex) {
            lineIndex = mid;

            if (EDITOR_lineEndPositionList.data[mid] === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (EDITOR_lineEndPositionList.data[mid] < positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    if (lineIndex === -1) {
        return {
          indexLine: 0,
          indexColumn: 0,  
        };
    }

    if (lineIndex === 0) {
        columnIndex = positionIndex;
    }
    else {
        columnIndex = positionIndex - (EDITOR_lineEndPositionList.data[lineIndex - 1] + 1);
    }

    return {
        indexLine: lineIndex,
        indexColumn: columnIndex,
    };
}

function EDITOR_getLineAndColumnIndices(positionIndex) {
    let left = 0;
    let right = EDITOR_lineEndPositionList.count - 1;

    let lineIndex = -1;
    let columnIndex = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (EDITOR_readLineEndPositionList(mid) >= positionIndex) {
            lineIndex = mid;

            if (EDITOR_readLineEndPositionList(mid) === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (EDITOR_readLineEndPositionList(mid) < positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    if (lineIndex === -1) {
        return {
          indexLine: 0,
          indexColumn: 0,  
        };
    }

    if (lineIndex === 0) {
        columnIndex = positionIndex;
    }
    else {
        columnIndex = positionIndex - (EDITOR_readLineEndPositionList(lineIndex - 1) + 1);
    }

    return {
        indexLine: lineIndex,
        indexColumn: columnIndex,
    };
}

/**
 * This function only clears both the 'cursor.selectionDivExists' and the HTML associated with the selection NOT the actual selection position properties of the cursor.
 * 
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_clearSelectionStyle(cursor) {
    let shouldExistSelectionDiv = false;
    if (cursor.selectionDivExists) {
        for (var i = 0; i < EDITOR_presentation.children.length; i++) {
            if (EDITOR_presentation.children[i].id === cursor.htmlId) {
                let textSelectionDiv = EDITOR_presentation.children[i];
                if (!shouldExistSelectionDiv) {
                    EDITOR_presentation.removeChild(textSelectionDiv);
                    cursor.selectionDivExists = false;
                }
                break;
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_createStyleForSelection(cursor) {
    if (cursor.DRAWN_selectionAnchor !== cursor.selectionAnchor ||
        cursor.DRAWN_selectionEnd !== cursor.selectionEnd) {

        cursor.DRAWN_selectionAnchor = cursor.selectionAnchor;
        cursor.DRAWN_selectionEnd = cursor.selectionEnd;

        let shouldExistSelectionDiv;
        if (cursor.DRAWN_selectionAnchor === cursor.DRAWN_selectionEnd) {
            shouldExistSelectionDiv = false;
        }
        else {
            shouldExistSelectionDiv = true;
        }

        let textSelectionDiv;

        if (cursor.selectionDivExists) {
            for (var i = 0; i < EDITOR_presentation.children.length; i++) {
                if (EDITOR_presentation.children[i].id === cursor.htmlId) {
                    textSelectionDiv = EDITOR_presentation.children[i];
                    if (!shouldExistSelectionDiv) {
                        EDITOR_presentation.removeChild(textSelectionDiv);
                        cursor.selectionDivExists = false;
                    }
                    break;
                }
            }
        }
        else if (shouldExistSelectionDiv) {
            textSelectionDiv = document.createElement('div')
            textSelectionDiv.id = cursor.htmlId;
            EDITOR_presentation.appendChild(textSelectionDiv);
            cursor.selectionDivExists = true;
        }

        if (!cursor.selectionDivExists) return;

        // TODO: you should only need to update the first or last of the previous if existing already?...
        // ...i.e.: don't remove all the divs just update the first/last and add the new stuff

        textSelectionDiv.innerHTML = '';

        let start = cursor.selectionAnchor;
        let startLineAndColumnIndices = EDITOR_getLineAndColumnIndices(start);
        let startLine = startLineAndColumnIndices.indexLine;
        let startColumn = startLineAndColumnIndices.indexColumn;

        let end = cursor.selectionEnd;
        let endLineAndColumnIndices = EDITOR_getLineAndColumnIndices(end);
        let INCLUSIVEendLine = endLineAndColumnIndices.indexLine;
        let INCLUSIVEendColumn = endLineAndColumnIndices.indexColumn;
        if (start > end) {
            let temp = end;
            let tempLine = INCLUSIVEendLine;
            let tempColumn = INCLUSIVEendColumn;
            end = start;
            INCLUSIVEendLine = startLine;
            INCLUSIVEendColumn = startColumn;
            start = temp;
            startLine = tempLine;
            startColumn = tempColumn;
        }

        let lineSelectionDiv;

        if (startLine == INCLUSIVEendLine) {
            lineSelectionDiv = document.createElement('div');
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.left = startColumn * EDITOR_characterWidth + 'px';
            lineSelectionDiv.style.top = EDITOR_lineHeight * startLine + 'px';
            lineSelectionDiv.style.width = (INCLUSIVEendColumn - startColumn) * EDITOR_characterWidth + 'px';
            textSelectionDiv.appendChild(lineSelectionDiv);
        }
        else {
            // start line
            lineSelectionDiv = document.createElement('div');
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.left = startColumn * EDITOR_characterWidth + 'px';
            lineSelectionDiv.style.top = EDITOR_lineHeight * startLine + 'px';
            let line = EDITOR_getLineBoundaryPositions(startLine);
            let lineLength = line.end - line.start;
            lineSelectionDiv.style.width = (lineLength + 1 - startColumn) * EDITOR_characterWidth + 'px';
            textSelectionDiv.appendChild(lineSelectionDiv);

            // between lines
            for (var lineI = startLine + 1; lineI < INCLUSIVEendLine; lineI++) {
                lineSelectionDiv = document.createElement('div');
                lineSelectionDiv.className = 'EDITOR_selection';
                lineSelectionDiv.style.left = '0';
                lineSelectionDiv.style.top = EDITOR_lineHeight * lineI + 'px';
                let line = EDITOR_getLineBoundaryPositions(lineI);
                let lineLength = line.end - line.start;
                lineSelectionDiv.style.width = (lineLength + 1) * EDITOR_characterWidth + 'px';
                textSelectionDiv.appendChild(lineSelectionDiv);
            }

            // end line
            lineSelectionDiv = document.createElement('div');
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.left = '0';
            lineSelectionDiv.style.top = EDITOR_lineHeight * INCLUSIVEendLine + 'px';
            lineSelectionDiv.style.width = INCLUSIVEendColumn * EDITOR_characterWidth + 'px';
            textSelectionDiv.appendChild(lineSelectionDiv);
        }
    }
}

function EDITOR_getLastValidIndexColumn(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return EDITOR_readLineEndPositionList(indexLine) - 0;
        }
        else {
            return EDITOR_readLineEndPositionList(indexLine) - (EDITOR_readLineEndPositionList(indexLine - 1) + 1);
        }
    }
    return 0;
}

/**
 * result.start is the position of the first character on that line.
 * 
 * result.end is the position of the "line end" (i.e.: ascii code for '\n' or EOF).
 * 
 * The inclusivity/exclusivity is in reference to whether the position
 * points to non-line-end-text that exists on the line
 * 
 * @returns an object with properties 'start' inclusive, 'end' exclusive
 */
function EDITOR_getLineBoundaryPositions(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return {
                start: 0,
                end: EDITOR_readLineEndPositionList(indexLine) - 0
            }
        }
        else {
            return {
                start: (EDITOR_readLineEndPositionList(indexLine - 1) + 1),
                end: EDITOR_readLineEndPositionList(indexLine)
            }
        }
    }
    return {
        start: 0,
        end: 0
    }
}

/**
 * result.start is the position of the first character on that line.
 * 
 * result.end is the position of the "line end" (i.e.: ascii code for '\n' or EOF).
 * 
 * The inclusivity/exclusivity is in reference to whether the position
 * points to non-line-end-text that exists on the line
 * 
 * @returns an object with properties 'start' inclusive, 'end' exclusive
 */
function EDITOR_getLineBoundaryPositions_raw(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return {
                start: 0,
                end: EDITOR_lineEndPositionList.data[indexLine] - 0
            }
        }
        else {
            return {
                start: (EDITOR_lineEndPositionList.data[indexLine - 1] + 1),
                end: EDITOR_lineEndPositionList.data[indexLine]
            }
        }
    }
    return {
        start: 0,
        end: 0
    }
}

function EDITOR_measureLineHeightAndCharacterWidth() {
    let measureElement = document.createElement('div');
    measureElement.style.width = "fit-content";
    EDITOR_textElement.appendChild(measureElement);

    let sampleTextBuilder = [];
    for (var i = 0; i < 11; i++) {
        // This is quite silly.
        // The font is intended to be monospace.
        //
        // Given the comment about monospace, all in all what this method does is:
        // 36 characters repeated 11 times
        //
        // I've in the past found this to give the most accurate character width.
        //
        // I don't want to store this string as one massive string that is 11 times the size,
        // because then it has to sit (presumably) as an interned string or in some data section
        // all app long.
        //
        // Since this is doing a "builder" and monospace, it might be similar to just append the number '0' for (36 * 11) times
        //
        // FURTHERMORE: I need to revisit calcuating the character width, this is somewhat of an early
        // way I found to get it, perhaps it isn't quite so involved.
        //
        sampleTextBuilder.push("abcdefghijklmnopqrstuvwxyz0123456789");
    }
    measureElement.innerHTML = sampleTextBuilder.join("");

    // ... this HAS a decimal part, but it is sensible for it to have one.
    EDITOR_characterWidth = measureElement.offsetWidth / (36 * 11);
    // TODO: This is currently a whole number but regardless, it presumably could end up having a decimal part.
    EDITOR_lineHeight = Math.ceil(measureElement.offsetHeight);

    const root = document.documentElement;
    const computedStyles = window.getComputedStyle(root);
    let teLineHeight = EDITOR_lineHeight + 'px';
    let propertyName = '--EDITOR-line-height';
    if (computedStyles.getPropertyValue(propertyName) !== teLineHeight) {
        // avoid layout with if statement
        root.style.setProperty(propertyName, teLineHeight);
    }

    EDITOR_textElement.removeChild(measureElement);
}

function EDITOR_wrapOnMouseMove(event) {
    if (event.buttons & 1 && EDITOR_isSourceOfLeftMouseButton) {
        EDITOR_throttleMousemove(event);
    }
    else {
        EDITOR_isSourceOfLeftMouseButton = false;
    }
}

function EDITOR_onMouseMove(event) {
    if (!EDITOR_recentBoundingClientRect) {
        return;
    }

    let rX = event.clientX - EDITOR_recentBoundingClientRect.left - EDITOR_gutterWidthTotal + EDITOR_baseElement.scrollLeft;
    let rY = event.clientY - EDITOR_recentBoundingClientRect.top + EDITOR_baseElement.scrollTop;

    let indexColumn = Math.round(rX / EDITOR_characterWidth);
    let indexLine = Math.floor(rY / EDITOR_lineHeight);

    if (indexColumn < 0) {
        indexColumn = 0;
    }
    
    if (indexLine < 0) {
        indexLine = 0;
    }

    if (indexLine >= EDITOR_lineEndPositionList.count) {
        indexLine = EDITOR_lineEndPositionList.count - 1;
    }

    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(indexLine);
    if (indexColumn > lastValidIndexColumn) {
        indexColumn = lastValidIndexColumn;
    }

    let cursor = EDITOR_primaryCursor;
    cursor.indexLine = indexLine;
    cursor.indexColumn = indexColumn;
    EDITOR_drawCursor(cursor);

    if (EDITOR_detailRank === 3) {
        EDITOR_onMouseMoveDetailRankThree(event, indexLine, indexColumn);
    }
    else
    if (EDITOR_detailRank === 2) {
        EDITOR_onMouseMoveDetailRankTwo(event, indexLine, indexColumn);
    }
    else if (EDITOR_detailRank === 1) {
        EDITOR_onMouseMoveDetailRankOne(event, indexLine, indexColumn);
    }
}

function EDITOR_onMouseMoveDetailRankOne(event, lineIndexClicked, columnIndexClicked) {
    let cursor = EDITOR_primaryCursor;
    cursor.indexLine = lineIndexClicked;
    cursor.indexColumn = columnIndexClicked;

    cursor.selectionEnd = EDITOR_getPositionIndex(cursor);

    EDITOR_drawCursor(cursor);
}

function getCharacter(positionIndex) {

    // in this getCharacter function, you'd actually already know the total shift if you just looped forwards.
    // Also this currently is EXTREMELY unoptimized given that it resets the totalShift each time it gets invoked rather than remembering the previous result.

    // maybe when hitting ArrowRight you'd want to finalize the edits?
    // because if you have multicursor with two cursors on the same line
    // you type some letters
    // then ctrl arrow right
    // how would this interact with the line end positions?
    //
    // I think if it were something like this, that it'd relate to whether the user moved they're cursor outisde the range of that cursor's pending "gap buffer" insertion text.
    //
    // additionally this function feels "random access", you need to consider a consecutive approach where you accumulate this state.
    // and that's what the plan was... but it doesn't quite feel like it would go here. Or that there'd be a second function in which you agree to using contextual information to determine the result much faster.

    // Cursors overlapping missed cases:
    // =================================
    // two cursors same line hit home
    // two cursors same line hit end

    let totalShift = 0;
    // If you need to determine the text without finalizing an edit, you DO have to loop forwards right?
    for (var i = 0; i < EDITOR_cursorList.length; i++) {
        let cursor = EDITOR_cursorList[i];
        switch (cursor.editKind) {
            case EditKind.InsertLtr:
                if (positionIndex >= cursor.editPosition & positionIndex < cursor.editPosition + cursor.editLength) {
                    return EDITOR_decode_experimental_gapBuffer(cursor.gapBuffer, positionIndex - cursor.editPosition, 1);
                }
                else if (cursor.editPosition <= positionIndex) {
                    totalShift += cursor.editLength;
                }
                break;
            case EditKind.DeleteLtr:
            case EditKind.BackspaceRtl:
            case EditKind.RemoveTextNoBatching:
                totalShift -= cursor.editLength;
                break;
        }
    }
    return EDITOR_decode_raw(positionIndex - totalShift, 1);
}

/**
 * 'positionIndex' is a calculated value that is commonly calculated.
 * It tends to be the case that you already are using a variable to store the positionIndex.
 * Thus providing that positionIndex is ideal.
 * 
 * @param {*} cursor 
 * @param {*} positionIndex 
 */
function EDITOR_getCharacterPrevious(indexColumn, positionIndex) {
    // TODO: Make a 'getCharacter(...) method so the gap buffer logic can be in one location.
    if (indexColumn !== 0) {
        return getCharacter(positionIndex - 1);
    }
    else {
        // TODO: I'm pretty sure this was supposed to say '\0' but it happens to "work" due to them both being 0.
        return CharacterKind.None;
    }
}

/**
  * 'positionIndex' is a calculated value that is commonly calculated.
 * It tends to be the case that you already are using a variable to store the positionIndex.
 * Thus providing that positionIndex is ideal.
 * 
 * @param {*} indexColumn 
 * @param {*} positionIndex 
 * @param {*} line 
 */
function EDITOR_getCharacterCurrent(indexColumn, positionIndex, line) {
    if (indexColumn < line.end) {
        return getCharacter(positionIndex);
    }
    else {
        // TODO: I'm pretty sure this was supposed to say '\0' but it happens to "work" due to them both being 0.
        return CharacterKind.None;;
    }
}

function EDITOR_getCharacterPrevious_KIND(indexColumn, positionIndex) {
    if (indexColumn !== 0) {
        return EDITOR_getCharacterKind(EDITOR_getCharacterPrevious(indexColumn, positionIndex));
    }
    else {
        return CharacterKind.None;
    }
}

function EDITOR_getCharacterCurrent_KIND(indexColumn, positionIndex, line) {
    if (indexColumn < line.end) {
        return EDITOR_getCharacterKind(EDITOR_getCharacterCurrent(indexColumn, positionIndex, line));
    }
    else {
        return CharacterKind.None;
    }
}

function EDITOR_onMouseMoveDetailRankTwo(event, lineIndexClicked, columnIndexClicked) {
    let nextPositionIndex = EDITOR_getPositionIndex_Overload(lineIndexClicked, columnIndexClicked);
    let cursor = EDITOR_primaryCursor;

    if (nextPositionIndex <= EDITOR_detailSmallLarge.SmallPosition) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            cursor.selectionAnchor = EDITOR_detailSmallLarge.LargePosition;
        }

        cursor.indexLine = lineIndexClicked;
        cursor.indexColumn = columnIndexClicked;
        let positionIndex = nextPositionIndex;

        cursor.selectionEnd = positionIndex;

        if (nextPositionIndex < EDITOR_detailSmallLarge.SmallPosition) {
            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
            let goalCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, positionIndex, line);

            let leftWasFound = false;

            let tempPositionIndex = positionIndex;

            while (cursor.indexColumn > 0) {
                let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, tempPositionIndex);
                if (leftCharacterKind !== goalCharacterKind) {
                    cursor.selectionEnd = tempPositionIndex;
                    leftWasFound = true;
                    break;
                }
                tempPositionIndex--;
                cursor.indexColumn--;
            }

            if (!leftWasFound) {
                cursor.selectionEnd = tempPositionIndex;
            }
        }

        EDITOR_drawCursor(cursor);
    }
    else {
        if (cursor.selectionAnchor > cursor.selectionEnd) {
            cursor.selectionAnchor = EDITOR_detailSmallLarge.SmallPosition;
        }

        if (nextPositionIndex >= EDITOR_detailSmallLarge.LargePosition) {
            cursor.indexLine = lineIndexClicked;
            cursor.indexColumn = columnIndexClicked;
            let positionIndex = nextPositionIndex;

            cursor.selectionEnd = positionIndex;

            let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, positionIndex);
            let goalCharacterKind = leftCharacterKind;

            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
            lineLength = line.end - line.start;
            let rightWasFound = false;

            let tempPositionIndex = positionIndex;
            while (cursor.indexColumn < lineLength) {
                let rightCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, tempPositionIndex, line);
                if (rightCharacterKind !== goalCharacterKind) {
                    cursor.selectionEnd = tempPositionIndex;
                    rightWasFound = true;
                    break;
                }
                tempPositionIndex++;
                cursor.indexColumn++;
            }

            if (!rightWasFound) {
                // end of line
                cursor.selectionEnd = tempPositionIndex;
            }
        }
        else {
            let largeLineAndColumnIndices = EDITOR_getLineAndColumnIndices(EDITOR_detailSmallLarge.LargePosition);
            cursor.indexLine = largeLineAndColumnIndices.indexLine;
            cursor.indexColumn = largeLineAndColumnIndices.indexColumn;
            cursor.selectionEnd = EDITOR_detailSmallLarge.LargePosition;
        }

        EDITOR_drawCursor(cursor);
    }
}

function EDITOR_onMouseMoveDetailRankThree(event, lineIndexClicked, columnIndexClicked) {
    let cursor = EDITOR_primaryCursor;

    if (lineIndexClicked === EDITOR_detailRank3OriginLine) {
        if (cursor.positionIndex !== EDITOR_detailSmallLarge.SmallPosition) {
            let smallLineAndColumnPositionIndices = EDITOR_getLineAndColumnIndices(EDITOR_detailSmallLarge.SmallPosition);
            cursor.indexLine = smallLineAndColumnPositionIndices.indexLine;
            cursor.indexColumn = smallLineAndColumnPositionIndices.indexColumn;
        }

        if (cursor.selectionEnd !== EDITOR_detailSmallLarge.SmallPosition) {
            cursor.selectionEnd = EDITOR_detailSmallLarge.SmallPosition;
        }

        if (cursor.selectionAnchor !== EDITOR_detailSmallLarge.LargePosition) {
            cursor.selectionAnchor = EDITOR_detailSmallLarge.LargePosition;
        }

        EDITOR_drawCursor(cursor);
    }
    else if (lineIndexClicked < EDITOR_detailRank3OriginLine) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            let smallLineAndColumnPositionIndices = EDITOR_getLineAndColumnIndices(EDITOR_detailSmallLarge.SmallPosition);

            cursor.indexLine = smallLineAndColumnPositionIndices.indexLine;
            cursor.indexColumn = smallLineAndColumnPositionIndices.indexColumn;

            cursor.selectionEnd = EDITOR_detailSmallLarge.SmallPosition;

            EDITOR_drawCursor(cursor);
        }

        cursor.indexLine = lineIndexClicked;
        cursor.indexColumn = 0;

        cursor.selectionEnd = EDITOR_getPositionIndex_Overload(lineIndexClicked, 0);

        EDITOR_drawCursor(cursor);
    }
    else if (lineIndexClicked > EDITOR_detailRank3OriginLine) {

        if (cursor.selectionAnchor !== EDITOR_detailSmallLarge.SmallPosition) {
            cursor.selectionAnchor = EDITOR_detailSmallLarge.SmallPosition;
        }

        cursor.indexLine = lineIndexClicked;
        cursor.indexColumn = columnIndexClicked;
        let positionIndex = EDITOR_getPositionIndex_Overload(lineIndexClicked, columnIndexClicked);

        // move to end of line...
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let lineLength = line.end - line.start;
        positionIndex += lineLength - cursor.indexColumn;

        if (cursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
            cursor.indexColumn = lineLength;
            cursor.selectionEnd = positionIndex;
        }
        else {
            // wrap to the next line
            cursor.indexLine++;
            cursor.indexColumn = 0;
            positionIndex++;

            cursor.selectionEnd = positionIndex;
        }

        EDITOR_drawCursor(cursor);
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_getPositionIndex(cursor) {
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
    return line.start + cursor.indexColumn;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_getPositionIndex_raw(cursor) {
    let line = EDITOR_getLineBoundaryPositions_raw(cursor.indexLine);
    return line.start + cursor.indexColumn;
}

function EDITOR_getPositionIndex_Overload(indexLine, indexColumn) {
    let line = EDITOR_getLineBoundaryPositions(indexLine);
    return line.start + indexColumn;
}

function EDITOR_onMouseDownDetailRankOne(event, lineIndexClicked, columnIndexClicked) {
    let cursor = EDITOR_primaryCursor;

    let selectionPlusContextMenuCase = event.button === 2 && cursor.hasSelection();

    if (event.shiftKey && !selectionPlusContextMenuCase) {
        if (!cursor.hasSelection()) {
            cursor.selectionAnchor = EDITOR_getPositionIndex(cursor);
        }
    }

    if (!selectionPlusContextMenuCase) {
        cursor.indexLine = lineIndexClicked;
        cursor.indexColumn = columnIndexClicked;
        cursor.STORED_indexColumn = cursor.indexColumn;
    
        cursor.selectionEnd = EDITOR_getPositionIndex(cursor);

        if (!event.shiftKey) {
            cursor.selectionAnchor = cursor.selectionEnd;
        }
    }

    EDITOR_drawCursor(cursor);
}

function EDITOR_onMouseDownDetailRankTwo(event, lineIndexClicked, columnIndexClicked) {
    if (event.shiftKey) {
        EDITOR_onMouseDownDetailRankOne(event, lineIndexClicked, columnIndexClicked);
        return;
    }

    let cursor = EDITOR_primaryCursor;

    cursor.indexLine = lineIndexClicked;
    cursor.indexColumn = columnIndexClicked;
    let positionIndex = EDITOR_getPositionIndex(cursor);
    
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, positionIndex);
    let rightCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, positionIndex, line);

    if (leftCharacterKind === rightCharacterKind) {
        let goalCharacterKind = rightCharacterKind;

        let tempIndexColumn = cursor.indexColumn;
        let tempPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        while (tempIndexColumn > 0) {
            tempIndexColumn--;
            tempPositionIndex--;
            leftCharacterKind = EDITOR_getCharacterPrevious_KIND(tempIndexColumn, tempPositionIndex);
            if (leftCharacterKind !== goalCharacterKind) {
                cursor.selectionAnchor = tempPositionIndex;
                break;
            }
        }

        let lineLength = line.end - line.start;
        let rightWasFound = false;
        tempIndexColumn = cursor.indexColumn;
        tempPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        while (tempIndexColumn < lineLength) {
            tempIndexColumn++;
            tempPositionIndex++;
            rightCharacterKind = EDITOR_getCharacterCurrent_KIND(tempIndexColumn, tempPositionIndex, line);
            if (rightCharacterKind !== goalCharacterKind) {
                cursor.indexColumn = tempIndexColumn;
                cursor.selectionEnd = tempPositionIndex;
                rightWasFound = true;
                break;
            }
        }

        if (!rightWasFound) {
            // end of line
            cursor.indexColumn = tempIndexColumn;
            cursor.selectionEnd = tempPositionIndex;
        }

        EDITOR_drawCursor(cursor);
    }
    else if (leftCharacterKind > rightCharacterKind) {
        let goalCharacterKind = leftCharacterKind;

        let tempIndexColumn = cursor.indexColumn;
        let originalPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        let tempPositionIndex = originalPositionIndex;

        while (cursor.indexColumn > 0) {
            tempIndexColumn--;
            tempPositionIndex--;
            leftCharacterKind = EDITOR_getCharacterPrevious_KIND(tempIndexColumn, tempPositionIndex);
            if (leftCharacterKind !== goalCharacterKind) {
                cursor.selectionAnchor = tempPositionIndex;
                break;
            }
        }

        cursor.selectionEnd = originalPositionIndex;

        EDITOR_drawCursor(cursor);
    }
    else {
        let goalCharacterKind = rightCharacterKind;

        let positionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, cursor.indexColumn);
        cursor.selectionAnchor = positionIndex;

        let lineLength = line.end - line.start;
        let rightWasFound = false;

        while (cursor.indexColumn < lineLength) {
            cursor.indexColumn++;
            positionIndex++;
            rightCharacterKind = EDITOR_getCharacterCurrent(cursor.indexColumn, positionIndex, line);
            if (rightCharacterKind !== goalCharacterKind) {
                cursor.selectionEnd = positionIndex;
                rightWasFound = true;
                break;
            }
        }

        if (!rightWasFound) {
            // end of line
            cursor.selectionEnd = positionIndex;
        }

        EDITOR_drawCursor(cursor);
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        EDITOR_detailSmallLarge = {
            SmallPosition: cursor.selectionAnchor,
            LargePosition: cursor.selectionEnd,
        };
    }
    else {
        EDITOR_detailSmallLarge = {
            SmallPosition: cursor.selectionEnd,
            LargePosition: cursor.selectionAnchor,
        };
    }
}

function EDITOR_onMouseDownDetailRankThree(event, lineIndexClicked, columnIndexClicked) {
    if (event.shiftKey) {
        EDITOR_onMouseDownDetailRankOne(event, lineIndexClicked, columnIndexClicked);
        return;
    }

    let cursor = EDITOR_primaryCursor;

    cursor.indexLine = lineIndexClicked;
    cursor.indexColumn = columnIndexClicked;
    
    cursor.selectionAnchor = EDITOR_getPositionIndex_Overload(cursor.indexLine, 0);
    
    EDITOR_detailRank3OriginLine = cursor.indexLine;

    if (cursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        cursor.selectionEnd = line.end;
        EDITOR_drawCursor(cursor);
    }
    else {
        cursor.indexLine++;
        cursor.indexColumn = 0;
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        cursor.selectionEnd = line.start;
        EDITOR_drawCursor(cursor);
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        EDITOR_detailSmallLarge = {
            SmallPosition: cursor.selectionAnchor,
            LargePosition: cursor.selectionEnd,
        };
    }
    else {
        EDITOR_detailSmallLarge = {
            SmallPosition: cursor.selectionEnd,
            LargePosition: cursor.selectionAnchor,
        };
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_insertGapBufferSpan(cursor) {
    let w = walkLineUntilColumnIndex(cursor);
    if (w.indexColumn_Goal === -1 || !w.div || w.div.children.length === 0) {
        cursor.gapBufferWriteToSpanElement = null;
        cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
        return;
    }

    if (w.indexColumn_Goal == 0) {
        // TODO: Ensure 'w.div.children[0]' is equal to the 'w.span' and then change this line to use 'w.span'
        cursor.gapBufferWriteToSpanElement = w.span;
        cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
    }
    else {
        cursor.gapBufferWriteToSpanElement = w.div.children[w.indexSpan];

        if (w.indexColumn_Goal === w.indexColumn_Sum + cursor.gapBufferWriteToSpanElement.textContent.length) {
            cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = cursor.gapBufferWriteToSpanElement.textContent.length;
        }
        else {
            cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = w.indexColumn_SpanTextContentRelative;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} editKind 
 * @param {*} editPosition 
 * @param {*} editLength 
 */
function EDITOR_startEdit(cursor, editKind, editPosition, editLength) {
    cursor.editKind = editKind;
    cursor.editPosition = editPosition;
    cursor.editIndexLine = cursor.indexLine;
    cursor.editIndexColumn = cursor.indexColumn;
    cursor.editLength = editLength;

    switch (editKind) {
        case EditKind.InsertLtr:
            EDITOR_insertGapBufferSpan(cursor);
            break;
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {string} character 
 */
function EDITOR_insertDo(cursor, character) {
    /*
    TODO: (optimization idea) if you are inserting at the 0th or length position it might be worthwhile
    to have a conditional branch make the innerText with 1 less slice invocation.

    TODO: (optimization idea) I'm going to get this less optimized version to work, but you might want to
    make a copy of the span so you only have to "insert" text to the end of the span.
    And then this removes 1 of the slice invocations, rather than inserting "possibly" among the existing innerText.
    */
    if (cursor.gapBufferWriteToSpanElement) {
        cursor.gapBufferWriteToSpanElement.innerText = 
            cursor.gapBufferWriteToSpanElement.innerText.slice(0, cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex + cursor.gapBufferCount) +
            character +
            cursor.gapBufferWriteToSpanElement.innerText.slice(cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex + cursor.gapBufferCount);
    }

    cursor.gapBuffer[cursor.gapBufferCount] = character.charCodeAt(0);
    cursor.gapBufferCount++;

    cursor.editLength++;
    cursor.indexColumn++;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} indexCursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_insert(cursor, indexCursor) {
    // TODO: make sure you've enforced the constraints that you have in your mental model:
    // - [ ] (i.e.: no enter key press during multi-cursor yet)
    // - [ ] I'm going to presume that all the cursors are on separate lines

    // So then these all need to include a check for whether they have a selection, to ensure a pending edit into a selection of text doesn't have anything weird happen.
    
    return cursor.editKind != EditKind.InsertLtr ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn + cursor.editLength ||
           cursor.editLength >= EDITOR_Cursor.GAP_BUFFER_CAPACITY ||
           cursor.hasSelection();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_backspace(cursor) {

    // TODO: Exception during finalize softlocks the editor because you can't even clear to reset the state: 'Uncaught (in promise) Error: removeAt(...): index > this.count'

    return cursor.editKind != EditKind.BackspaceRtl ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn ||
           cursor.hasSelection();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_delete(cursor) {
    return cursor.editKind != EditKind.DeleteLtr ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn ||
           cursor.hasSelection();
}

let didChangeTextDocumentNotificationPromise = null;
/**
 * Prevent earlier members of a then chain from marking didChangeTextDocumentNotificationPromise to null
 * in order to signify resolved
 * 
 * when meanwhile there is more promises in the .then chain that need to resolve.
 * 
 * prefix increment
 */
let ticket_didChangeTextDocumentNotificationPromise = 0;
let didChangeTextDocument_version = 0;

/**
 * javascript is single threaded, if this does end up working, don't repeat this in other languages, runtimes, etc... without care.
 * Also I looked at all the async logic and believe everything is in proper timing. This pattern perhaps would break if an await where added somewhere in a critical section?
 * It's actually extremely scuffed lmao. I'm counting on the ticket_didChangeTextDocumentNotificationPromise not being captured on lambda "creation"?
 * but instead inside the lambda when I ask for it it gets the value.
 * This could make sense for references. It "should" be fine because maybe I'm actually capturing 'this' and then accessing the variable from there?
 * could 'this.ticket_didChangeTextDocumentNotificationPromise' result in different lambda variablel capturing such and such?
 * I should probably make sure it works but I'm not there yet.
 */
async function EDITOR_didChangeTextDocumentNotification(absolutePath, version, startLine, startCharacter, endLine, endCharacter, text, ticket) {
    await window.myAPI.didChangeTextDocumentNotification(absolutePath, version, startLine, startCharacter, endLine, endCharacter, text, );
    if (ticket_didChangeTextDocumentNotificationPromise === ticket) {
        didChangeTextDocumentNotificationPromise = null;
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_finalizeEdit(cursor) {
    /**
     * Later code needs to know the line index that the removal occurred on.
     * In a naive approach, presume every edit only spans a single line.
     * Then reversing backwards gets you the first line index that "fits" the edit and thus the line index the edit occurred on.
     * 
     * If for whatever reason the first time around this loop fails, then you never decremented so you wouldn't increment to restore
     * the iteration variable to the previous loop's state.
     */
    let lineIndex_editOccurredOn = -1;

    switch (cursor.editKind) {
        case EditKind.InsertLtr:
            {
                // Either it is a:
                // - multi-line-comment that spans multiple lines
                // - string that spans multiple lines
                //
                // if (cursor.editPosition <= trackedSyntax.start) {
                //     trackedSyntax.start += cursor.editLength;
                // }
                // else if (cursor.editPosition > trackedSyntax.start && cursor.editPosition < trackedSyntax.start + trackedSyntax.length) {
                //     trackedSyntax.length += cursor.editLength;
                //
                //     // TODO: the opening of a multi-line-comment is two characters long. So you'd need to...
                //     // ...check the tracked syntax kind as well, to know whether the position typed into
                //     // is in bounds of the multi-line-comment's "child content" or if you even were to have invalidated
                //     // the multi-line-comment by inserting an "invalid" character between the opening '/' and '*'.
                //
                //     // TODO: The tracked syntax ought to be sorted. So you'd be able to
                //     // break out of the loop once you find a failed case for:
                //     // 'cursor.editPosition > trackedSyntax.start && cursor.editPosition < trackedSyntax.start + trackedSyntax.length'
                //
                //     // TODO: Binary search the initial trackedSyntax index that passes the case for:
                //     // 'cursor.editPosition <= trackedSyntax.start'
                // }
                // 
                for (let i = EDITOR_lineEndPositionList.count - 1; i >= 0; i--) {
                    if (cursor.editPosition <= EDITOR_lineEndPositionList.data[i]) {
                        EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                    }
                    else {
                        if (i === EDITOR_lineEndPositionList.count - 1) {
                            lineIndex_editOccurredOn = i;
                        }
                        else {
                            lineIndex_editOccurredOn = i + 1;
                        }
                        break;
                    }
                }
                for (var i = 0; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
                    EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, i);
                    if (cursor.editPosition <= EDITOR_pooledTrackedSyntax.start) {
                        EDITOR_trackedSyntaxList.setStart(i, EDITOR_pooledTrackedSyntax.start + cursor.editLength);
                    }
                    else if (EDITOR_pooledTrackedSyntax.trackedSyntaxKind === TrackedSyntaxKind.Comment &&
                            cursor.editPosition === EDITOR_pooledTrackedSyntax.start + 1) {

                        // TODO: Insertion of '*' probably shouldn't remove.
                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (cursor.editPosition > EDITOR_pooledTrackedSyntax.start && cursor.editPosition < EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length) {
                        EDITOR_trackedSyntaxList.setLength(i, EDITOR_pooledTrackedSyntax.length + cursor.editLength);
                    }
                }
                EDITOR_textByteList.insertBytes(cursor.editPosition, cursor.gapBuffer, /*offset*/ 0, /*length*/ cursor.gapBufferCount);

                let ticket = ++ticket_didChangeTextDocumentNotificationPromise;
                let textSourceIdentifier = EDITOR_textSourceIdentifier;
                let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(cursor.editPosition);
                // TODO: Account for any '\0\0\0\t' that exist on the line            
                let text = EDITOR_decode_experimental_gapBuffer(cursor.gapBuffer, 0, cursor.gapBufferCount);
                let version = ++didChangeTextDocument_version;
                if (didChangeTextDocumentNotificationPromise) {
                    didChangeTextDocumentNotificationPromise = didChangeTextDocumentNotificationPromise.then(async () => {
                        await EDITOR_didChangeTextDocumentNotification(
                            textSourceIdentifier,
                            version,
                            lineAndColumnIndices.indexLine,
                            lineAndColumnIndices.indexColumn,
                            lineAndColumnIndices.indexLine,
                            lineAndColumnIndices.indexColumn,
                            text,
                            ticket);
                    });
                }
                else {
                    didChangeTextDocumentNotificationPromise = EDITOR_didChangeTextDocumentNotification(
                        textSourceIdentifier,
                        version,
                        lineAndColumnIndices.indexLine,
                        lineAndColumnIndices.indexColumn,
                        lineAndColumnIndices.indexLine,
                        lineAndColumnIndices.indexColumn,
                        text,
                        ticket);
                }

                cursor.editKind = EditKind.None;
                cursor.editLength = 0;
                cursor.editPosition = 0;
                cursor.editIndexLine = 0;
                cursor.editIndexColumn = 0;
                cursor.END_editIndexLine = 0;
                cursor.END_editIndexColumn = 0;
                cursor.gapBufferCount = 0;
                cursor.gapBufferWriteToSpanElement = null;
                cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
                break;
            }
        case EditKind.DeleteLtr:
        case EditKind.BackspaceRtl:
        case EditKind.RemoveTextNoBatching:
            {
                // TODO: surely u'd get this before doing the edit?
                let startLineAndColumnIndices;
                if (cursor.editKind === EditKind.RemoveTextNoBatching) {
                    startLineAndColumnIndices = {
                        indexLine: cursor.editIndexLine,
                        indexColumn: cursor.editIndexColumn,
                    };
                }
                else {
                    startLineAndColumnIndices = EDITOR_getLineAndColumnIndices_raw(cursor.editPosition);
                }
                let endLineAndColumnIndices;
                if (cursor.editKind === EditKind.RemoveTextNoBatching) {
                    endLineAndColumnIndices = {
                        indexLine: cursor.END_editIndexLine,
                        indexColumn: cursor.END_editIndexColumn,
                    };
                }
                else {
                    endLineAndColumnIndices = EDITOR_getLineAndColumnIndices_raw(cursor.editPosition + cursor.editLength);
                }

                for (let i = EDITOR_lineEndPositionList.count - 1; i >= 0; i--) {
                    if (cursor.editPosition < EDITOR_lineEndPositionList.data[i]) {
                        EDITOR_lineEndPositionList.data[i] -= cursor.editLength;
                    }
                    else {
                        if (i === EDITOR_lineEndPositionList.count - 1) {
                            lineIndex_editOccurredOn = i;
                        }
                        else {
                            lineIndex_editOccurredOn = i + 1;
                        }
                        break;
                    }
                }
                for (var i = EDITOR_trackedSyntaxList.count_abstract - 1; i >= 0; i--) {
                    EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, i);
                    if (cursor.editPosition < EDITOR_pooledTrackedSyntax.start) {
                        EDITOR_trackedSyntaxList.setStart(i, EDITOR_pooledTrackedSyntax.start - cursor.editLength);
                    }
                    else if (EDITOR_pooledTrackedSyntax.start >= cursor.editPosition && EDITOR_pooledTrackedSyntax.start < cursor.editPosition + cursor.editLength) {
                        // TODO: This needs to remove more than 1 at a time
                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (EDITOR_pooledTrackedSyntax.trackedSyntaxKind === TrackedSyntaxKind.Comment &&
                            (EDITOR_pooledTrackedSyntax.start + 1) >= cursor.editPosition && (EDITOR_pooledTrackedSyntax.start + 1) < cursor.editPosition + cursor.editLength) {
                        // TODO: You can invalidate a >1 char long by removing beyond just the first unless a character afterwards falls into place that is valid by chance

                        // only multi-line-comments that span multiple lines are stored in EDITOR_trackedSyntaxList
                        // with the 'TrackedSyntaxKind.Comment'

                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (cursor.editPosition > EDITOR_pooledTrackedSyntax.start && cursor.editPosition < EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length) {
                        EDITOR_trackedSyntaxList.setLength(i, EDITOR_pooledTrackedSyntax.length - cursor.editLength);
                    }
                }

                EDITOR_textByteList.removeAt(cursor.editPosition, cursor.editLength);

                let ticket = ++ticket_didChangeTextDocumentNotificationPromise;
                let textSourceIdentifier = EDITOR_textSourceIdentifier;
                // TODO: Account for any '\0\0\0\t' that exist on the line            
                let text = '';
                let version = ++didChangeTextDocument_version;
                if (didChangeTextDocumentNotificationPromise) {
                    didChangeTextDocumentNotificationPromise = didChangeTextDocumentNotificationPromise.then(async () => {
                        await EDITOR_didChangeTextDocumentNotification(
                            textSourceIdentifier,
                            version,
                            startLineAndColumnIndices.indexLine,
                            startLineAndColumnIndices.indexColumn,
                            endLineAndColumnIndices.indexLine,
                            endLineAndColumnIndices.indexColumn,
                            text,
                            ticket);
                    });
                }
                else {
                    didChangeTextDocumentNotificationPromise = EDITOR_didChangeTextDocumentNotification(
                        textSourceIdentifier,
                        version,
                        startLineAndColumnIndices.indexLine,
                        startLineAndColumnIndices.indexColumn,
                        endLineAndColumnIndices.indexLine,
                        endLineAndColumnIndices.indexColumn,
                        text,
                        ticket);
                }

                cursor.editKind = EditKind.None;
                cursor.editLength = 0;
                cursor.editPosition = 0;
                cursor.editIndexLine = 0;
                cursor.editIndexColumn = 0;
                cursor.END_editIndexLine = 0;
                cursor.END_editIndexColumn = 0;

                /*
                - Syntax is fully encompassed by the removed text  => remove
                - Syntax's open is encompassed by the removed text => invalidate

                invalidate => remove

                Are these the same thing then?

                If the open is removed then yeah
                strings are possibly more complex than the multi-line-comment because the same open as close

                TODO: If the open is > 1 characters long then an insertions among those characters is a break too.

                Nothing word based at the moment to worry about.

                TODO: When you make the syntax span a single line, you need to remove it and let the lex on the fly do it
                */

                break;
            }
    }

    // lineIndex_editOccurredOn is initialized to -1
    //
    // When gap buffer is finalized editor tries to redraw the line in order to lex it again.
    // You need to NOT do this when you are working with multiple cursors however, because it bugs everything out.
    // 
    if (EDITOR_cursorList.length === 1) {
        if (lineIndex_editOccurredOn > 0 && lineIndex_editOccurredOn < EDITOR_lineEndPositionList.count) {
            if (EDITOR_gutter.children.length === EDITOR_virtualCount &&
                EDITOR_textElement.children.length === EDITOR_virtualCount) {

                    if (lineIndex_editOccurredOn >= EDITOR_virtualLineIndex && lineIndex_editOccurredOn < EDITOR_virtualLineIndex + EDITOR_virtualCount) {
                        let relativeIndex = lineIndex_editOccurredOn - EDITOR_virtualLineIndex;
                        let gutterLineElement = EDITOR_gutter.children[relativeIndex];
                        gutterLineElement.innerHTML = '';
                        let textLineElement = EDITOR_textElement.children[relativeIndex];
                        textLineElement.innerHTML = '';

                        EDITOR_drawLine(lineIndex_editOccurredOn, gutterLineElement, textLineElement);
                    }
                    else {
                        // TODO: Consider what to do in this case.
                    }
            }
            else {
                // TODO: Consider what to do in this case.
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_preKeyboardMovementSelectionLogic(cursor, shiftKey) {
    if (shiftKey) {
        if (!cursor.hasSelection()) {
            cursor.selectionAnchor = EDITOR_getPositionIndex(cursor);
            cursor.selectionIndexAnchorLine = cursor.indexLine;
            cursor.selectionIndexAnchorColumn = cursor.indexColumn;
        }
    }
    else {
        if (cursor.hasSelection()) {
            cursor.selectionAnchor = cursor.selectionEnd;
            cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
            cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_postKeyboardMovementSelectionLogic(cursor, shiftKey) {
    if (shiftKey) {
        cursor.selectionEnd = EDITOR_getPositionIndex(cursor);
        cursor.selectionIndexEndLine = cursor.indexLine;
        cursor.selectionIndexEndColumn = cursor.indexColumn;
    }
}

/**
 * More accurate description for this method beyond the name:
 * Duplicate the primaryCursor, then move the primaryCursor ArrowDown.
 */
function EDITOR_createCursorLineBelow(event) {
    let clone = EDITOR_primaryCursor.clone();
    event.shiftKey = false;
    EDITOR_arrowDown(EDITOR_primaryCursor, /*shiftKey*/ false);
    EDITOR_cursorList.splice(0, 0, clone);
    EDITOR_cursorListElement.appendChild(clone.caretRow);
    EDITOR_drawCursor(clone);
}

function EDITOR_createCursorAtNextMatchSelection(event) {
 
    if (!EDITOR_primaryCursor.hasSelection()) {
        return;
    }

    if (EDITOR_findOverlay_show && !EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching) {
        EDITOR_findOverlay_showSetter(false);
    }

    if (!EDITOR_findOverlay_show) {
        EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = true;
        EDITOR_findOverlay_showSetter(true);
        EDITOR_findOverlay_doSearch();

        let small = EDITOR_primaryCursor.selectionAnchor;
        let large = EDITOR_primaryCursor.selectionEnd;
        if (EDITOR_primaryCursor.selectionAnchor > EDITOR_primaryCursor.selectionEnd) {
            small = EDITOR_primaryCursor.selectionEnd;
            large = EDITOR_primaryCursor.selectionAnchor;
        }
        let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	    if (!spanCurrent) return;
        let current = parseInt(spanCurrent.innerText, 10);
        if (current) {
            EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber = current;
        }
        else {
            EDITOR_findOverlay_showSetter(false);
            return;
        }
    }

    let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	let upcomingNumber = parseInt(spanCurrent.innerText, 10);
	let total = parseInt(spanTotal.innerText, 10);
	if (upcomingNumber && total) {
		upcomingNumber++;
		if (upcomingNumber > total || upcomingNumber < 1) {
			upcomingNumber = 1;
		}
        if (EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber === upcomingNumber) {
            return;
        }
	}
	else {
		spanCurrent.innerText = 'parseInt not successful?';
        return;
	}


    let prePosition = EDITOR_getPositionIndex(EDITOR_primaryCursor);


    // Avoid two cursors on the same line; wasteful double determination of primaryCursor index is occurring in this function; even a single case is likely not good long term.
    let upcomingPositionIndex = EDITOR_findOverlay_searchResultPositionList.data[upcomingNumber - 1];
    if (upcomingPositionIndex) {
        let upcomingLineAndColumnIndices = EDITOR_getLineAndColumnIndices(upcomingPositionIndex);
        let indexOfPrimaryCursor = -1;
        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            if (EDITOR_cursorList[i] === EDITOR_primaryCursor) {
                indexOfPrimaryCursor = i;
                break;
            }
        }
        let isPermitted = true;
        if (upcomingLineAndColumnIndices.indexLine === EDITOR_primaryCursor.indexLine) {
            //isPermitted = false;
        }
        // if u have a pending you need finalize before allow any of this keybind
        // if u have this keybind consecutively but then do ANYTHING else you are not allowed to press this keybind again until you clear all multicursors from the origin of having used this keybind.
        // u cannot keybind this if u have multicursors active but u ARE allowed to consecutively use this keybind to make multiple multi-cursors provided the origin of the multicursors was this event and every multicursor only came from this event and no other keybinds were pressed between.
        // it sounds like u need to track the multicursor origin and then when clearing the multicursors to only be primary u need to clear the origin cause no longer multicursor
        // cause there is too much going on so like I said u need to start by limiting interactions and then expand freedom later
        if (upcomingPositionIndex < prePosition) {
            if (upcomingLineAndColumnIndices.indexLine === EDITOR_cursorList[0].indexLine) {
                //isPermitted = false;
            }
        }

        if (!isPermitted) {
            alert('EDITOR_createCursorAtNextMatchSelection: two cursors would have been on the same line, thus this action was prevented. After closing this alert the previous one or many cursors that you had will remain and you can do a multicursor edit with them, then start a new multicursor edit at this "previously a second occurrence" of your selection on a single line. 1 cursor per line is done for the initial implementation to simplify things, then will be expanded upon after to support more than 1 on same line.');
            return;
        }
    }

    let clone = EDITOR_primaryCursor.clone();
    clone.selectionAnchor = EDITOR_primaryCursor.selectionAnchor;
    clone.selectionEnd = EDITOR_primaryCursor.selectionEnd;

    EDITOR_btnNext_onclick();

    let postPosition = EDITOR_getPositionIndex(EDITOR_primaryCursor);

    if (prePosition != postPosition && postPosition != EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber) {
        let input = document.getElementById('EDITOR_findOverlay_input_elementId');
        if (!input || !input.value) return;

        let indexOfPrimaryCursor = -1;

        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            if (EDITOR_cursorList[i] === EDITOR_primaryCursor) {
                indexOfPrimaryCursor = i;
                break;
            }
        }

        //EDITOR_cursorIndex_find_closestLessThanOrEqualToExistingCursorIndex(postPosition);

        EDITOR_cursorList.splice(indexOfPrimaryCursor, 0, clone);
        EDITOR_cursorListElement.appendChild(clone.caretRow);
        EDITOR_drawCursor(clone);

        EDITOR_primaryCursor.selectionAnchor = postPosition;
        EDITOR_primaryCursor.selectionEnd = postPosition + input.value.length;
        EDITOR_primaryCursor.indexColumn += input.value.length;
        EDITOR_drawCursor(EDITOR_primaryCursor);

        // Move primary cursor to index 0 of cursor list.
        if (postPosition < prePosition) {
            EDITOR_cursorList.splice(indexOfPrimaryCursor + 1, 1);
            EDITOR_cursorList.splice(0, 0, EDITOR_primaryCursor);
        }
    }
    else { // TODO: this is dead code with the pre-check of next match number?
        //EDITOR_primaryCursor.selectionAnchor = clone.selectionAnchor;
        //EDITOR_primaryCursor.selectionEnd = clone.selectionEnd;
        //EDITOR_primaryCursor.indexLine = clone.indexLine;
        //EDITOR_primaryCursor.indexColumn = clone.indexColumn;
        //EDITOR_drawCursor(EDITOR_primaryCursor);
    }
}

function EDITOR_cursorIndex_find_closestLessThanOrEqualToExistingCursorIndex(positionIndex) {

    let left = 0;
    let right = EDITOR_cursorList.length - 1;

    let index = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        let cursorPositionIndex = EDITOR_getPositionIndex(EDITOR_cursorList[mid]);
        
        if (positionIndex <= cursorPositionIndex) {
            index = mid;

            if (positionIndex === cursorPositionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (positionIndex > cursorPositionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return index;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_arrowDown(cursor, shiftKey) {
    EDITOR_preKeyboardMovementSelectionLogic(cursor, shiftKey);
    if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
        cursor.indexLine++;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
        if (cursor.STORED_indexColumn > lastValidIndexColumn) {
            cursor.indexColumn = lastValidIndexColumn;
        }
        else {
            cursor.indexColumn = cursor.STORED_indexColumn;
        }
    }
    EDITOR_postKeyboardMovementSelectionLogic(cursor, shiftKey);
    EDITOR_drawCursor(cursor);
}

/**
 * This function is expected to be used for a variety of scenarios,
 * but the initial use-case is caching the indentation when holding the 'enter' key, so that each consecutive event can know what the indentation was on the previous
 * event and not have to re-calculate it.
 * 
 * Then, the idea is that when the cursor moves you invoke this to invalidate that indentation cache so it gets recalculated.
 * 
 * TODO: I am quite certain that there are cases where this should be invoked but it isn't currently.
 * 
 * TODO: I believe this function to be an unoptimized solution, just that there are more pressing matters to attend to.
 */
function EDITOR_movementBasedCacheInvalidation() {
    EDITOR_cached_indentation_byteList = null;
    EDITOR_cached_indentation_string = null;
    EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = false;
}

/**
 * All the 'EDITOR_cursorList' loops are currently using the variable 'i'.
 * I'm experimenting with a few of the loops though such that at the start of every loop they set this variable equal to 'i'.
 * Then in any functions like getCharacter, I might be able to contextually find the character much faster.
 * */
let EDITOR_indexCursor = 0;
let EDITOR_offsetLine = 0;
let EDITOR_offsetColumn_withRespectToThisIndexLine = 0;
let EDITOR_offsetColumn = 0;
let EDITOR_totalShift = 0;

function EDITOR_editEvent(editKind, event) {
    // check for pending => selection
    // if so then finalize all current pending
    // ...this actually is checking for selection, then presuming at least 1 cursor has a pending...
    let shouldFinalizeAllCursors = false;
    let atLeastOneCursorHasASelection = false;
    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        let cursor = EDITOR_cursorList[i];
        if (cursor.hasSelection()) {
            shouldFinalizeAllCursors = true;
            atLeastOneCursorHasASelection = true;
            break;
        }
    }
    if (shouldFinalizeAllCursors) {
        shouldFinalizeAllCursors = false;
        EDITOR_finalizeAllCursors();
    }

    // If you have delete/backspace you need to ONLY remove the selection if it exists not remove selection then delete/backspace
    // but insert needs to remove selection AND insert.
    if (editKind === EditKind.InsertLtr || editKind === EditKind.Enter) {
        // check for editKind.None => selection
        // if so then attempt to remove selection foreach cursor
        // then finalize all those newly made selection removal edits
        if (atLeastOneCursorHasASelection) {
            shouldFinalizeAllCursors = true;
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor);
                }
            }
        }
        if (shouldFinalizeAllCursors) {
            shouldFinalizeAllCursors = false;
            EDITOR_finalizeAllCursors();
        }
    }

    // check for NOTcanBatch... I don't want the switch in the for loop... if you have a selection then you have a not can batch?
    switch (editKind) {
        case EditKind.InsertLtr:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_insert(cursor, i)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case EditKind.DeleteLtr:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_delete(cursor)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case EditKind.BackspaceRtl:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_backspace(cursor)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case EditKind.Tab:
            shouldFinalizeAllCursors = true;
            break;
        case EditKind.Enter:
            shouldFinalizeAllCursors = true;
            break;
        default:
            throw new Error(`The EditKind:${editKind} was not recognized.`);
            break;
    }
    if (shouldFinalizeAllCursors) {
        shouldFinalizeAllCursors = false;
        EDITOR_finalizeAllCursors();
    }

    // start/continue edit... I don't want the switch in the for loop
    switch (editKind) {
        case EditKind.InsertLtr:
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                EDITOR_indexCursor = i;
                if (EDITOR_offsetColumn_withRespectToThisIndexLine !== cursor.indexLine) {
                    EDITOR_offsetColumn_withRespectToThisIndexLine = cursor.indexLine;
                    EDITOR_offsetColumn = 0;
                }
                // You can do this because the function 'EDITOR_NOTcanBatch_insert' was already checked for all the cursors, if it is possible to batch, the editKind will stay InsertLtr otherwise it is finalized and set to None.
                // TODO: Use if === EditKind.None for copy and paste safety / it might just even be more readable
                if (cursor.editKind !== EditKind.InsertLtr) {
                    EDITOR_startEdit(cursor, EditKind.InsertLtr, EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                }
                EDITOR_insertDo(cursor, event.key);
                EDITOR_drawCursor(cursor);
                EDITOR_offsetColumn += cursor.editLength;
                EDITOR_totalShift += cursor.editLength; // this isn't needed here, but it is needed elsewhere so in order to create a pattern it was included here... TODO: maybe get rid of this or...?
            }
            break;
        case EditKind.DeleteLtr:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor); // when I delete a selection that contains a newline the edit length in my debug UI is 0?
                }
                else {
                    if (cursor.editKind !== EditKind.DeleteLtr) {
                        EDITOR_startEdit(cursor, EditKind.DeleteLtr, EDITOR_getPositionIndex(cursor), /*editLength*/ 0);
                    }
                    EDITOR_deleteDo(cursor, event);
                }
                EDITOR_drawCursor(cursor);
            }
            break;
        case EditKind.BackspaceRtl:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor);
                }
                else {
                    if (cursor.editKind !== EditKind.BackspaceRtl) {
                        EDITOR_startEdit(cursor, EditKind.BackspaceRtl, EDITOR_getPositionIndex(cursor), /*editLength*/ 0);
                    }
                    EDITOR_backspaceDo(cursor, event);
                }
                EDITOR_drawCursor(cursor);
            }
            break;
        case EditKind.Tab:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.hasSelection()) {
                    if (event.shiftKey) {
                        EDITOR_indentLess(cursor);
                    }
                    else {
                        EDITOR_indentMore(cursor);
                    }
                }
                else {
                    if (event.shiftKey) {
                    	// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor...
                    	// ...multi-cursor in and of itself is buggy that's why I'm not overly concerned with adding this in a bugged state...
                    	// ...everything is buggy and it is very anxiety inducing and for the time being I guess it just has to be that way as I transition
                    	// towards a useable editor all the features are coming together but there's this awkward phase of "I can start using it but also not really" or something I just idk.
                    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
                        EDITOR_indentLess(cursor);
                    }
                    else {
                        EDITOR_tabKey(cursor);
                    }
                }
                EDITOR_drawCursor(cursor);
            }
            break;
        case EditKind.Enter:
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                EDITOR_EnterKey(cursor, event.ctrlKey, event.shiftKey);
                EDITOR_drawCursor(cursor);
            }
        default:
            throw new Error(`The EditKind:${editKind} was not recognized.`);
            break;
    }
}

function EDITOR_registerHandlers() {
    EDITOR_baseElement.addEventListener('keydown', async event => {

        EDITOR_indexCursor = 0;
        EDITOR_offsetLine = 0;
        EDITOR_offsetColumn_withRespectToThisIndexLine = 0;
        EDITOR_offsetColumn = 0;
        EDITOR_totalShift = 0;

        switch (event.key) {
            case 'ArrowLeft':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                
                for (var i = 0; i < EDITOR_cursorList.length; i++) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_indexCursor = i;
                    if (EDITOR_offsetColumn_withRespectToThisIndexLine !== cursor.indexLine) {
                        EDITOR_offsetColumn_withRespectToThisIndexLine = cursor.indexLine;
                        EDITOR_offsetColumn = 0;
                    }

                    if (cursor.hasSelection() && !event.shiftKey) {
                        let small;
                        if (cursor.selectionAnchor < cursor.selectionEnd) {
                            small = cursor.selectionAnchor;
                        }
                        else {
                            small = cursor.selectionEnd;
                        }
                        let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(small);
                        cursor.indexLine = lineAndColumnIndices.indexLine;
                        cursor.indexColumn = lineAndColumnIndices.indexColumn;
                        cursor.selectionAnchor = cursor.selectionEnd;
                        cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
                        cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
                    }
                    else {
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        if (event.ctrlKey & cursor.indexColumn > 0) {
                            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
                            let indexPosition = line.start + cursor.indexColumn;
                            let originalCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, indexPosition);
                            cursor.indexColumn--;
                            indexPosition--;
    
                            while (cursor.indexColumn > 0) {
                                if (EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, indexPosition) === originalCharacterKind) {
                                    cursor.indexColumn--;
                                    indexPosition--;
                                }
                                else {
                                    break;
                                }
                            }
                        }
                        else {
                            if (cursor.indexColumn > 0) {
                                cursor.indexColumn--;
                            }
                            else if (cursor.indexLine > 0) {
                                cursor.indexLine--;
                                cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    }
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                    EDITOR_offsetColumn += cursor.editLength;
                    EDITOR_totalShift += cursor.editLength;
                }
                break;
            }
            case 'ArrowDown':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                if (event.ctrlKey) {
                    EDITOR_baseElement.scrollBy(0, EDITOR_lineHeight);
                }
                else if (event.altKey) {
                    if (event.shiftKey) {
                        EDITOR_createCursorLineBelow(event);
                    }
                }
                else {
                    let lastCursor = EDITOR_cursorList[EDITOR_cursorList.length - 1];
                    if (lastCursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
                        if (EDITOR_cursorList.length - 1 > 0 && EDITOR_cursorList[EDITOR_cursorList.length - 2].indexLine === lastCursor.indexLine - 1) {
                            alert("ArrowDown: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                            return;
                        }
                    }
                    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                        EDITOR_arrowDown(EDITOR_cursorList[i], /*shiftKey*/ event.shiftKey);
                    }
                }
                break;
            }
            case 'ArrowUp':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                if (event.ctrlKey) {
                    EDITOR_baseElement.scrollBy(0, -1 * EDITOR_lineHeight);
                }
                else {
                    let firstCursor = EDITOR_cursorList[0];
                    if (firstCursor.indexLine === 0) {
                        if (EDITOR_cursorList.length - 1 > 0 && EDITOR_cursorList[1].indexLine === firstCursor.indexLine + 1) {
                            alert("ArrowUp: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                            return;
                        }
                    }
                    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                        let cursor = EDITOR_cursorList[i];
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        if (cursor.indexLine > 0) {
                            cursor.indexLine--;
                            let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                            if (cursor.STORED_indexColumn > lastValidIndexColumn) {
                                cursor.indexColumn = lastValidIndexColumn;
                            }
                            else {
                                cursor.indexColumn = cursor.STORED_indexColumn;
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        EDITOR_drawCursor(cursor);
                    }
                }
                break;
            }
            case 'ArrowRight':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();

                // you can't use the indexLine/indexColumn; you need to use the editIndexLine/editIndexColumn or whatever it is they're called
                // and then what happens when the edit spans multiple lines? you're checking the editIndexLine would it just be relative to the offset and that's all?

                for (var i = 0; i < EDITOR_cursorList.length; i++) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_indexCursor = i;
                    if (EDITOR_offsetColumn_withRespectToThisIndexLine !== cursor.indexLine) {
                        EDITOR_offsetColumn_withRespectToThisIndexLine = cursor.indexLine;
                        EDITOR_offsetColumn = 0;
                    }

                    if (cursor.hasSelection() && !event.shiftKey) {
                        let large;
                        if (cursor.selectionAnchor < cursor.selectionEnd) {
                            large = cursor.selectionEnd;
                        }
                        else {
                            large = cursor.selectionAnchor;
                        }
                        let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(large);
                        cursor.indexLine = lineAndColumnIndices.indexLine;
                        cursor.indexColumn = lineAndColumnIndices.indexColumn;
                        cursor.selectionAnchor = cursor.selectionEnd;
                        cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
                        cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
                    }
                    else {
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                        if (event.ctrlKey & cursor.indexColumn < lastValidIndexColumn) {
                            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
                            let indexPosition = line.start + cursor.indexColumn;
                            let originalCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, indexPosition, line);
                            cursor.indexColumn++;
                            indexPosition++;
        
                            while (cursor.indexColumn < lastValidIndexColumn) {
                                if (EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, indexPosition, line) === originalCharacterKind) {
                                    cursor.indexColumn++;
                                    indexPosition++;
                                }
                                else {
                                    break;
                                }
                            }
                        }
                        else {
                            if (cursor.indexColumn < lastValidIndexColumn) {
                                cursor.indexColumn++;
                            }
                            else if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
                                cursor.indexColumn = 0;
                                cursor.indexLine++;
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    }
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                    EDITOR_offsetColumn += cursor.editLength;
                    EDITOR_totalShift += cursor.editLength;
                }
                break;
            }
            case 'Home':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                if (event.ctrlKey && EDITOR_cursorList.length > 1) {
                    alert("Home: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                    return;
                }
                for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    if (event.ctrlKey) {
                        cursor.indexLine = 0;
                        cursor.indexColumn = 0;
                    }
                    else {
                        let endExclusiveIndentationIndexColumn = EDITOR_findEndExclusiveIndentationIndexColumn(cursor);
                        if (cursor.indexColumn == endExclusiveIndentationIndexColumn) {
                            cursor.indexColumn = 0;
                        }
                        else {
                            cursor.indexColumn = endExclusiveIndentationIndexColumn;
                        }
                    }
                    EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                }
                break;
            }
            case 'End':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                if (event.ctrlKey && EDITOR_cursorList.length > 1) {
                    alert("End: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                    return;
                }
                for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    if (event.ctrlKey) {
                        cursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                    EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                }
                break;
            }
            case 'PageDown':
            {
                if (event.ctrlKey) {
                    // This doesn't seem to make a difference for me but I feel like I should have this line regardless...
                    // ...in case someone's computer for some reason would end up having default behavior even though mine seems to not.
                    event.preventDefault();
                    EDITOR_primaryCursor.indexLine = EDITOR_virtualLineIndex + EDITOR_virtualCount;
                    if (EDITOR_virtualCount > 1) {
                        // this seems to more commonly have the cursor staying within the viewport rather than overlapping outside.
                        EDITOR_primaryCursor.indexLine--;
                    }
                    if (EDITOR_primaryCursor.indexLine >= EDITOR_lineEndPositionList.count) {
                        // TODO: You can't delete EOF can you? i.e.: cursor final position of file then delete?
                        EDITOR_primaryCursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    EDITOR_primaryCursor.indexColumn = 0;
                    EDITOR_drawCursor(EDITOR_primaryCursor);
                }
                break;
            }
			case 'PageUp':
            {
                if (event.ctrlKey) {
                    // This doesn't seem to make a difference for me but I feel like I should have this line regardless...
                    // ...in case someone's computer for some reason would end up having default behavior even though mine seems to not.
                    event.preventDefault();
                    EDITOR_primaryCursor.indexLine = EDITOR_virtualLineIndex;
                    if (EDITOR_virtualCount > 1) {
                        // this seems to more commonly have the cursor staying within the viewport rather than overlapping outside.
                        EDITOR_primaryCursor.indexLine++;
                    }
                    if (EDITOR_primaryCursor.indexLine >= EDITOR_lineEndPositionList.count) {
                        // TODO: You can't delete EOF can you? i.e.: cursor final position of file then delete?
                        EDITOR_primaryCursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    EDITOR_primaryCursor.indexColumn = 0;
                    EDITOR_drawCursor(EDITOR_primaryCursor);
                }
                break;
            }
            case 'Delete':
            {
                EDITOR_movementBasedCacheInvalidation();
                EDITOR_editEvent(EditKind.DeleteLtr, event);
                break;
            }
            case 'Backspace':
            {
                EDITOR_movementBasedCacheInvalidation();
                EDITOR_editEvent(EditKind.BackspaceRtl, event);
                break;
            }
            case 'Escape':
            {
                EDITOR_movementBasedCacheInvalidation();
                EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
                break;
            }
            case ' ':
            {
                event.preventDefault();
                // len is 1 of this case, pattern doesn't match on purpose
                break;
            }
            case 'Tab':
            {
                event.preventDefault();
                EDITOR_movementBasedCacheInvalidation();
                EDITOR_editEvent(EditKind.Tab, event);
                break;
            }
            case 'Enter':
            {
                // Enter key relies on cached data that would be cleared, pattern doesn't match on purpose
                EDITOR_editEvent(EditKind.Enter, event);
                break;
            }
            case 'F12':
            {
                //await window.myAPI.editorDocumentSymbolsRequest();
                break;
            }
        }

        // TODO: Checking for a length of 1 is probably wrong but it'll let me start writing some code
        if (event.key.length === 1) {
            if (event.ctrlKey) {
                EDITOR_movementBasedCacheInvalidation();
                switch (event.key) {
                    case 'c':
                        EDITOR_finalizeAllCursors();
                        await EDITOR_copySelection(EDITOR_primaryCursor);
                        break;
                    case 'x':
                        EDITOR_finalizeAllCursors();
                        await EDITOR_copySelection(EDITOR_primaryCursor);
                        EDITOR_removeSelection(EDITOR_primaryCursor); // TODO: Multicursor bad
                        EDITOR_drawCursor(EDITOR_primaryCursor);
                        break;
                    case 'v':
                        EDITOR_finalizeAllCursors();
                        let clipboard = await window.myAPI.readClipboard();
                        EDITOR_paste(EDITOR_primaryCursor, clipboard); // TODO: Multicursor bad
                        // TODO: Whether a function will draw the respective cursor or not feels confusing when coming back to the code after it having been awhile, I do think it makes sense that you might not want to draw the cursor for when doing bulk operations then draw at the end... but it feels confusion somewhat.
                        EDITOR_drawCursor(EDITOR_primaryCursor);
                        break;
                    case 'd':
                        EDITOR_finalizeAllCursors();
                        EDITOR_duplicateSelection(EDITOR_primaryCursor); // TODO: Multicursor bad
                        EDITOR_drawCursor(EDITOR_primaryCursor);
                        break;
                    case 'a':
                        event.preventDefault();
                        EDITOR_finalizeAllCursors(); // TODO: Multicursor bad
                        EDITOR_primaryCursor.selectionAnchor = 0;
                        EDITOR_primaryCursor.selectionEnd = EDITOR_textByteList.count;
                        let selectionEndLineAndColumnIndices = EDITOR_getLineAndColumnIndices(EDITOR_primaryCursor.selectionEnd);
                        EDITOR_primaryCursor.indexLine = selectionEndLineAndColumnIndices.indexLine;
                        EDITOR_primaryCursor.indexColumn = selectionEndLineAndColumnIndices.indexColumn;
                        EDITOR_drawCursor(EDITOR_primaryCursor, /*NOTscrollCursorIntoView*/ true);
                        break;
                    case 'f':
                        EDITOR_findOverlay_showSetter(!EDITOR_findOverlay_show);
                        break;
                    case 'z':
                        //alert('undo');
                        break;
                    case 'y':
                        //alert('redo');
                        break;
                }
            }
            else if (event.altKey) {
            	switch (event.key) {
                    case '>':
                        if (event.shiftKey) {
                            let local_findOverlay_isBeingShownDueToMultiCursorMatching = EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching;
                            EDITOR_movementBasedCacheInvalidation();
                            EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = local_findOverlay_isBeingShownDueToMultiCursorMatching;
                            EDITOR_createCursorAtNextMatchSelection(event);
                        }
                        break;
                }
            }
            else {
                EDITOR_movementBasedCacheInvalidation();
                EDITOR_editEvent(EditKind.InsertLtr, event);
            }

            return;
        }
    });

    EDITOR_baseElement.addEventListener('mousedown', event => {

        EDITOR_movementBasedCacheInvalidation();

        if (EDITOR_cursorList.length > 1) {
            EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
        }

        if (!EDITOR_recentBoundingClientRect) {
            EDITOR_recentBoundingClientRect = EDITOR_baseElement.getBoundingClientRect();
        }

        if (event.button === 0) {
            EDITOR_isSourceOfLeftMouseButton = true;
            EDITOR_restoreThrottle_mouseMove();
        }

        let rY = event.clientY - EDITOR_recentBoundingClientRect.top + EDITOR_baseElement.scrollTop;
        let rX = event.clientX - EDITOR_recentBoundingClientRect.left - EDITOR_gutterWidthTotal + EDITOR_baseElement.scrollLeft;
        
        let indexLine = Math.floor(rY / EDITOR_lineHeight);
        let indexColumn = Math.round(rX / EDITOR_characterWidth);

        if (indexLine < 0) {
            indexLine = 0;
        }

        if (indexColumn < 0) {
            indexColumn = 0;
        }

        if (indexLine >= EDITOR_lineEndPositionList.count) {
            indexLine = EDITOR_lineEndPositionList.count - 1;
        }

        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(indexLine);
        if (indexColumn > lastValidIndexColumn) {
            indexColumn = lastValidIndexColumn;
        }

        if (rX < -1 * EDITOR_gutterPaddingRight) {
            EDITOR_detailRank = 3;
            EDITOR_onMouseDownDetailRankThree(event, indexLine, indexColumn);
            return;
        }

        if (event.detail % 3 === 0) {
            EDITOR_detailRank = 3;
            EDITOR_onMouseDownDetailRankThree(event, indexLine, indexColumn);
        }
        else if (event.detail % 2 === 0) {
            EDITOR_detailRank = 2;
            EDITOR_onMouseDownDetailRankTwo(event, indexLine, indexColumn);
        }
        else {
            EDITOR_detailRank = 1;
            EDITOR_onMouseDownDetailRankOne(event, indexLine, indexColumn);
        }
    });

    // Google AI overview for "javascript throttle trailing edge" generated the 'throttle(...)' function
    // ... I then asked how to invoke it and it gave me this:
    //
    // Using vanilla JS throttle with trailing edge support
    EDITOR_throttleMousemove = EDITOR_throttle_mouseMove(EDITOR_onMouseMove, 90, { leading: true, trailing: true });
    EDITOR_baseElement.addEventListener('mousemove', EDITOR_wrapOnMouseMove.bind(this));

    EDITOR_throttleScroll = EDITOR_throttle_scroll(EDITOR_onScroll, 100, { leading: true, trailing: true });
    EDITOR_baseElement.addEventListener('scroll', EDITOR_throttleScroll.bind(this));

    EDITOR_baseElement.addEventListener('wheel', event => {
        if (event.shiftKey) {
            EDITOR_baseElement.scrollBy(event.deltaY, 0);
            EDITOR_horizontal_scrollbar.scrollLeft = EDITOR_baseElement.scrollLeft;
        }
    });

    EDITOR_baseElement.addEventListener('contextmenu', async event => {
        let optionList = [
            new MenuOption(CommandKind.Cut, 'Cut', null),
            new MenuOption(CommandKind.Copy, 'Copy', null),
            new MenuOption(CommandKind.Paste, 'Paste', null),
            new MenuOption(CommandKind.Find, 'Find', null),
        ];

        let menuLeft = EDITOR_recentBoundingClientRect.left + EDITOR_gutterWidthTotal + EDITOR_primaryCursor.cursorLeftValue - EDITOR_baseElement.scrollLeft;
        let menuTop = EDITOR_recentBoundingClientRect.top + EDITOR_primaryCursor.cursorTopValue + EDITOR_lineHeight - EDITOR_baseElement.scrollTop;

        if (event.button === 2) {
            menuSet('EDITOR', null, optionList, menuLeft, menuTop);
        } else {
            menuSet('EDITOR', null, optionList, menuLeft, menuTop);
        }
    });

    EDITOR_throttleResize = EDITOR_throttle_resize(EDITOR_onResize, 200, { leading: false, trailing: true });
    window.addEventListener('resize', EDITOR_throttleResize.bind(this));

    // TODO: Are arrow functions an allocation and if so are they short lived, cached, etc...?
    EDITOR_horizontal_scrollbar.addEventListener('scroll', () => {
        EDITOR_baseElement.scrollLeft = EDITOR_horizontal_scrollbar.scrollLeft;
    });
}

let EDITOR_findOverlay_wasSearched = false;

function EDITOR_findOverlay_doSearch() {
	let input = document.getElementById('EDITOR_findOverlay_input_elementId');
    if (!input || !input.value) return;
    
    let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
    
    EDITOR_findOverlay_wasSearched = true;

    let searchEncoded = EDITOR_encoder.encode(input.value);

    EDITOR_finalizeAllCursors();

    EDITOR_findOverlay_searchResultPositionList.clear();

    // the find has the "text" right here so no streaming is being used

    let offset = 0;
    let posStartOfMatch = 0;

    /** Given the current EDITOR_primaryCursor position, which match comes next. */
    let nextMatchNumber = -1;
    let nextMatchPos;

    if (EDITOR_primaryCursor.hasSelection()) {
        let small = EDITOR_primaryCursor.selectionAnchor;
        let large = EDITOR_primaryCursor.selectionEnd;
        if (EDITOR_primaryCursor.selectionAnchor > EDITOR_primaryCursor.selectionEnd) {
            small = EDITOR_primaryCursor.selectionEnd;
            large = EDITOR_primaryCursor.selectionAnchor;
        }
        nextMatchPos = small;
    }
    else {
        nextMatchPos = EDITOR_getPositionIndex(EDITOR_primaryCursor);
    }
    
    if (EDITOR_findOverlay_options_matchWord && ((searchEncoded[0] >= 97 && searchEncoded[0] <= 122) || (searchEncoded[0] >= 65 && searchEncoded[0] <= 90) || (searchEncoded[0] >= 48 && searchEncoded[0] <= 57) || (searchEncoded[0] === 95))) {
		for (let i = 0; i < EDITOR_textByteList.count; i++) {
			if ((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95)) {
				if (EDITOR_textByteList.bytes[i] === searchEncoded[0]) {
    				while (i < EDITOR_textByteList.count) { // context switch to checking match
    					if (EDITOR_textByteList.bytes[i] === searchEncoded[offset]) {
				            if (offset === 0) {
				                posStartOfMatch = i;
				            }
				            offset++;
				            if (offset === searchEncoded.length) { // found "possible match"
				            	if (i + 1 >= EDITOR_textByteList.count ||
				            		!((EDITOR_textByteList.bytes[i + 1] >= 97 && EDITOR_textByteList.bytes[i + 1] <= 122) || (EDITOR_textByteList.bytes[i + 1] >= 65 && EDITOR_textByteList.bytes[i + 1] <= 90) || (EDITOR_textByteList.bytes[i + 1] >= 48 && EDITOR_textByteList.bytes[i + 1] <= 57) || (EDITOR_textByteList.bytes[i + 1] === 95))) { // ends on a word, therefore take match
					            		EDITOR_findOverlay_searchResultPositionList.insert(EDITOR_findOverlay_searchResultPositionList.count, posStartOfMatch);
                                        if (nextMatchNumber === -1 && posStartOfMatch >= nextMatchPos) {
                                            nextMatchNumber = EDITOR_findOverlay_searchResultPositionList.count;
                                            nextMatchPos = posStartOfMatch;
                                        }
				                		offset = 0;
				                		break;
				            	}
				            	else { // does NOT end on a word, therefore ignore match
				            		offset = 0;
				            		while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
				            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
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
				            while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
		            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
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
					while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
            				i--; // backtrack by one due to outer for loop's incrementation step
            				break;
            			}
        				i++;
            		}
				}
			}
			else {
				while (i < EDITOR_textByteList.count) { // move pos to next letterOrDigit or EOF
        			if ((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95)) {
        				i--; // backtrack by one due to outer for loop's incrementation step
        				break;
        			}
    				i++;
        		}
			}
	    }
    }
    else {
    	for (let i = 0; i < EDITOR_textByteList.count; i++) {
	        if (EDITOR_textByteList.bytes[i] === searchEncoded[offset]) {
	            if (offset === 0) {
	                posStartOfMatch = i;
	            }
	            offset++;
	            if (offset === searchEncoded.length) {
	                EDITOR_findOverlay_searchResultPositionList.insert(EDITOR_findOverlay_searchResultPositionList.count, posStartOfMatch);
                    if (nextMatchNumber === -1 && posStartOfMatch >= nextMatchPos) {
                        nextMatchNumber = EDITOR_findOverlay_searchResultPositionList.count;
                        nextMatchPos = posStartOfMatch;
                    }
	                offset = 0;
	            }
	        }
	        else {
	            // I'm not sure how I like this. It feels wasteful to set this to 0.
	            // But if I check to see if it is 0, that feels even more wasteful.
	            offset = 0;
	        }
	    }
    }

    if (nextMatchNumber === -1) {
        nextMatchNumber = 1;
    }
    spanCurrent.innerText = nextMatchNumber;
    spanTotal.innerText = EDITOR_findOverlay_searchResultPositionList.count;
}

function EDITOR_findOverlay_input_onkeydown(event) {
	//event.stopPropagation();
    switch (event.key) {
        case 'Enter':
            EDITOR_findOverlay_doSearch();
            break;
        case 'Escape':
        	EDITOR_findOverlay_wasSearched = false;
            EDITOR_findOverlay_showSetter(false);
            EDITOR_baseElement.focus();
            break;
    }
}

function EDITOR_findOverlay_input_onblur() {
	if (!EDITOR_findOverlay_wasSearched) {
		EDITOR_findOverlay_doSearch();
	}
}

function EDITOR_findOverlay_input_onchange() {
	EDITOR_findOverlay_wasSearched = false;
}

function EDITOR_findOverlay_checkboxMatchWord_onchange() {
	// for an onchange event, event.target might always be precise?
	let checkboxMatchWord = document.getElementById('EDITOR_findOverlay_checkboxMatchWord');
    if (checkboxMatchWord) {
    	EDITOR_findOverlay_options_matchWord = checkboxMatchWord.checked;
    	EDITOR_findOverlay_doSearch();
    }
}

let EDITOR_findOverlay_options_matchWord = false;

function EDITOR_findOverlay_showSetter(showValue) {
    EDITOR_finalizeAllCursors();

    if (!EDITOR_findOverlay_show && showValue) {
        EDITOR_findOverlay.style.visibility = '';
        EDITOR_findOverlay_searchResultPositionList = new UInt32List(256);
        
        let input = document.createElement('input');
        input.id = 'EDITOR_findOverlay_input_elementId';
        // 'change' needs to be the first event added so the 'Enter' keydown happens with proper timing
        input.addEventListener('change', EDITOR_findOverlay_input_onchange);
        input.addEventListener('keydown', EDITOR_findOverlay_input_onkeydown);
        input.addEventListener('blur', EDITOR_findOverlay_input_onblur);
        EDITOR_findOverlay.appendChild(input);
        if (!EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching) {
            input.focus();
        }
        
        let divCurrentOfTotal = document.createElement('div');
        let spanBlank = document.createElement('span');
        spanBlank.innerText = '1';
        spanBlank.id = 'EDITOR_findOverlay_current';
        divCurrentOfTotal.appendChild(spanBlank);
        let spanBlankOf = document.createElement('span');
        spanBlankOf.innerText = ' of ';
        divCurrentOfTotal.appendChild(spanBlankOf);
        let spanBlankOfBlank = document.createElement('span');
        spanBlankOfBlank.innerText = '10';
        spanBlankOfBlank.id = 'EDITOR_findOverlay_total';
        divCurrentOfTotal.appendChild(spanBlankOfBlank);
        EDITOR_findOverlay.appendChild(divCurrentOfTotal);
        
        let divPrevNext = document.createElement('div');
        let btnPrev = document.createElement('button');
        btnPrev.innerText = 'prev';
        btnPrev.id = 'EDITOR_findOverlay_prev';
        btnPrev.style.marginRight = '5px';
        let btnNext = document.createElement('button');
        btnNext.innerText = 'next';
        btnNext.id = 'EDITOR_findOverlay_next';
        btnPrev.addEventListener('click', EDITOR_btnPrev_onclick);
        btnNext.addEventListener('click', EDITOR_btnNext_onclick); 
        divPrevNext.appendChild(btnPrev);
        divPrevNext.appendChild(btnNext);
        EDITOR_findOverlay.appendChild(divPrevNext);
        
        let divOptions = document.createElement('div');
        let checkboxMatchWord = document.createElement('input');
	    checkboxMatchWord.type = 'checkbox';
	    checkboxMatchWord.id = 'EDITOR_findOverlay_checkboxMatchWord';
	    checkboxMatchWord.checked = EDITOR_findOverlay_options_matchWord;
	    checkboxMatchWord.addEventListener('change', EDITOR_findOverlay_checkboxMatchWord_onchange);
	    divOptions.appendChild(checkboxMatchWord);
	    let label_for_checkboxMatchWord = document.createElement('label');
	    label_for_checkboxMatchWord.htmlFor = 'EDITOR_findOverlay_checkboxMatchWord';
	    label_for_checkboxMatchWord.textContent = 'matchWord';
	    divOptions.appendChild(label_for_checkboxMatchWord);
	    EDITOR_findOverlay.appendChild(divOptions);
        
        if (EDITOR_primaryCursor.hasSelection()) {
        	EDITOR_finalizeAllCursors();
            let selectionAnchor = EDITOR_primaryCursor.selectionAnchor;
            let selectionEnd = EDITOR_primaryCursor.selectionEnd;
            let small;
            let large;
            if (selectionAnchor < selectionEnd) {
                small = selectionAnchor;
                large = selectionEnd;
            }
            else {
                small = selectionEnd;
                large = selectionAnchor;
            }
            let offset = small;
            let length = large - small;
            if (length <= 256) {
                input.value = EDITOR_decode_textonly(offset, length);
                EDITOR_findOverlay_doSearch();
            }
        }
    }
    else if (EDITOR_findOverlay_show && !showValue) {
        EDITOR_findOverlay.style.visibility = 'hidden';
        EDITOR_findOverlay_searchResultPositionList = null;
        let input = document.getElementById('EDITOR_findOverlay_input_elementId');
        if (input && input.parentElement === EDITOR_findOverlay) {
        	input.removeEventListener('change', EDITOR_findOverlay_input_onchange);
            input.removeEventListener('keydown', EDITOR_findOverlay_input_onkeydown);
            input.removeEventListener('blur', EDITOR_findOverlay_input_onblur);
            EDITOR_findOverlay.removeChild(input);
        }
        let btnPrev = document.getElementById('EDITOR_findOverlay_prev');
        if (btnPrev) {
        	btnPrev.removeEventListener('click', EDITOR_btnPrev_onclick);
        }
        let btnNext = document.getElementById('EDITOR_findOverlay_next');
        if (btnNext) {
        	btnNext.removeEventListener('click', EDITOR_btnNext_onclick);
        }
        let checkboxMatchWord = document.getElementById('EDITOR_findOverlay_checkboxMatchWord');
        if (checkboxMatchWord) {
        	checkboxMatchWord.removeEventListener('change', EDITOR_findOverlay_checkboxMatchWord_onchange);
        }
        EDITOR_findOverlay.innerHTML = '';
        EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = false;
    }

    EDITOR_findOverlay_show = showValue;
}

function EDITOR_btnPrev_onclick(/*event*/) {
	let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	
	let current = parseInt(spanCurrent.innerText, 10);
	let total = parseInt(spanTotal.innerText, 10);
	
	if (current && total) {
		current--;
		if (current < 1 || current >= total) {
			if (total > 1) {
				current = total;
			}
			else {
				current = 1;
			}
		}
		spanCurrent.innerText = current;
	}
	else {
		spanCurrent.innerText = 'parseInt not successful?';
	}
    // TODO: Delete this dead code
	//event.stopPropagation();

    let index = current - 1;
    if (index >= 0 && index < total && index < EDITOR_findOverlay_searchResultPositionList.count) {
        let pos = EDITOR_findOverlay_searchResultPositionList.data[index];
        if (pos <= EDITOR_textByteList.count) {
            EDITOR_moveCursor_position(pos);
        }
    }
}

function EDITOR_btnNext_onclick() {
	let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	
	let current = parseInt(spanCurrent.innerText, 10);
	let total = parseInt(spanTotal.innerText, 10);
	
	if (current && total) {
		current++;
		if (current > total || current < 1) {
			current = 1;
		}
		spanCurrent.innerText = current;
	}
	else {
		spanCurrent.innerText = 'parseInt not successful?';
	}

    let index = current - 1;
    if (index >= 0 && index < total && index < EDITOR_findOverlay_searchResultPositionList.count) {
        let pos = EDITOR_findOverlay_searchResultPositionList.data[index];
        if (pos <= EDITOR_textByteList.count) {
            EDITOR_moveCursor_position(pos);
        }
    }
}

/**
 * Invoking 'EDITOR_finalizeAllCursors()' is a good idea prior to invoking this. Long term perhaps this won't be so important.
 * @param {*} cursor 
 */
async function EDITOR_copySelection(cursor) {
	if (!cursor.hasSelection()) {
		// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor
    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
	}
	let selectionAnchor = cursor.selectionAnchor;
    let selectionEnd = cursor.selectionEnd;
    let small;
    let large;
    if (selectionAnchor < selectionEnd) {
        small = selectionAnchor;
        large = selectionEnd;
    }
    else {
        small = selectionEnd;
        large = selectionAnchor;
    }
    await window.myAPI.editorSetClipboard(EDITOR_textByteList.bytes, small, large - small, EDITOR_lineEndString);
}

/**
 * Invoking 'EDITOR_finalizeAllCursors()' is a good idea prior to invoking this. Long term perhaps this won't be so important.
 * @param {EDITOR_Cursor} cursor 
 */
async function EDITOR_duplicateSelection(cursor) {

	if (!cursor.hasSelection()) {
		// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor
    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
	}

	let selectionAnchor = cursor.selectionAnchor;
    let selectionEnd = cursor.selectionEnd;
    let small;
    let large;
    if (selectionAnchor < selectionEnd) {
        small = selectionAnchor;
        large = selectionEnd;
    }
    else {
        small = selectionEnd;
        large = selectionAnchor;
    }

    let length = large - small;

    let text = EDITOR_decode_textonly(small, length);

    cursor.selectionAnchor = large;
    cursor.selectionEnd = large;

    let largeLineAndColumnIndices = EDITOR_getLineAndColumnIndices(large);
    cursor.indexLine = largeLineAndColumnIndices.indexLine;
    cursor.indexColumn = largeLineAndColumnIndices.indexColumn;

	let rememberWhereAnchorGoes = large;

    EDITOR_paste(cursor, text);
    
    cursor.selectionAnchor = rememberWhereAnchorGoes;
    cursor.selectionEnd = EDITOR_getPositionIndex(cursor);

    // this won't work quite so easily cause of linefeeds?
    // I just need the slightest amount of "active rest" today then I'm gonna relax for remainder of the day.
    // So I'm not gonna worry too much about the optimization of this right now.
    // I just want anything that causes the correct result real quick then I'm done.
    // ---------------------------------
    // EDITOR_textByteList.insertBytes(large + 1, EDITOR_textByteList, /*offset*/ small, length);
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_indentMore(cursor) {
    let SMALL_pos;
    let LARGE_pos;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        SMALL_pos = cursor.selectionAnchor;
        LARGE_pos = cursor.selectionEnd;
    }
    else {
        SMALL_pos = cursor.selectionEnd;
        LARGE_pos = cursor.selectionAnchor;
    }

    let SMALL_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(SMALL_pos);
    let LARGE_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(LARGE_pos);

    let startingIndex = LARGE_lineAndColumnIndices.indexLine;
    let startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
    if (startingLinePos.start === LARGE_pos) {
        startingIndex -= 1;
        if (startingIndex >= 0) {
            startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
        }
    }

    if (startingIndex < SMALL_lineAndColumnIndices.indexLine) {
        return;
    }

    let ORIGINAL_incrementBy = (startingIndex + 1 - SMALL_lineAndColumnIndices.indexLine) * 4;
    let incrementBy = ORIGINAL_incrementBy;

    let trackedSyntaxReposition_i = EDITOR_trackedSyntaxReposition_find(startingLinePos.end + 1);
    if (trackedSyntaxReposition_i === NaN || trackedSyntaxReposition_i === -1) {
        trackedSyntaxReposition_i = EDITOR_trackedSyntaxList.count_abstract;
    }
    for (var i = trackedSyntaxReposition_i; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.setStart(
            i,
            EDITOR_trackedSyntaxList.getStart(i) + ORIGINAL_incrementBy);
    }
    trackedSyntaxReposition_i--;

    for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices.indexLine; lineI--) {
        let linePos = EDITOR_getLineBoundaryPositions(lineI);
        EDITOR_textByteList.insertBytes(linePos.start, EDITOR_on_tab_bytes, /*offset*/ 0, /*length*/ 4);
        
        EDITOR_lineEndPositionList.data[lineI] += incrementBy;

        for (; trackedSyntaxReposition_i >= 0; trackedSyntaxReposition_i--) {
            let start = EDITOR_trackedSyntaxList.getStart(trackedSyntaxReposition_i);
            if (linePos.start <= start) {
                EDITOR_trackedSyntaxList.setStart(trackedSyntaxReposition_i, start + incrementBy);
            }
            else {
                break;
            }
        }
        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, trackedSyntaxReposition_i);
        if (linePos.start > EDITOR_pooledTrackedSyntax.start && linePos.start < EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length) {
            EDITOR_trackedSyntaxList.setLength(trackedSyntaxReposition_i, EDITOR_pooledTrackedSyntax.length + 4);
        }

        incrementBy -= 4;
    }

    for (var lineI = startingIndex + 1; lineI < EDITOR_lineEndPositionList.count; lineI++) {
        EDITOR_lineEndPositionList.data[lineI] += ORIGINAL_incrementBy;
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        cursor.selectionEnd += ORIGINAL_incrementBy;
    }
    else {
        cursor.selectionAnchor += ORIGINAL_incrementBy;
    }

    cursor.indexColumn += 4;

    let smallLinePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
    if (SMALL_pos > smallLinePos.start) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            cursor.selectionAnchor += 4;
        }
        else {
            cursor.selectionEnd += 4;
        }
    }

    EDITOR_drawCursor(cursor);

    EDITOR_gutter.innerHTML = '';
    EDITOR_textElement.innerHTML = '';
    EDITOR_drawViewPort();
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_indentLess(cursor) {
    // selection positions
    let SMALL_pos;
    let LARGE_pos;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        SMALL_pos = cursor.selectionAnchor;
        LARGE_pos = cursor.selectionEnd;
    }
    else {
        SMALL_pos = cursor.selectionEnd;
        LARGE_pos = cursor.selectionAnchor;
    }
    let SMALL_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(SMALL_pos);
    let LARGE_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(LARGE_pos);

    // starting index
    let startingIndex = LARGE_lineAndColumnIndices.indexLine;
    let startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
    if (startingLinePos.start === LARGE_pos) {
        startingIndex -= 1;
        if (startingIndex >= 0) {
            startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
        }
    }
    if (startingIndex < SMALL_lineAndColumnIndices.indexLine) {
        return;
    }

    // loop over the lines to sum the "amount" of whitespace being removed
    let DETERMINE_decrementBy = 0;
    for (var lineI = SMALL_lineAndColumnIndices.indexLine; lineI <= startingIndex; lineI++) {
        let linePos = EDITOR_getLineBoundaryPositions(lineI);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(lineI);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    DETERMINE_decrementBy++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        DETERMINE_decrementBy += 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }
    }

    // Remember the total whitespace removed
    let ORIGINAL_decrementBy = DETERMINE_decrementBy;
    let decrementBy = ORIGINAL_decrementBy;

    // TODO: use better formatting
    // TODO: This handles the line that the small-selection-position resides on?
    {
        let linePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(SMALL_lineAndColumnIndices.indexLine);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        let count = 0;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    count++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        count+= 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }

        let smallLinePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
        if (SMALL_pos > smallLinePos.start) {
            if (cursor.selectionAnchor < cursor.selectionEnd) {
                cursor.selectionAnchor -= count;
            }
            else {
                cursor.selectionEnd -= count;
            }
        }

        if (cursor.indexLine === SMALL_lineAndColumnIndices.indexLine) {
            cursor.indexColumn -= count;
        }
    }

    // TODO: This at a glance seems to not account for when the cursor is small-position-ended and large-position-anchored...
    // ...this is moving the cursor actually, maybe it is fine? but maybe it is logic that could've been done during a loop but instead you made a new one to separately do this?
    // Also, this entire function is terribly written. You seemingly hacked something together; the code doesn't feel self explanatory. Furthermore there are both a lack of comments (given the confusing nature of how this is written), and dead comments.
    if (cursor.indexLine !== SMALL_lineAndColumnIndices.indexLine) {
        let linePos = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        let count = 0;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    count++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        count+= 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }
        let c = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        // TODO: git blame the below todo and remind them to delete the dead code
        // TODO: Delete this dead code / use better formatting
        /*if (SMALL_pos > smallLinePos.start) {
            if (cursor.selectionAnchor < cursor.selectionEnd) {
                cursor.selectionAnchor -= count;
            }
            else {
                cursor.selectionEnd -= count;
            }
        }*/
        if (cursor.indexLine === LARGE_lineAndColumnIndices.indexLine) {
            cursor.indexColumn -= count;
        }
    }

    let trackedSyntaxReposition_i = EDITOR_trackedSyntaxReposition_find(startingLinePos.end + 1);
    if (trackedSyntaxReposition_i === NaN || trackedSyntaxReposition_i === -1) {
        trackedSyntaxReposition_i = EDITOR_trackedSyntaxList.count_abstract;
    }
    for (var i = trackedSyntaxReposition_i; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.setStart(
            i,
            EDITOR_trackedSyntaxList.getStart(i) - ORIGINAL_decrementBy);
    }
    trackedSyntaxReposition_i--;

    for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices.indexLine; lineI--) {
        let innerRemoveCount = 0;
        let linePos = EDITOR_getLineBoundaryPositions(lineI);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(lineI);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    innerRemoveCount++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        innerRemoveCount += 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }

        EDITOR_textByteList.removeAt(linePos.start, innerRemoveCount);
        EDITOR_lineEndPositionList.data[lineI] -= decrementBy;

        for (; trackedSyntaxReposition_i >= 0; trackedSyntaxReposition_i--) {
            let start = EDITOR_trackedSyntaxList.getStart(trackedSyntaxReposition_i);
            if (linePos.start <= start) {
                EDITOR_trackedSyntaxList.setStart(trackedSyntaxReposition_i, start - decrementBy);
            }
            else {
                break;
            }
        }
        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, trackedSyntaxReposition_i);
        if (linePos.start > EDITOR_pooledTrackedSyntax.start && linePos.start < EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length) {
            EDITOR_trackedSyntaxList.setLength(trackedSyntaxReposition_i, EDITOR_pooledTrackedSyntax.length - innerRemoveCount);
        }

        decrementBy -= innerRemoveCount;
    }

    for (var lineI = startingIndex + 1; lineI < EDITOR_lineEndPositionList.count; lineI++) {
        EDITOR_lineEndPositionList.data[lineI] -= ORIGINAL_decrementBy;
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        cursor.selectionEnd -= ORIGINAL_decrementBy;
    }
    else {
        cursor.selectionAnchor -= ORIGINAL_decrementBy;
    }

    EDITOR_drawCursor(cursor);

    EDITOR_gutter.innerHTML = '';
    EDITOR_textElement.innerHTML = '';
    EDITOR_drawViewPort();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} content 
 */
function EDITOR_paste(cursor, content) {
    if (cursor.hasSelection()) {
        EDITOR_removeSelection(cursor);
    }

    if (cursor.editKind != EditKind.None) {
        // TODO: multicursor confusion scenario is likely to happy due to this code, but the code isn't related enough for me to change it yet.
        EDITOR_finalizeEdit(cursor);
    }

    let positionIndex = EDITOR_getPositionIndex(cursor);

    let linesInsertedCount = 0;
    let insertionLength = 0;

    for (var sourceI = 0; sourceI < content.length; sourceI++) {
        switch (content[sourceI]) {
            case '\t':
                EDITOR_textByteList.insertBytes(positionIndex + insertionLength, EDITOR_tab_tabsbytes, /*offset*/ 0, /*length*/ 4);
                insertionLength += 4;
                break;
            case '\n':
                EDITOR_textByteList.insert(positionIndex + insertionLength, ASCII_LINE_FEED);
                EDITOR_lineEndPositionList.insert(cursor.indexLine + linesInsertedCount, positionIndex + insertionLength);
                insertionLength++;
                linesInsertedCount++;
                break;
            case '\r':
                if (sourceI < content.length - 1 && content[sourceI + 1] === '\n') {
                    sourceI++;
                }
                EDITOR_textByteList.insert(positionIndex + insertionLength, ASCII_LINE_FEED);
                EDITOR_lineEndPositionList.insert(cursor.indexLine + linesInsertedCount, positionIndex + insertionLength);
                insertionLength++;
                linesInsertedCount++;
                break;
            default:
                EDITOR_textByteList.insert(positionIndex + insertionLength, content.charCodeAt(sourceI));
                insertionLength++;
                break;
        }
    }

    EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(positionIndex, insertionLength);

    for (var i = cursor.indexLine + linesInsertedCount; i < EDITOR_lineEndPositionList.count; i++) {
        EDITOR_lineEndPositionList.data[i] += insertionLength;
    }

    let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(positionIndex + insertionLength);
    cursor.indexLine = lineAndColumnIndices.indexLine;
    cursor.indexColumn = lineAndColumnIndices.indexColumn;

    update_VirtualLineIndex();
    EDITOR_gutter.innerHTML = '';
    EDITOR_textElement.innerHTML = '';
    EDITOR_drawViewPort();
    if (linesInsertedCount > 0) {
        update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count);
        EDITOR_drawGutter_Width();
    }
    EDITOR_drawHorizontalScrollbar();
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_tabKey(cursor) {
    let indexPosition = EDITOR_getPositionIndex(cursor);
    EDITOR_textByteList.insertBytes(indexPosition, EDITOR_on_tab_bytes, /*offset*/ 0, /*length*/ 4);

    EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, 4);

    for (var i = cursor.indexLine; i < EDITOR_lineEndPositionList.count; i++) {
        EDITOR_lineEndPositionList.data[i] += 4;
    }

    cursor.indexColumn += 4;

    update_VirtualLineIndex();
    EDITOR_gutter.innerHTML = '';
    EDITOR_textElement.innerHTML = '';
    EDITOR_drawViewPort();
    EDITOR_drawHorizontalScrollbar();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns the COLUMN index that exclusively ends the indentation.
 */
function EDITOR_findEndExclusiveIndentationIndexColumn(cursor) {
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    for (var i = 0; i < lastValidIndexColumn; i++) {
        let c = getCharacter(line.start + i);
        switch (c) {
            case ' ':
            case '\t':
            case '\0': // tabs are stored as: '\t\0\0\0'
                break;
            default:
                return i;
        }
    }

    return 0;
}

/**
 * If a line has an indentation of 4 space characters, but the user's cursor is positioned after the second space character,
 * then only the first 2 space characters will be used as indentation.
 * 
 * This is intentional, it seems like the more expected behavior in my mind.
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_cacheIndentation(cursor) {
    EDITOR_cached_indentation_byteList = new ByteList(32);
    let indentationBuilder = [];
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    let upperLimitIndexColumn;

    if (lastValidIndexColumn > cursor.indexColumn) {
        upperLimitIndexColumn = cursor.indexColumn;
    }
    else {
        upperLimitIndexColumn = lastValidIndexColumn;
    }

    outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
        let c = getCharacter(line.start + i);
        switch (c) {
            case ' ':
                EDITOR_cached_indentation_byteList.insert(EDITOR_cached_indentation_byteList.count, ASCII_SPACE);
                indentationBuilder.push(c);
                break;
            case '\t':
                EDITOR_cached_indentation_byteList.insert(EDITOR_cached_indentation_byteList.count, ASCII_TAB);
                indentationBuilder.push(c);
                break;
            case '\0': // tabs are stored as: '\t\0\0\0'
                EDITOR_cached_indentation_byteList.insert(EDITOR_cached_indentation_byteList.count, 0);
                indentationBuilder.push(c);
                break;
            default:
                break outer;
        }
    }

    EDITOR_cached_indentation_string = indentationBuilder.join('');
}

function EDITOR_lineWasInsertedValidateGutter() {
    if (EDITOR_gutter.children.length > 0 && EDITOR_gutter.children.length === EDITOR_virtualCount) {
        if (EDITOR_gutter.children[EDITOR_gutter.children.length - 1].innerText === '~') {
            let successFoundTildeAtIndex = EDITOR_gutter.children.length - 1;
            for (let i = EDITOR_gutter.children.length - 2; i >= 0; i--) {
                if (EDITOR_gutter.children[i].innerText === '~') {
                    successFoundTildeAtIndex = i;
                }
                else {
                    successFoundTildeAtIndex = i + 1;
                    break;
                }
            }
            if (successFoundTildeAtIndex > 0) {
                let number = parseInt(EDITOR_gutter.children[successFoundTildeAtIndex - 1].innerText);
                EDITOR_gutter.children[successFoundTildeAtIndex].innerText = number + 1;
            }
        }
    }

    EDITOR_drawGutter_Width();
}

/**
 * TODO: This uses a linear search and likely can be optimized.
 * 
 * @param {*} indexPosition 
 * @param {*} insertionCount 
 */
function EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount) {
    for (var i = 0; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, i);
        if (indexPosition <= EDITOR_pooledTrackedSyntax.start) {
            EDITOR_trackedSyntaxList.setStart(i, EDITOR_pooledTrackedSyntax.start + insertionCount);
        }
        else if (indexPosition > EDITOR_pooledTrackedSyntax.start && indexPosition < EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length) {
            EDITOR_trackedSyntaxList.setLength(i, EDITOR_pooledTrackedSyntax.length + insertionCount);
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {boolean} ctrlKey 
 * @param {boolean} shiftKey 
 * @returns 
 */
function EDITOR_EnterKey(cursor, ctrlKey, shiftKey) {
    if (!EDITOR_cached_indentation_byteList)
        EDITOR_cacheIndentation(cursor);

    if (ctrlKey) cursor.indexColumn = 0;
    else if (shiftKey) cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    
    update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + 1);

    let indexPosition = EDITOR_getPositionIndex(cursor);
    let relativeIndexLine = cursor.indexLine - EDITOR_virtualLineIndex;
    let insertionCount = 1;
    let shouldRenderEntireViewport = false;

    if (relativeIndexLine >= EDITOR_textElement.children.length || relativeIndexLine < 0)
        shouldRenderEntireViewport = true;

    // There are some cases that I don't feel like thinking about at the moment, this if statement singles them out.
    if (EDITOR_virtualCount <= 1 || EDITOR_textElement.children.length !== EDITOR_virtualCount)
        shouldRenderEntireViewport = true;

    // TODO: reminder for when virtualization padding is improved, this function might need to be looked at.
    // TODO: Track the enter keystroke the same as any other insertion edit and have it pending until it needs to be finalized.

    // 4 cases:
    // - "start of line":
    // - "end of line":
    // - "among a line":
    // - "fallback case": this last case is a fallback case and redraws the entire viewport in the case that the UI is in an "unpredictable state" and cannot be optimally redrawn in a smaller more specific redraw.

    // TODO: I'm not gonna put this on the fallback case, 'EDITOR_lineWasInsertedValidateGutter()'...
    // ...just cause it is different and I have a weird vibe but I'm too tired to investigate right now.
    // and it is gonna mess me up at some point cause the invocation does the longest line number drawing
    
    if (!shouldRenderEntireViewport && cursor.indexColumn === 0) { // start of line
        let lineDiv; // TODO: re-use the one you are removing?
        let removingVisuallyDiv;

        if (relativeIndexLine === EDITOR_virtualCount - 1) {
            if (relativeIndexLine === 0) {
                lineDiv = null; // last line at 0 means the visual feedback should be continued vision of the current line because you pushed it down then scrolled.
                removingVisuallyDiv = null; // No div above you to remove
            }
            else {
                lineDiv = EDITOR_getNewAndEmptyLineElement();
                removingVisuallyDiv = EDITOR_textElement.children[0];
            }
        }
        else {
            lineDiv = EDITOR_getNewAndEmptyLineElement();
            removingVisuallyDiv = EDITOR_textElement.children[EDITOR_virtualCount - 1];
        }

        if (lineDiv) {
            EDITOR_textElement.insertBefore(lineDiv, EDITOR_textElement.children[relativeIndexLine]);
            EDITOR_textElement.removeChild(removingVisuallyDiv);
        }

        if (EDITOR_cached_indentation_byteList) {
            insertionCount += EDITOR_cached_indentation_byteList.count;
            EDITOR_textByteList.insertBytes(indexPosition, EDITOR_cached_indentation_byteList.bytes, /*offset*/ 0, EDITOR_cached_indentation_byteList.count);
        }
        
        EDITOR_textByteList.insert(indexPosition + EDITOR_cached_indentation_byteList.count, ASCII_LINE_FEED);

        EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);
        
        for (var i = cursor.indexLine; i < EDITOR_lineEndPositionList.count; i++) {
            EDITOR_lineEndPositionList.data[i] += insertionCount;
        }

        EDITOR_lineEndPositionList.insert(cursor.indexLine, indexPosition + EDITOR_cached_indentation_byteList.count);

        if (ctrlKey) {
            cursor.indexColumn = insertionCount - 1;
        }
        else {
            cursor.indexLine++;
            cursor.indexColumn = insertionCount - 1;
        }

        EDITOR_lineWasInsertedValidateGutter();

        return;
    }
    else {
         if (!shouldRenderEntireViewport) {

            // ensure this conditional branch returns if handled, otherwise it will execute the fallback case erroneously
            
            let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
            if (lastValidIndexColumn === cursor.indexColumn) { // end of line
                let lineDiv;
                let removingVisuallyDiv;

                if (relativeIndexLine === EDITOR_virtualCount - 1) {
                    if (relativeIndexLine === 0) {
                        lineDiv = null;
                        removingVisuallyDiv = null; // No div above you to remove
                    }
                    else {
                        lineDiv = EDITOR_getNewAndEmptyLineElement();
                        removingVisuallyDiv = EDITOR_textElement.children[0];
                    }
                }
                else {
                    lineDiv = EDITOR_getNewAndEmptyLineElement();
                    removingVisuallyDiv = EDITOR_textElement.children[EDITOR_virtualCount - 1];
                }

                if (lineDiv) {
                    lineDiv.children[0].innerText = EDITOR_cached_indentation_string;
                    EDITOR_textElement.insertBefore(lineDiv, EDITOR_textElement.children[relativeIndexLine + 1]);
                    EDITOR_textElement.removeChild(removingVisuallyDiv);
                }
                
                EDITOR_textByteList.insert(indexPosition, ASCII_LINE_FEED);
                if (EDITOR_cached_indentation_byteList) {
                    insertionCount += EDITOR_cached_indentation_byteList.count;
                    EDITOR_textByteList.insertBytes(indexPosition + 1, EDITOR_cached_indentation_byteList.bytes, /*offset*/ 0, EDITOR_cached_indentation_byteList.count);
                }

                EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

                for (var i = cursor.indexLine; i < EDITOR_lineEndPositionList.count; i++) {
                    EDITOR_lineEndPositionList.data[i] += insertionCount;
                }

                EDITOR_lineEndPositionList.insert(cursor.indexLine, indexPosition);

                cursor.indexLine++;
                cursor.indexColumn = insertionCount - 1;

                EDITOR_lineWasInsertedValidateGutter();

                return;
            }
            else { // among a line
                let lineDiv;
                let removingVisuallyDiv;

                if (relativeIndexLine === EDITOR_virtualCount - 1) {
                    if (relativeIndexLine === 0) {
                        lineDiv = null;
                        removingVisuallyDiv = null; // No div above you to remove
                    }
                    else {
                        lineDiv = EDITOR_getNewAndEmptyLineElement();
                        removingVisuallyDiv = EDITOR_textElement.children[0];
                    }
                }
                else {
                    lineDiv = EDITOR_getNewAndEmptyLineElement();
                    removingVisuallyDiv = EDITOR_textElement.children[EDITOR_virtualCount - 1];
                }

                if (lineDiv) {
                    lineDiv.children[0].innerText = EDITOR_cached_indentation_string;
                    let w = walkLineUntilColumnIndex(cursor);

                    let shouldPreserveCssClassWhenSplittingAmongLine = false;
                    
                    // TODO: If you type between the closing '*/' of a multiline comment (whether it span a single or multiple lines) you need to set the length to "int max value"?
                    
                    /* multi line comments open and close via a 2 character length token, thus '> 1' and '< length - 2' */
                    if (!ctrlKey && !shiftKey) { // Is this '!ctrlKey && !shiftKey' check redundant? I feel like this conditional branch would never be reached regardless.
                        switch (w.span.className) {
                            case 'eCm':
                                if (w.indexColumn_SpanTextContentRelative > 1 && (w.indexColumn_SpanTextContentRelative < w.span.textContent.length - 2)) {
                                    w.span.className = 'eCM';
                                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                                    EDITOR_trackedSyntaxList.insert(
                                        indexOfGreaterThanOrEqual,
                                        TrackedSyntaxKind.Comment,
                                        indexPosition - cursor.indexColumn + w.indexColumn_Sum,
                                        w.span.textContent.length);
                                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                                }
                                break;
                            case 'eCM':
                                shouldPreserveCssClassWhenSplittingAmongLine = true;
                                break;
                            case 'eSm':
                                if (w.indexColumn_SpanTextContentRelative > 0 && (w.indexColumn_SpanTextContentRelative < w.span.textContent.length - 1)) {
                                    w.span.className = 'eSM';
                                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                                    EDITOR_trackedSyntaxList.insert(
                                        indexOfGreaterThanOrEqual,
                                        TrackedSyntaxKind.String,
                                        indexPosition - cursor.indexColumn + w.indexColumn_Sum,
                                        w.span.textContent.length);
                                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                                }
                                break;
                            case 'eSM':
                                shouldPreserveCssClassWhenSplittingAmongLine = true;
                                break;
                        }
                    }
                    
                    if (w.indexColumn_Goal > 0) {
                        if (w.indexColumn_Goal !== w.indexColumn_Sum + w.span.textContent.length) {
                            let firstText = w.span.textContent.substring(0, w.indexColumn_SpanTextContentRelative);
                            let lastText = w.span.textContent.substring(w.indexColumn_SpanTextContentRelative);
                            w.span.innerText = firstText;
                            if (shouldPreserveCssClassWhenSplittingAmongLine) {
                                lineDiv.children[0].className = w.span.className;
                                lineDiv.children[0].innerText += lastText;
                            }
                            else {
                                let span = document.createElement('span');
                                span.innerText = lastText;
                                lineDiv.appendChild(span);
                            }
                        }
                        
                        let rememberIndex = w.indexSpan + 1;
                        let rememberLength = w.div.children.length;
                        for (let i = rememberIndex; i < rememberLength; i++) {
                            lineDiv.appendChild(w.div.children[rememberIndex]);
                        }
                    }
                    EDITOR_textElement.insertBefore(lineDiv, EDITOR_textElement.children[relativeIndexLine + 1]);
                    EDITOR_textElement.removeChild(removingVisuallyDiv);
                }

                EDITOR_textByteList.insert(indexPosition, ASCII_LINE_FEED);
                if (EDITOR_cached_indentation_byteList) {
                    insertionCount += EDITOR_cached_indentation_byteList.count;
                    EDITOR_textByteList.insertBytes(indexPosition + 1, EDITOR_cached_indentation_byteList.bytes, /*offset*/ 0, EDITOR_cached_indentation_byteList.count);
                }

                EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

                for (var i = cursor.indexLine; i < EDITOR_lineEndPositionList.count; i++) {
                    EDITOR_lineEndPositionList.data[i] += insertionCount;
                }

                EDITOR_lineEndPositionList.insert(cursor.indexLine, indexPosition);

                cursor.indexLine++;
                cursor.indexColumn = insertionCount - 1;

                EDITOR_lineWasInsertedValidateGutter();

                return;
            }
         }

        // fallback case

        // fallback to inefficient viewport redraw if previous cases can't optimally render
        EDITOR_textByteList.insert(indexPosition, ASCII_LINE_FEED);
        if (EDITOR_cached_indentation_byteList) {
            insertionCount += EDITOR_cached_indentation_byteList.count;
            EDITOR_textByteList.insertBytes(indexPosition + 1, EDITOR_cached_indentation_byteList.bytes, /*offset*/ 0, EDITOR_cached_indentation_byteList.count);
        }

        // TODO: I don't know how to test this one. This trackedSyntax repositioning in this case, a before and after of it working never was observed...
        // ...this is the same solution used elsewhere and it seems like it would work if I could replicate this case. I think I need a very small window height???
        //
        EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

        for (var i = cursor.indexLine; i < EDITOR_lineEndPositionList.count; i++) {
            EDITOR_lineEndPositionList.data[i] += insertionCount;
        }

        EDITOR_lineEndPositionList.insert(cursor.indexLine, indexPosition);

        cursor.indexLine++;
        cursor.indexColumn = insertionCount - 1;

        update_VirtualLineIndex();
        EDITOR_gutter.innerHTML = '';
        EDITOR_textElement.innerHTML = '';
        EDITOR_drawViewPort();
        EDITOR_drawHorizontalScrollbar();
    }
}

function EDITOR_onResize() {
    EDITOR_recentBoundingClientRect = null;
    let remember_virtualCount = EDITOR_virtualCount;
    update_virtualCount();
    if (EDITOR_virtualCount !== remember_virtualCount) {
        update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + 1);
        EDITOR_onScroll();
    }
    EDITOR_drawHorizontalScrollbar();
}

function EDITOR_drawHorizontalScrollbar() {
    if (EDITOR_horizontal_scrollbar.style.left !== EDITOR_body.style.marginLeft) { 
        EDITOR_horizontal_scrollbar.style.left = EDITOR_body.style.marginLeft;
    }
    if (EDITOR_horizontal_scrollbar_widthValue !== (EDITOR_baseElement.clientWidth - EDITOR_gutterWidthTotal)) {
        EDITOR_horizontal_scrollbar_widthValue = (EDITOR_baseElement.clientWidth - EDITOR_gutterWidthTotal);
        EDITOR_horizontal_scrollbar.style.width = EDITOR_horizontal_scrollbar_widthValue + 'px';
    }
    if (EDITOR_horizontal_scrollbar_scrollWidth !== EDITOR_baseElement.scrollWidth) {
        EDITOR_horizontal_scrollbar_scrollWidth = EDITOR_baseElement.scrollWidth;
        EDITOR_horizontal_scrollbar_virtualization_boundary.style.width = EDITOR_horizontal_scrollbar_scrollWidth + 'px';
    }
    if (EDITOR_horizontal_scrollbar.scrollLeft !== EDITOR_baseElement.scrollLeft) {
        EDITOR_horizontal_scrollbar.scrollLeft = EDITOR_baseElement.scrollLeft;
    }
}

let EDITOR_ONSCROLLvirtualLineIndex = -1;
let EDITOR_ONSCROLLvirtualCount = -1;
let EDITOR_ONSCROLLscrollTop = -1;

/**
 * TODO: remove this perceived-to-be-outdated TODO:
 *     TODO: determine what line indices are already being displayed and then move things around
 * 
 * TODO: Too many verbose comments that are just ramblings
 */
function EDITOR_onScroll() {
    EDITOR_finalizeAllCursors();
    update_VirtualLineIndex();

    if (EDITOR_ONSCROLLscrollTop === EDITOR_baseElement.scrollTop &&
        EDITOR_ONSCROLLvirtualLineIndex === EDITOR_virtualLineIndex &&
        EDITOR_ONSCROLLvirtualCount === EDITOR_virtualCount) {
            return;
    }

    EDITOR_ONSCROLLscrollTop = EDITOR_baseElement.scrollTop;

    // If I delay setting 'EDITOR_ONSCROLLvirtualLineIndex' then I can just use that.
    // I can't bear to do that right now though. I'm just gonna make this variable.
    let prevVli = EDITOR_ONSCROLLvirtualLineIndex;
    let currVli = EDITOR_virtualLineIndex;

    EDITOR_ONSCROLLvirtualLineIndex = EDITOR_virtualLineIndex;

    if (EDITOR_ONSCROLLvirtualCount === EDITOR_virtualCount &&
        EDITOR_gutter.children.length === EDITOR_virtualCount &&
        EDITOR_textElement.children.length === EDITOR_virtualCount) {

        // The same count of lines is on the UI so you can probably
        // redraw them one by one and save "some" of the existing HTML.

        let diff = currVli - prevVli;

        if (diff > 0 && diff < EDITOR_virtualCount) {

            // I don't want to get caught up in any unnecessary complexity so I'm gonna isolate a single case
            // by duplicating the code and only my singular case hits the new code that I'm adding.
            //
            // It's possible the single case is the solution to every case.
            // But moreso mentally the problem is easier to approach from an anxiety/procrastination perspective.

            let firstIndexLineThatWasNotAlreadyRendered = prevVli + EDITOR_ONSCROLLvirtualCount;

            let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(firstIndexLineThatWasNotAlreadyRendered);
            if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
                trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
            }
    
            let trackedSyntax_I = trackedSyntax_StartingIndex;

            for (var i = 0; i < diff; i++) {
                let indexLine = prevVli + EDITOR_ONSCROLLvirtualCount + i;
    
                // EDITOR_drawGutter_Content()
                if (indexLine >= EDITOR_lineEndPositionList.count) {
                    EDITOR_gutter.children[0].innerText = '~';
                }
                else {
                    EDITOR_gutter.children[0].innerText = indexLine + 1;
                }
                EDITOR_gutter.appendChild(EDITOR_gutter.children[0]);
    
                let line = EDITOR_getLineBoundaryPositions(indexLine);
                let div = EDITOR_textElement.children[0];
                div.innerHTML = '';

                EDITOR_textElement.appendChild(div);

                trackedSyntax_I = EDITOR_createSpansForLineOfText(div, line, trackedSyntax_I);
            }
    
            EDITOR_drawHorizontalScrollbar();
        }
        else if (diff < 0 && (diff *= -1) < EDITOR_virtualCount) {

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

            let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(currVli);
            if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
                trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
            }
    
            let trackedSyntax_I = trackedSyntax_StartingIndex;

            for (var i = 0; i < diff; i++) {
                let indexLine = currVli + i;

                // EDITOR_drawGutter_Content()
                if (indexLine >= EDITOR_lineEndPositionList.count) {
                    EDITOR_gutter.children[EDITOR_gutter.children.length - 1].innerText = '~';
                }
                else {
                    EDITOR_gutter.children[EDITOR_gutter.children.length - 1].innerText = indexLine + 1;
                }
                EDITOR_gutter.insertBefore(EDITOR_gutter.children[EDITOR_gutter.children.length - 1], EDITOR_gutter.children[i]);
    
                let line = EDITOR_getLineBoundaryPositions(indexLine);
                let div = EDITOR_textElement.children[EDITOR_gutter.children.length - 1];
                div.innerHTML = '';

                EDITOR_textElement.insertBefore(div, EDITOR_textElement.children[i]);
                
                trackedSyntax_I = EDITOR_createSpansForLineOfText(div, line, trackedSyntax_I);
            }
    
            EDITOR_drawHorizontalScrollbar();
        }
        else {
            let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(0 + EDITOR_virtualLineIndex);
            if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
                trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
            }
    
            let trackedSyntax_I = trackedSyntax_StartingIndex;
    
            for (var i = 0; i < EDITOR_virtualCount; i++) {
                let indexLine = i + EDITOR_virtualLineIndex;
    
                // EDITOR_drawGutter_Content()
                if (indexLine >= EDITOR_lineEndPositionList.count) {
                    EDITOR_gutter.children[i].innerText = '~';
                }
                else {
                    EDITOR_gutter.children[i].innerText = indexLine + 1;
                }
    
                let line = EDITOR_getLineBoundaryPositions(indexLine);
                let div = EDITOR_textElement.children[i];
                div.innerHTML = '';

                trackedSyntax_I = EDITOR_createSpansForLineOfText(div, line, trackedSyntax_I);
            }
    
            EDITOR_drawHorizontalScrollbar();
        }
    }
    else {
        EDITOR_ONSCROLLvirtualCount = EDITOR_virtualCount;

        EDITOR_gutter.innerHTML = '';
        EDITOR_textElement.innerHTML = '';
        EDITOR_drawViewPort();
        EDITOR_drawHorizontalScrollbar();
    }
}

/**
 * If you were to make a function for this logic, it presumably would look like this.
 * I'm not sure if I like the idea of having a function for this though, given it is inside a loop, I'd want to investigate whether it has any performance impacts.
 * TODO: make a decision
 * 
 * @param line is the result from 'EDITOR_getLineBoundaryPositions(...)'
 * 
 * @returns trackedSyntax_I the index that was left off on
 */
function EDITOR_createSpansForLineOfText(div, line, trackedSyntax_I) {
	let childIndex = 0;
    if (line.start === line.end) {
    	if (childIndex < div.children.length) {
			div[childIndex++].innerText = '';
		}
		else {
			div.appendChild(document.createElement('span'));
		}
    }
    else {
        let substart = line.start;
        for (; trackedSyntax_I < EDITOR_trackedSyntaxList.count_abstract;) {
            EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, trackedSyntax_I);
    
            if (substart >= line.end) {
                break;
            }
    
            if (EDITOR_pooledTrackedSyntax.start >= line.end) {
                break;
            }
    
            if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length < line.start) {
                trackedSyntax_I++;
                continue;
            }
    
            if (EDITOR_pooledTrackedSyntax.start > substart) {
                if (JS_line_lex) {
                    let subend = EDITOR_pooledTrackedSyntax.start > line.end ? line.end : EDITOR_pooledTrackedSyntax.start; // probably a nonsense line of code given the previous if statements
                    JS_line_lex(div, substart, subend);
                    substart += (subend - substart);
                }
                else {
                    let span;
                    if (childIndex < div.children.length) {
						span = div[childIndex++];
					}
					else {
						span = document.createElement('span');
					}
                    
                    let subend = EDITOR_pooledTrackedSyntax.start > line.end ? line.end : EDITOR_pooledTrackedSyntax.start; // probably a nonsense line of code given the previous if statements
                    span.innerText = EDITOR_decode_raw(substart, subend - substart);
                    substart += (subend - substart);
                    div.appendChild(span);
                }
            }
    
            {
                let span;
                if (childIndex < div.children.length) {
					span = div[childIndex++];
				}
				else {
					span = document.createElement('span');
				}
                let trackedSyntaxEnd = EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length;
                let subend = trackedSyntaxEnd > line.end ? line.end : trackedSyntaxEnd;
                span.innerText = EDITOR_decode_raw(substart, subend - substart);
                substart += (subend - substart);
                if (EDITOR_pooledTrackedSyntax.trackedSyntaxKind === TrackedSyntaxKind.Comment) {
                    span.className = 'eCM';
                }
                else if (EDITOR_pooledTrackedSyntax.trackedSyntaxKind === TrackedSyntaxKind.String) {
                    span.className = 'eSM';
                }
                else {
                	// span.className = '';
                }
                div.appendChild(span);
            }
    
            if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length <= line.end) {
                trackedSyntax_I++;
                continue;
            }
    
            break;
        }
    
        if (substart < line.end) {
            if (JS_line_lex) {
                JS_line_lex(div, substart, line.end);
            }
            else {
                let span;
                if (childIndex < div.children.length) {
					span = div[childIndex++];
				}
				else {
					span = document.createElement('span');
				}
                span.innerText = EDITOR_decode_raw(substart, line.end - substart);
                div.appendChild(span);
            }
        }
    }

    return trackedSyntax_I;
}

function EDITOR_REMOVE_line_drawGutter(linesRemovedCount) {

    //EDITOR_finalizeAllCursors();

    // It's actually something about current undershoot vs overshoot incoming to undershoot or sometrhing
    // largestDrawnIndexLine + linesRemovedCount ? EDITOR_lineEndPositionList.count

    if (EDITOR_gutter.children.length > 0 && EDITOR_gutter.children.length === EDITOR_virtualCount) {
        if (EDITOR_gutter.children[EDITOR_gutter.children.length - 1].innerText === '~') {
            let successFoundTildeAtIndex = EDITOR_gutter.children.length - 1;
            for (let i = EDITOR_gutter.children.length - 2; i >= 0; i--) {
                if (EDITOR_gutter.children[i].innerText === '~') {
                    successFoundTildeAtIndex = i;
                }
                else {
                    successFoundTildeAtIndex = i + 1;
                    break;
                }
            }
            for (var i = 0; i < linesRemovedCount; i++) {
                if (successFoundTildeAtIndex > i) {
                    EDITOR_gutter.children[successFoundTildeAtIndex - (i + 1)].innerText = '~';
                }
            }
        }
        else { // I don't have '~' in view

            // TODO: you need to check the non-selection-based-removes for bringing existing text into view via removal of a line
            
            let largestDrawnIndexLine = EDITOR_virtualLineIndex + EDITOR_virtualCount;

            if (largestDrawnIndexLine + linesRemovedCount >= EDITOR_lineEndPositionList.count) {
                // but I'll bring one or more into view by doing the removal
                //let bbb = largestDrawnIndexLine + linesRemovedCount - (EDITOR_lineEndPositionList.count - 1);
                //let aaa = 2;
                //let successFoundTildeAtIndex = EDITOR_gutter.children.length - 1;
                //for (let i = EDITOR_gutter.children.length - 2; i >= 0; i--) {
                //    if (EDITOR_gutter.children[i].innerText === '~') {
                //        successFoundTildeAtIndex = i;
                //    }
                //    else {
                //        successFoundTildeAtIndex = i + 1;
                //        break;
                //    }
                //}
                //for (var i = 0; i < bbb; i++) {
                //    if (successFoundTildeAtIndex > i) {
                //        EDITOR_gutter.children[successFoundTildeAtIndex - (i + 1)].innerText = '~';
                //    }
                //}
            }
            else {
                // but the removal will NOT bring any into view.
            }
        }
    }

    // - [ ] If you are scrolled (vertical was the specific observation, horizontal was not tested) when you open a file, it bugs out and duplicates the text visually?

    EDITOR_drawGutter_Width();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_removeSelection(cursor) {
    if (cursor.editKind != EditKind.None) {
        // TODO: multicursor confusion scenario is likely to happy due to this code, but the code isn't related enough for me to change it yet.
        EDITOR_finalizeEdit(cursor);
    }

    let smallPosition;
    let largePosition;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        smallPosition = cursor.selectionAnchor;
        largePosition = cursor.selectionEnd;
    }
    else {
        smallPosition = cursor.selectionEnd;
        largePosition = cursor.selectionAnchor;
    }

    cursor.selectionAnchor = 0;
    cursor.selectionEnd = 0;

    let editLength = largePosition - smallPosition;
    // editLength is 0 in this ...startEdit invocation intentionally, you cannot set the editLength until the end (TODO: remember what the exact reason was and put it here... I think it was because 'EDITOR_readLineEndPositionList' function is used rather than reading directly)
    EDITOR_startEdit(cursor, EditKind.RemoveTextNoBatching, smallPosition, /*editLength*/ 0);

    let smallLineAndColumnIndices = EDITOR_getLineAndColumnIndices(smallPosition);
    cursor.indexLine = smallLineAndColumnIndices.indexLine;
    cursor.indexColumn = smallLineAndColumnIndices.indexColumn;
    cursor.editIndexLine = smallLineAndColumnIndices.indexLine;
    cursor.editIndexColumn = smallLineAndColumnIndices.indexColumn;

    let largeLineAndColumnIndices = EDITOR_getLineAndColumnIndices(largePosition);
    cursor.END_editIndexLine = largeLineAndColumnIndices.indexLine;
    cursor.END_editIndexColumn = largeLineAndColumnIndices.indexColumn;

    let indexTrackedSyntax = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(cursor.indexLine);
    if (indexTrackedSyntax === NaN || indexTrackedSyntax === -1) {
        indexTrackedSyntax = EDITOR_trackedSyntaxList.count_abstract;
    }
    let possibleTrackedSyntaxToSpanSingleLine = false;
    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, indexTrackedSyntax);
        if (EDITOR_pooledTrackedSyntax.start < EDITOR_lineEndPositionList.data[cursor.indexLine]) {
            possibleTrackedSyntaxToSpanSingleLine = true;
        }
        // TODO: This has no reason to be a for loop
        for (let i = cursor.indexLine - 1; i >= 0; i--) {
            let lineEndPosition = EDITOR_lineEndPositionList.data[i];
            if (EDITOR_pooledTrackedSyntax.start < lineEndPosition &&
                EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > lineEndPosition) {
                    possibleTrackedSyntaxToSpanSingleLine = false;
                    break;
            }
            else {
                break;
            }
        }
    }

    let linesRemovedCount = 0;
    // -1 since you can't remove EOF
    for (var iVarDependent = cursor.indexLine; iVarDependent < EDITOR_lineEndPositionList.count - 1; iVarDependent++) {
        let lineEnding = EDITOR_readLineEndPositionList(iVarDependent);
        if (lineEnding >= cursor.editPosition && lineEnding < cursor.editPosition + editLength) {
            linesRemovedCount++;

            if (possibleTrackedSyntaxToSpanSingleLine) {
                let NOTlineEndBelongsToSyntax;
                if (iVarDependent >= EDITOR_lineEndPositionList.count)
                    NOTlineEndBelongsToSyntax = true;
                else if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length <= EDITOR_lineEndPositionList.data[iVarDependent])
                    NOTlineEndBelongsToSyntax = true;
                
                if (NOTlineEndBelongsToSyntax) {
                    EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);

                    // do not increment because removed
                    possibleTrackedSyntaxToSpanSingleLine = false;
                    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
                        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, indexTrackedSyntax);
                        if (EDITOR_pooledTrackedSyntax.start < lineEnding &&
                            EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > lineEnding) {
                                possibleTrackedSyntaxToSpanSingleLine = true;
                        }
                    }
                }
            }
        }
        else {
            break;
        }
    }

    if (linesRemovedCount > 0 && possibleTrackedSyntaxToSpanSingleLine) {
        // The next line end will NOT be removed, so you need to check whether it was encompassed by the possible syntax.
        //
        // Inside the for loop you need to do this when you exhaust the encompassed line ends for a given syntax and move to the next one too.
        //
        let NOTlineEndBelongsToSyntax;
        if (iVarDependent >= EDITOR_lineEndPositionList.count)
            NOTlineEndBelongsToSyntax = true;
        else if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length <= EDITOR_lineEndPositionList.data[iVarDependent])
            NOTlineEndBelongsToSyntax = true;
        
        if (NOTlineEndBelongsToSyntax)
            EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);
    }

    let finalLineEndPosition = EDITOR_readLineEndPositionList(cursor.indexLine + linesRemovedCount);
    let largestDrawnIndexLine = EDITOR_virtualLineIndex + EDITOR_virtualCount - 1;
    let visibleLinesRemovedCount = 0;

    // 5 stages
    // ========
    // - Remove selection on large position line
    // - Remove selection on small position line
    // - Visually merge the small position line and large position line (if applicable)
    // - Remove middle line(s)
    // - 'Draw lines that came into view' / 'clear text for any lines > text length and use a '~' in the gutter'

    // Remove selection on small position line
    let smallLineDiv = null;
    {
        cursor.indexLine = smallLineAndColumnIndices.indexLine;
        cursor.indexColumn = smallLineAndColumnIndices.indexColumn;

        let w = walkLineUntilColumnIndex(cursor);
        
        let lineBoundaryPositions = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let remaining;
        if (largePosition > lineBoundaryPositions.end) {
            remaining = lineBoundaryPositions.end - smallPosition;
        }
        else {
            remaining = largePosition - smallPosition;
        }

        if (w.span && w.indexColumn_SpanTextContentRelative >= 0) {
            smallLineDiv = w.div;
            while (remaining > 0) {
                let available = w.span.innerText.length - w.indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;    
                
                if (count > 0) {
                    w.span.innerText = w.span.innerText.slice(0, w.indexColumn_SpanTextContentRelative) + w.span.innerText.slice(w.indexColumn_SpanTextContentRelative + count);
                }

                if (w.div.children.length > 1 && w.span.innerText.length === 0) {
                    w.div.removeChild(w.span);
                }
                else {
                    w.indexSpan++;
                }
    
                if (remaining > 0) {
                    if (w.indexSpan >= w.div.children.length) break;
                    w.span = w.div.children[w.indexSpan];
                    w.indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }

    // Remove selection on large position line
    let largeLineDiv = null;
    if (linesRemovedCount > 0) {
        cursor.indexLine = cursor.indexLine + linesRemovedCount;
        cursor.indexColumn = 0;

        let lineBoundaryPositions = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let remaining = largePosition - lineBoundaryPositions.start;

        let w = walkLineUntilColumnIndex(cursor);

        if (w.span && w.indexColumn_SpanTextContentRelative >= 0) {
            largeLineDiv = w.div;
            while (remaining > 0) {
                let available = w.span.innerText.length - w.indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;

                if (count > 0)
                    w.span.innerText = w.span.innerText.slice(0, w.indexColumn_SpanTextContentRelative) + w.span.innerText.slice(w.indexColumn_SpanTextContentRelative + count);

                if (w.div.children.length > 1 && w.span.innerText.length === 0)
                    w.div.removeChild(w.span);
                else
                    w.indexSpan++;
    
                if (remaining > 0) {
                    if (w.indexSpan >= w.div.children.length) break;
                    w.span = w.div.children[w.indexSpan];
                    w.indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }

    // TODO: There's a presumption that you have the HTML, this isn't always the case so I'll have to revisit this

    // Merge the first and last lines (if applicable)
    //
    // Four cases of existence (!... implies it does NOT exist, i.e.: it is not rendered on the UI)
    // =======================
    // - [ ] keeping, removing
    // - [ ] keeping, !removing
    // - [ ] !keeping, removing
    // - [ ] !keeping, !removing
    //
    // - [ ] Ensure all 4 cases of existence handle 'EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);'
    //
    if (linesRemovedCount > 0) {
        cursor.indexLine = smallLineAndColumnIndices.indexLine;
        cursor.indexColumn = smallLineAndColumnIndices.indexColumn;

        if (smallLineDiv) {
            if (largeLineDiv) { // - [x] keeping, removing
                let rememberLargeLineDivLength = largeLineDiv.children.length;
                for (var i = 0; i < rememberLargeLineDivLength; i++) {
                    if (largeLineDiv.children[0].innerText.length > 0) {
                        smallLineDiv.appendChild(largeLineDiv.children[0]);
                    }
                    else {
                        largeLineDiv.removeChild(largeLineDiv.children[0]);
                    }
                }
                visibleLinesRemovedCount++;
                largeLineDiv.innerHTML = '';
                EDITOR_textElement.appendChild(largeLineDiv);
            }
            else { // - [ ] keeping, !removing

            }
        }
        else {
            if (largeLineDiv) { // - [ ] !keeping, removing
                
            }
            else { // - [ ] !keeping, !removing
                
            }
        }
        
        /*if (smallIndexLine < EDITOR_textElement.children.length && smallIndexLine >= 0) {
            
            let smallLineDiv = EDITOR_textElement.children[smallIndexLine];


            // Goal: If you have the line that the selection's small position is on (the keeping div)
            // then you need to get the text for the line that the selection's large position is on (the removing div).
            //
            // The goal splits into two cases:
            //
            // - If the line that the selection's large position is on exists in the viewport,
            // then you can move the HTML from the div that represents that line,
            // to the div that represents the line that the selection's small position is on.
            //
            // - If the line that the selection's large position is on does NOT exist in the viewport,
            // then you need to generate the HTML for the line's text and add it
            // to the div that represents the line that the selection's small position is on.
            // 
            // Funnily enough I might be able to just invoke 'EDITOR_drawLine(...)'.
            //
            // The function has a very frustrating quirk where the invoker has to
            // provide the div that the HTML gets appended to.
            // 
            // In addition to that, if you want to redraw the line,
            // the invoker has to set 'innerHTML' to '' prior to invoking the function.
            //
            // But this might mean I can invoke 'EDITOR_drawLine(...)'
            // without setting 'innerHTML' to '', and this would append the text of that line...
            //
            // Although I'm presuming that I'd generate the HTML
            // prior to modifying the line end position indices.
            //
            // In the current state of the code, this merging of the small and large lines
            // is done AFTER already having modified the line end position indices.


            let removingDiv = EDITOR_textElement.children[largeIndexLine];
            let rememberRemovingDivLength = removingDiv.children.length;

            for (var i = 0; i < rememberRemovingDivLength; i++) {
                if (removingDiv.children[0].innerText.length > 0) {
                    smallLineDiv.appendChild(removingDiv.children[0]);
                }
                else {
                    removingDiv.removeChild(removingDiv.children[0]);
                }
            }

            visibleLinesRemovedCount++;
            removingDiv.innerHTML = '';
            EDITOR_textElement.appendChild(removingDiv);
        }*/

        EDITOR_lineEndPositionList.data[smallLineAndColumnIndices.indexLine] = finalLineEndPosition;
        EDITOR_lineEndPositionList.removeAt(cursor.indexLine + linesRemovedCount, 1);
    }

    // Remove middle line(s)
    if (linesRemovedCount > 0) {
        cursor.indexLine = smallLineAndColumnIndices.indexLine;
        // WARNING: This loop does NOT run for the small line, the small line is handled as a separate case (the case where the small and large lines are merged visually if applicable).

        for (var i = linesRemovedCount - 1; i > 0; i--) {
            let indexLine = cursor.indexLine + i;
            let relativeLineIndex = indexLine - EDITOR_virtualLineIndex;
            if (relativeLineIndex >= EDITOR_textElement.children.length || relativeLineIndex < 0) {
                continue;
            }

            visibleLinesRemovedCount++;
            let textLineElement = EDITOR_textElement.children[relativeLineIndex];
            textLineElement.innerHTML = '';
            EDITOR_textElement.appendChild(textLineElement);
        }
        EDITOR_lineEndPositionList.removeAt(smallLineAndColumnIndices.indexLine + 1, linesRemovedCount - 1);
    }

    cursor.editLength = editLength;

    // 'Draw lines that came into view' / 'clear text for any lines > text length and use a '~' in the gutter'
    if (linesRemovedCount > 0) {

        // off by 1 character
        //
        // Finalizing all cursors fixes the issue... but why was it off by 1 character?
        // 
        // TODO: this needs to be understood but delaying the finalization of an edit is more along the lines of an optimization...
        // ...versus selecting and removing text which needs to work properly both in terms of editing the text and visually displaying the correct result.
        // 
        EDITOR_finalizeAllCursors();

        // 3 cases (TODO: Ensure these for backspace and delete)
        // =======
        // - [ ] inViewTildeCase
        // - [ ] comesIntoViewDueToRemovalTildeCase
        // - [ ] notInViewTildeCase
        //
        // Each case might be the same solution I don't know I just need time to think I'm completely exhausted but ima figure it out by just typing everything out and overtime it will happen
        // 
        if (EDITOR_textElement.children.length === EDITOR_gutter.children.length) {
            for (let i = 0; i < visibleLinesRemovedCount; i++) {
                let gutterLineElement = EDITOR_gutter.children[EDITOR_textElement.children.length - 1 - i];
                gutterLineElement.innerHTML = ''; // I don't believe this will have already been cleared.
                let textLineElement = EDITOR_textElement.children[EDITOR_textElement.children.length - 1 - i];
                textLineElement.innerHTML = ''; // Might already be cleared, furthermore might ALWAYS be cleared.
                EDITOR_drawLine(largestDrawnIndexLine - i, gutterLineElement, textLineElement);
            }
        }

        EDITOR_drawGutter_Width();

        // TODO: 'update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count);'?
        // TODO: EDITOR_REMOVE_line_drawGutter(linesRemovedCount);
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} event 
 * @returns 
 */
function EDITOR_deleteDo(cursor, event) {
    if (cursor.hasSelection()) {
        EDITOR_removeSelection(cursor);
        return;
    }

    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);

    let w = walkLineUntilColumnIndex(cursor);
    if (w.indexColumn_Goal == lastValidIndexColumn) {

        if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
            cursor.editLength++;

            if (w.span.className === 'eCM') {
                EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);
            }

            // NOT start of file, remove the line ending and join the lines

            if (cursor.indexLine - EDITOR_virtualLineIndex < EDITOR_textElement.children.length &&
                cursor.indexLine - EDITOR_virtualLineIndex >= 0 &&
                cursor.indexLine - EDITOR_virtualLineIndex + 1 < EDITOR_textElement.children.length &&
                cursor.indexLine - EDITOR_virtualLineIndex + 1 >= 0) {
                    
                let keepingDiv = EDITOR_textElement.children[cursor.indexLine - EDITOR_virtualLineIndex];
                let removingDiv = EDITOR_textElement.children[cursor.indexLine - EDITOR_virtualLineIndex + 1];

                let rememberRemovingDivLength = removingDiv.children.length;
                for (var i = 0; i < rememberRemovingDivLength; i++) {
                    if (removingDiv.children[0].innerText.length > 0) {
                        keepingDiv.appendChild(removingDiv.children[0]);
                    }
                    else {
                        removingDiv.removeChild(removingDiv.children[0]);
                    }
                }

                // TODO: This is NOT an optimal solution to removing the empty span after joining the lines
                if (keepingDiv.children.length > 1 && keepingDiv.children[0].innerText.length === 0) {
                    keepingDiv.removeChild(keepingDiv.children[0]);
                }
    
                EDITOR_textElement.removeChild(removingDiv);
            }
            EDITOR_lineEndPositionList.data[cursor.indexLine] = EDITOR_lineEndPositionList.data[cursor.indexLine + 1];
            EDITOR_lineEndPositionList.removeAt(cursor.indexLine + 1, 1);

            EDITOR_REMOVE_line_drawGutter(1);
        }
        else {
            // Start of file
            // nothing?
        }
    }
    else {
        let remaining = 1;

        if (event.ctrlKey) {
            // cursor.editPosition is intended to be equal due to the batch requirements / a new edit would also be equal.
            let tempColumnIndex = cursor.indexColumn;
            let tempPosition = cursor.editPosition;

            let originalCharacterKind = EDITOR_getCharacterCurrent_KIND(tempColumnIndex, tempPosition, line);
            
            tempColumnIndex++;
            tempPosition++;
            
            while (cursor.indexColumn < lastValidIndexColumn) {
                if (EDITOR_getCharacterCurrent_KIND(tempColumnIndex, tempPosition, line) !== originalCharacterKind) {
                    break;
                }
                tempColumnIndex++;
                tempPosition++;
                remaining++;
            }
        }

        if (!w.span|| !w.span.innerText || w.indexColumn_SpanTextContentRelative < 0) {
            cursor.editLength += remaining;
        }
        else {
            // TODO: The shared "remove" method would likely look something like this 'while (remaining ...)' logic...
            // ...and also have to include the line ending removal logic
            while (remaining > 0) {
                let available = w.span.innerText.length - w.indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;
    
                // When the cursor is at the end of a span, there is no text to delete, because the text starts in the next span.
                if (count > 0) {
                    // this is probably wrong
                    w.span.innerText = w.span.innerText.slice(0, w.indexColumn_SpanTextContentRelative) + w.span.innerText.slice(w.indexColumn_SpanTextContentRelative + count);
                    cursor.editLength += count;
                }

                if (w.div.children.length > 1 && w.span.innerText.length === 0) {
                    w.div.removeChild(w.span);
                }
                else {
                    w.indexSpan++;
                }
    
                if (remaining > 0) {
                    if (w.indexSpan >= w.div.children.length) return;
                    
                    w.span = w.div.children[w.indexSpan];
                    w.indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }
}

// TODO: probably should make a function to "remove" text and have 'deleteDo' and 'backspaceDo' invoke it.
// TODO: decide whether an empty line should contain a single empty span. Or if the div that represents the line would just have no child elements.
/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} event 
 * @returns 
 */
function EDITOR_backspaceDo(cursor, event) {
    if (cursor.hasSelection()) {
        EDITOR_removeSelection(cursor);
        return;
    }

    let w = walkLineUntilColumnIndex(cursor);
    
    if (w.indexColumn_Goal == 0) {
        if (cursor.indexLine > 0) {
            let rememberLineIndex = cursor.indexLine;

            // TODO: multicursor bugs are more likely to occur with this logic:
            // wrap to previous line
            cursor.indexLine--;
            cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
            cursor.editPosition--;
            cursor.editLength++;

            if (w.span.className === 'eCM') {
                EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);
            }

            if (rememberLineIndex - EDITOR_virtualLineIndex - 1 < EDITOR_textElement.children.length &&
                rememberLineIndex - EDITOR_virtualLineIndex - 1 >= 0 &&
                rememberLineIndex - EDITOR_virtualLineIndex < EDITOR_textElement.children.length &&
                rememberLineIndex - EDITOR_virtualLineIndex >= 0) {

                // NOT start of file, backspace the line ending and join the lines
                let keepingDiv = EDITOR_textElement.children[rememberLineIndex - EDITOR_virtualLineIndex - 1];
                let removingDiv = EDITOR_textElement.children[rememberLineIndex - EDITOR_virtualLineIndex];

                let rememberRemovingDivLength = removingDiv.children.length;
                for (var i = 0; i < rememberRemovingDivLength; i++) {
                    if (removingDiv.children[0].innerText.length > 0) {
                        keepingDiv.appendChild(removingDiv.children[0]);
                    }
                    else {
                        removingDiv.removeChild(removingDiv.children[0]);
                    }
                }

                // TODO: This is NOT an optimal solution to removing the empty span after joining the lines
                if (keepingDiv.children.length > 1 && keepingDiv.children[0].innerText.length === 0) {
                    keepingDiv.removeChild(keepingDiv.children[0]);
                }

                EDITOR_textElement.removeChild(removingDiv);
            }
            
            EDITOR_lineEndPositionList.data[rememberLineIndex - 1] = EDITOR_lineEndPositionList.data[rememberLineIndex];
            EDITOR_lineEndPositionList.removeAt(rememberLineIndex, 1);

            EDITOR_REMOVE_line_drawGutter(1);
        }
        else {
            // Start of file
            // nothing?
        }
    }
    else {
        let remaining = 1;

        if (event.ctrlKey) {
            // cursor.editPosition is intended to be equal due to the batch requirements / a new edit would also be equal.
            let originalCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, cursor.editPosition);
            cursor.indexColumn--;
            cursor.editPosition--;
            //cursor.editIndexLine--;
            cursor.editIndexColumn--;

            while (cursor.indexColumn > 0) {
                if (EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, cursor.editPosition) !== originalCharacterKind) {
                    break;
                }
                cursor.indexColumn--;
                cursor.editPosition--;
                //cursor.editIndexLine--;
                cursor.editIndexColumn--;
                remaining++;
            }
        }
        else {
            cursor.indexColumn -= 1;
            cursor.editPosition -= 1;
            //cursor.editIndexLine -= 1;
            cursor.editIndexColumn -= 1;
        }

        if (!w.span || !w.span.innerText || w.indexColumn_SpanTextContentRelative < 0) {
            cursor.editLength += remaining;
        }
        else {
            // TODO: The shared "remove" method would likely look something like this 'while (remaining ...)' logic...
            // ...and also have to include the line ending removal logic
            while (remaining > 0) {
                let count = remaining > w.indexColumn_SpanTextContentRelative ? w.indexColumn_SpanTextContentRelative : remaining;
                remaining -= count;
    
                // this is probably wrong
                w.span.innerText = w.span.innerText.slice(0, w.indexColumn_SpanTextContentRelative - count) + w.span.innerText.slice(w.indexColumn_SpanTextContentRelative);
    
                cursor.editLength += count;

                if (w.div.children.length > 1 && w.span.innerText.length === 0) {
                    w.div.removeChild(w.span);
                }
                
                w.indexSpan--;
    
                if (remaining > 0) {
                    if (w.indexSpan < 0) return;
    
                    w.span = w.div.children[w.indexSpan];
                    w.indexColumn_SpanTextContentRelative = w.span.innerText.length;
                }
            }
        }
    }
}

function EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor) {
    // binary search for 'if (EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > positionIndex)'
    let indexTrackedSyntax = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(cursor.indexLine);
    if (indexTrackedSyntax === NaN || indexTrackedSyntax === -1) {
        indexTrackedSyntax = EDITOR_trackedSyntaxList.count_abstract;
    }
    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
        EDITOR_trackedSyntaxList.getElementAt(EDITOR_pooledTrackedSyntax, indexTrackedSyntax);
        if (EDITOR_pooledTrackedSyntax.start < cursor.editPosition) {
            let moreThanOneLineEndPositionIsEncompassed = false;

            // TODO: This has no reason to be a for loop
            for (let i = cursor.indexLine - 1; i >= 0; i--) {
                let lineEndPosition = EDITOR_lineEndPositionList.data[i];
                if (EDITOR_pooledTrackedSyntax.start < lineEndPosition &&
                    EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > lineEndPosition) {
                        moreThanOneLineEndPositionIsEncompassed = true;
                        break;
                }
                else {
                    break;
                }
            }
            
            if (!moreThanOneLineEndPositionIsEncompassed) {
                // TODO: This has no reason to be a for loop
                for (let i = cursor.indexLine + 1; i < EDITOR_lineEndPositionList.count; i++) {
                    let lineEndPosition = EDITOR_lineEndPositionList.data[i];
                    if (EDITOR_pooledTrackedSyntax.start < lineEndPosition &&
                        EDITOR_pooledTrackedSyntax.start + EDITOR_pooledTrackedSyntax.length > lineEndPosition) {
                            moreThanOneLineEndPositionIsEncompassed = true;
                            break;
                    }
                    else {
                        break;
                    }
                }

                if (!moreThanOneLineEndPositionIsEncompassed) {
                    EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);
                }
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_scrollCursorIntoView(cursor) {
    let scrollX = 0;
    let scrollY = 0;

    if (cursor.cursorTopValue < EDITOR_baseElement.scrollTop) {
        scrollY = cursor.cursorTopValue - EDITOR_baseElement.scrollTop;
    }
    else if (cursor.cursorTopValue >= EDITOR_baseElement.scrollTop + EDITOR_baseElement.offsetHeight) {
        // I want to use clientHeight but I don't have any logic for no scrollbar thus single page fitting text might bug out and trigger
        // scrollBy over and over.

        // make the bottom touch then add lineHeight is probably the algorithm to get a perfect fill maybe do lineHeight * 2 skip an event when spamming arrowDown?
        let currentBottom = EDITOR_baseElement.scrollTop + EDITOR_baseElement.offsetHeight;
        let changeToMakeBottomTouch = cursor.cursorTopValue - currentBottom;
        scrollY = changeToMakeBottomTouch + (2 * EDITOR_lineHeight);
    }

    if (cursor.cursorLeftValue < EDITOR_baseElement.scrollLeft) {
        scrollX = cursor.cursorLeftValue - EDITOR_baseElement.scrollLeft;
    }
    else if (cursor.cursorLeftValue >= EDITOR_baseElement.scrollLeft + EDITOR_baseElement.offsetWidth) {
        // I want to use clientWidth but I don't have any logic for no scrollbar thus single page fitting text might bug out and trigger
        // scrollBy over and over.

        // make the right touch then add characterWidth is probably the algorithm to get a perfect fill maybe do characterWidth * 2 skip an event when spamming arrowRight?
        let currentRight = EDITOR_baseElement.scrollLeft + EDITOR_baseElement.offsetWidth;
        let changeToMakeRightTouch = cursor.cursorLeftValue - currentRight;
        scrollX = changeToMakeRightTouch + (4 * EDITOR_characterWidth);
    }

    EDITOR_baseElement.scrollBy(scrollX, scrollY);
}

// TODO: Bug only 1 character selected when punctuation then letterOrDigit click between them the letterOrDigit is more than 1 contiguous only 1 selected.

function EDITOR_getCharacterKind(character) {
    switch (character) {
        case 'a':
        case 'b':
        case 'c':
        case 'd':
        case 'e':
        case 'f':
        case 'g':
        case 'h':
        case 'i':
        case 'j':
        case 'k':
        case 'l':
        case 'm':
        case 'n':
        case 'o':
        case 'p':
        case 'q':
        case 'r':
        case 's':
        case 't':
        case 'u':
        case 'v':
        case 'w':
        case 'x':
        case 'y':
        case 'z':
        case 'A':
        case 'B':
        case 'C':
        case 'D':
        case 'E':
        case 'F':
        case 'G':
        case 'H':
        case 'I':
        case 'J':
        case 'K':
        case 'L':
        case 'M':
        case 'N':
        case 'O':
        case 'P':
        case 'Q':
        case 'R':
        case 'S':
        case 'T':
        case 'U':
        case 'V':
        case 'W':
        case 'X':
        case 'Y':
        case 'Z':
        case '_':
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
            return CharacterKind.LetterOrDigit;
        case ' ':
        case '\t':
        case '\r':
        case '\n':
            return CharacterKind.Whitespace;
        default:
            return CharacterKind.Punctuation;
    }
}

/**
 * Do not change the order/values of these, they are used in equality comparisons, the larger the number says when double clicking between a character and a punctuation
 * whoever has larger number gets selected then the selection continues while the same kind is being read.
 */
const CharacterKind = {
    None: 0,
    Whitespace: 1,
    Punctuation: 2,
    LetterOrDigit: 3,
}

async function EDITOR_MenuOnClick(indexClicked, elementClicked) {
    const commandKind = elementClicked.dataset.commandKind;

    switch (commandKind) {
        case CommandKind.Cut:
            EDITOR_finalizeAllCursors();
            await EDITOR_copySelection(EDITOR_primaryCursor);
            EDITOR_removeSelection(EDITOR_primaryCursor);
            EDITOR_drawCursor(EDITOR_primaryCursor);
            break;
        case CommandKind.Copy:
            EDITOR_finalizeAllCursors();
            await EDITOR_copySelection(EDITOR_primaryCursor);
            break;
        case CommandKind.Paste:
            EDITOR_finalizeAllCursors();
            let clipboard = await window.myAPI.readClipboard();
            EDITOR_paste(EDITOR_primaryCursor, clipboard);
            EDITOR_drawCursor(EDITOR_primaryCursor);
            break;
        case CommandKind.Find:
            EDITOR_findOverlay_showSetter(!EDITOR_findOverlay_show);
            break;
    }
}

/**
 * This clears the cursor's selection.
 */
function EDITOR_moveCursor_position(intValue) {
    let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(intValue);
    EDITOR_moveCursor_lineIndex_columnIndex(lineAndColumnIndices.indexLine, lineAndColumnIndices.indexColumn);
}

/**
 * This clears the cursor's selection.
 */
function EDITOR_moveCursor_lineIndex_columnIndex(indexLine, indexColumn) {
    let lastValidColumnIndex = EDITOR_getLastValidIndexColumn(indexLine);

    if (indexColumn > lastValidColumnIndex) {
        EDITOR_primaryCursor.indexColumn = lastValidColumnIndex;
    }
    else {
        EDITOR_primaryCursor.indexColumn = indexColumn;
    }

    EDITOR_primaryCursor.indexLine = indexLine;
    
    // TODO: selectionAnchor = selectionEnd; EDITOR_drawCursor(cursor); # being the way to clear a selection should be documented / wrapped by a method for ease of use / readability?
    EDITOR_primaryCursor.selectionAnchor = EDITOR_primaryCursor.selectionEnd;
    EDITOR_drawCursor(EDITOR_primaryCursor);
}

let EDITOR_decode_pooled_stringBuilder_array = [];

/**
 * Tabs are stored as '\t\0\0\0', all line feeds converted to '\n'.
 * 
 * Raw is in reference to the raw storage of the text editor and the string will include '\t\0\0\0', and all line feeds as '\n'. These will be returned in that exact way they are being stored.
 * 
 * @returns {string}
 */
function EDITOR_decode_raw(start, length) {
	// Something to consider would be whether TextDecoder has an understanding of special cases for very long strings in order to optimize things.
	// Cause I'm probably going to do the same algorithm for every length of string to start. But maybe for long strings you're supposed to do some other algorithm etc...
	// And then, for the way I'm gonna do it I wanna just be sure to support the characters that I type mostly.
	// And then everything else can fallback to a character by character TextDecoder invocation for the time being.
	// And then I'll ensure that for my use cases that I 99.999% of the time never hit that default case that does a decode with TextDecoder on a single character.
	//
	// I want this code to firstly be used in the code that draws text.
	// And futhermore this code will use EDITOR_t
	// hang on I don't have autocomplete implemented I need to figure out what I named this thing.
	// EDITOR_textByteList
	//
	// I don't know, if I'm using this should I be passing it in, should I be making a local variable, all in all I don't know.
	
	// I don't want to do this at the end of the function because it would require me to locally capture the reference to the end result string.
	// This is single threaded, this should be fine.
	//
	// This unfortunately means you have every "string-character" sitting in the array
	// How do you go about making a string without these allocations sitting around.
	// But perhaps since they're just characters that all the character-strings are interned?
	//
	// TODO: If you have a sufficiently large enough case, you might want to clear out the entries rather than length = 0?
	//
	EDITOR_decode_pooled_stringBuilder_array.length = 0;

    //let length = end - start;
    let end = start + length;
	
	let bytes = EDITOR_textByteList.bytes;
	//let count = EDITOR_textByteList.count;
	
	//if (offset + length > EDITOR_textByteList.count) {
	//	length = EDITOR_textByteList.count - offset;
	//}
	if (length <= 0) {
		return '';
	}
	
	//let upperLimit = offset + length;
	
	// TODO: If you hit the decoder default case, you should probably decode the entire thing that point...
	// ...and TODO: including that in the array with length = 0 would probably be more issue than the possibly interned string-characters something to consider.
	
	for (let i = start; i < end; i++) {
		switch (bytes[i]) {
			case 0: // NUL
				EDITOR_decode_pooled_stringBuilder_array.push('\0');
				break;
			//case 1: // SOH
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 2: // STX
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 3: // ETX
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 4: // EOT
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 5: // ENQ
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 6: // ACK
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 7: // BEL
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 8: // BS
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			case 9: // TAB
				EDITOR_decode_pooled_stringBuilder_array.push('\t');
				break;
			case 10: // LF
				EDITOR_decode_pooled_stringBuilder_array.push('\n');
				break;
			//case 11: // VT
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 12: // FF
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 13: // CR
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 14: // SO
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 15: // SI
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 16: // DLE
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 17: // DC1
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 18: // DC2
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 19: // DC3
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 20: // DC4
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 21: // NAK
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 22: // SYN
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 23: // ETB
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 24: // CAN
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 25: // EM
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 26: // SUB
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 27: // ESC
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 28: // FS
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 29: // GS
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 30: // RS
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 31: // US
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
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
			//case 127: // DEL
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 128:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 129:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 130:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 131:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 132:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 133:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 134:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 135:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 136:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 137:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 138:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 139:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 140:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 141:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 142:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 143:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 144:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 145:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 146:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 147:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 148:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 149:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 150:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 151:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 152:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 153:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 154:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 155:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 156:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 157:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 158:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 159:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 160:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 161:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 162:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 163:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 164:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 165:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 166:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 167:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 168:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 169:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 170:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 171:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 172:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 173:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 174:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 175:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 176:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 177:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 178:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 179:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 180:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 181:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 182:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 183:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 184:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 185:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 186:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 187:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 188:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 189:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 190:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 191:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 192:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 193:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 194:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 195:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 196:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 197:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 198:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 199:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 200:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 201:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 202:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 203:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 204:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 205:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 206:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 207:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 208:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 209:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 210:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 211:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 212:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 213:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 214:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 215:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 216:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 217:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 218:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 219:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 220:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 221:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 222:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 223:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 224:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 225:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 226:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 227:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 228:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 229:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 230:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 231:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 232:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 233:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 234:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 235:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 236:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 237:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 238:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 239:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 240:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 241:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 242:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 243:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 244:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 245:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 246:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 247:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 248:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 249:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 250:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 251:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 252:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 253:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 254:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			//case 255:
			//	EDITOR_decode_pooled_stringBuilder_array.push('\0');
			//	break;
			default:
				EDITOR_decode_pooled_stringBuilder_array.push(
					EDITOR_decoder.decode(bytes.subarray(i, i + 1)));
				break;
		}
	}
	
	
	return EDITOR_decode_pooled_stringBuilder_array.join('');
}

/**
 * Tabs are stored as '\t\0\0\0', all line feeds converted to '\n'.
 * 
 * textonly is in reference to conversion of the raw storage of the text editor such that a tab of '\t\0\0\0' is returned as just '\t', and all line feeds as EDITOR_lineEndString
 * 
 * @returns {string}
 */
function EDITOR_decode_textonly(start, length) {

    if (!EDITOR_lineEndString)
        EDITOR_lineEndString = '\n';

	EDITOR_decode_pooled_stringBuilder_array.length = 0;

    let end = start + length;
	
	let bytes = EDITOR_textByteList.bytes;
	
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

function EDITOR_decode_experimental_gapBuffer(gapBuffer, start, length) {
	EDITOR_decode_pooled_stringBuilder_array.length = 0;

    let end = start + length;
	if (length <= 0) {
		return '';
	}
	
	for (let i = start; i < end; i++) {
		switch (gapBuffer[i]) {
			case 0: // NUL
				EDITOR_decode_pooled_stringBuilder_array.push('\0');
				break;
			case 9: // TAB
				EDITOR_decode_pooled_stringBuilder_array.push('\t');
				break;
			case 10: // LF
				EDITOR_decode_pooled_stringBuilder_array.push('\n');
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
					EDITOR_decoder.decode(gapBuffer.subarray(i, i + 1)));
				break;
		}
	}
	
	
	return EDITOR_decode_pooled_stringBuilder_array.join('');
}

// TODO: Probably shouldn't duplicate this throttle code, it is in 'menu.js' too.
//
// Google AI overview for "javascript throttle trailing edge" generated this code:
function EDITOR_throttle_mouseMove(func, wait, options = { leading: false, trailing: true }) {
    let timer = null;
    let lastArgs;
    let context;

    EDITOR_restoreThrottle_mouseMove = () => {
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

// TODO: Probably shouldn't duplicate this throttle code, it is in 'menu.js' too.
//
// Google AI overview for "javascript throttle trailing edge" generated this code:
function EDITOR_throttle_scroll(func, wait, options = { leading: false, trailing: true }) {
    let timer = null;
    let lastArgs;
    let context;

    EDITOR_restoreThrottle_scroll = () => {
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

// TODO: Probably shouldn't duplicate this throttle code, it is in 'menu.js' too.
//
// Google AI overview for "javascript throttle trailing edge" generated this code:
function EDITOR_throttle_resize(func, wait, options = { leading: false, trailing: true }) {
    let timer = null;
    let lastArgs;
    let context;

    EDITOR_restoreThrottle_resize = () => {
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
