goog.provide('chees.tick.Notes');
goog.require('chees.tick.tools');

goog.require('goog.dom.classes');
goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');

goog.require('goog.events');

goog.require('goog.ui.Textarea');

/** @constructor */
chees.tick.Notes = function (task) {
    this.task = task;
    
    this.prompt = 'click here to add notes...';
    this.notetext = '';
    this.textarea = this.task.dom['noteControl'];
    this.container = this.task.dom['noteContainer'];


    this.textdisplay = this.task.dom['noteDisplay'];
    //this.editor = this.task.dom['noteEditor'];
    goog.dom.classes.remove(this.textdisplay,'hidden');
    goog.dom.classes.add(this.textarea,'hidden');
    
    // events
    var self = this;

    goog.events.listen(
        this.textarea,
        [goog.events.EventType.INPUT,goog.events.EventType.PROPERTYCHANGE],
        function (e) { self.resize() }
    );
    
    /* goog.events.listen(
        this.textarea,
        goog.events.EventType.FOCUS,
        function (e) { 
            self.task.taskList.selectTask(self.task,false,true);
            self.textarea.value = self.notetext; 
            self.resize(); 
        }
    ); */

    goog.events.listen(
        this.textdisplay,
        goog.events.EventType.CLICK,
        function (e) { 
            self.task.taskList.selectTask(self.task,false,true);
            self.editMode();
        }
    ); 

    goog.events.listen(
        this.textarea,
        goog.events.EventType.BLUR,
        function (e) { self.setNotes(self.textarea.value); self.displayMode(); }
    );
}

chees.tick.Notes.prototype.cancelChange = function () {
    this.setNotes(this.notetext,true);
}

chees.tick.Notes.prototype.displayMode = function () {
    goog.dom.classes.remove(this.textdisplay,'hidden');
    goog.dom.classes.add(this.textarea,'hidden');
}

chees.tick.Notes.prototype.editMode = function () {
    goog.dom.classes.add(this.textdisplay,'hidden');
    goog.dom.classes.remove(this.textarea,'hidden');
    this.textarea.value = this.notetext;
    this.resize();
    this.textarea.focus();
}

chees.tick.Notes.prototype.resize = function (value) {
    this.textarea.style.height = '';    
    var padding = goog.style.getPaddingBox(this.textarea);
    var adjustment = padding.top + padding.bottom;
    if (value == undefined) this.textarea.style.height = (this.textarea.scrollHeight - adjustment) + "px";
    else this.textarea.style.height = value + "px";
}

chees.tick.Notes.prototype.getNotes = function () {
    return this.notetext;
}

chees.tick.Notes.prototype.setNotes = function (newNote,noReport) {
    if (newNote == null) newNote = '';
    this.notetext = newNote;
    if (this.notetext == '') {
        this.textdisplay.innerHTML = chees.tick.tools.augmentLinks(chees.tick.tools.escapeHTML(this.prompt));
        goog.dom.classes.add(this.textarea,'empty');
        goog.dom.classes.add(this.textdisplay,'empty');
    }
    else {
        this.textarea.value = this.notetext;
        this.textdisplay.innerHTML = chees.tick.tools.augmentLinks(chees.tick.tools.escapeHTML(this.notetext));
        goog.dom.classes.remove(this.textarea,'empty');
        goog.dom.classes.remove(this.textdisplay,'empty');
        }
    if(!noReport) {
        this.task.reportChange();   
    }    
}
