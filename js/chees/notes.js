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
    
    // events
    var self = this;

    goog.events.listen(
        this.textarea,
        [goog.events.EventType.INPUT,goog.events.EventType.PROPERTYCHANGE],
        function (e) { self.resize() }
    );
    
    goog.events.listen(
        this.textarea,
        goog.events.EventType.FOCUS,
        function (e) { 
            self.task.taskList.selectTask(self.task,false,true);
            self.textarea.value = self.notetext; 
            self.resize(); 
        }
    );          

    goog.events.listen(
        this.textarea,
        goog.events.EventType.BLUR,
        function (e) { self.setNotes(self.textarea.value); self.resize(16); }
    );      
    
}

chees.tick.Notes.prototype.resize = function (value) {
    //var padding = goog.style.getPaddingBox(this.textarea);
    this.textarea.style.height = ''; 
    if (value == undefined) this.textarea.style.height = this.textarea.scrollHeight + "px";
    else this.textarea.style.height = value + "px";
}

chees.tick.Notes.prototype.getNotes = function () {
    return this.notetext;
}

chees.tick.Notes.prototype.setNotes = function (newNote,noReport) {
    if (newNote == null) newNote = '';
    this.notetext = newNote; //chees.tick.tools.escapeHTML(newNote);
    if (this.notetext == '') {
        this.textarea.value = this.prompt;
        goog.dom.classes.add(this.textarea,'empty');
    }
    else {
        if (this.textarea.value != this.notetext) {
            this.textarea.value = this.notetext;
        }
        goog.dom.classes.remove(this.textarea,'empty');        
        }
    if(!noReport) {
        this.task.reportChange();   
    }    
}
