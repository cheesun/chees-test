goog.provide('chees.tick.SetlistSave');

goog.require('chees.Dompling');
goog.require('chees.tick.Task');
goog.require('chees.tick.Dialog');

goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');
goog.require('goog.events');

/** @constructor */
chees.tick.SetlistSave = function (button,list) {
    this.list = list;
    
    this.button = button;
    this.button.style.display = 'block';
    
    this.dialog = new chees.tick.Dialog(this.button,'template_setlistdialog');
    this.dialog.dom['saveButton'].disabled = true;

    this.previewHidden = true;
    this.validateInputs(this.getData());
    
    var self = this;
    goog.events.listen(
        this.dialog.dom['root'],
        [goog.events.EventType.PASTE,goog.events.EventType.CUT],
        function (e) { self.validateInputs(self.getData()); }
    );        
    goog.events.listen(
        this.dialog.dom['setlistSaveDialog'],
        [goog.events.EventType.KEYUP,goog.events.EventType.CLICK],
        function (e) { self.validateInputs(self.getData()); }
    );
    goog.events.listen(
        this.dialog.dom['setlistPreviewHeading'],
        goog.events.EventType.CLICK,
        function (e) { 
            self.previewHidden = !self.previewHidden; 
            self.generatePreview();
        }
    );    
    goog.events.listen(
        this.dialog.dom['setlistUseRadios'],
        [goog.events.EventType.KEYUP,goog.events.EventType.CLICK,goog.events.EventType.CHANGE],
        function (e) {
            if (self.dialog.dom['setlistName'].value.length == 0) {
                var value = '';
                if (self.dialog.dom['useAll'].checked) value = self.list.title;
                else if (self.dialog.dom['useSelection'].checked) value = self.list.currentSelection.text;
                self.dialog.dom['setlistName'].value = value;
                self.dialog.dom['setlistName'].select();
                self.dialog.dom['setlistName'].focus();                
            }
            self.generatePreview();
        }
    );    
    goog.events.listen(
        this.dialog.dom['cancelButton'],
        goog.events.EventType.CLICK,
        function (e) { self.dialog.toggle() }
    );    
   
    goog.events.listen(
        this.dialog.dom['saveButton'],
        goog.events.EventType.CLICK,
        function (e) { self.save() }
    );    

    goog.events.listen(
        this.dialog.dom['clearButton'],
        goog.events.EventType.CLICK,
        function (e) { self.clear() }
    ); 
}

chees.tick.SetlistSave.prototype.pickRadio = function(list) {
    for (var i in list) {
        var current = this.dialog.dom[list[i]];
        if (current.checked) return current.value;
    }
    return null;
}

chees.tick.SetlistSave.prototype.callback = function (event) {
    if (event.target.getStatus() == 200) {
        //alert('save successful: ' + event.target.getResponseText());
        chees.tick.GlobalNotify.publish('Setlist save successful: ' + event.target.getResponseText(),'good');
        this.dialog.hide();
    } else {
        //alert('save failed: ' + event.target.getResponseText());
        chees.tick.GlobalNotify.publish('Setlist save failed: ' + event.target.getResponseText(),'bad');
    }
}

chees.tick.SetlistSave.prototype.validateInputs = function (data) {
    var validated = true;
    for (var i in data) {
        if (!data[i]) {
            goog.dom.classes.remove(this.dialog.dom[i+'Heading'],'validInput');
            goog.dom.classes.add(this.dialog.dom[i+'Heading'],'invalidInput');
            validated = false;
        } else {
            goog.dom.classes.remove(this.dialog.dom[i+'Heading'],'invalidInput');        
            goog.dom.classes.add(this.dialog.dom[i+'Heading'],'validInput');
        }
    }
    this.dialog.dom['saveButton'].disabled = !validated;
    if (!validated) goog.dom.classes.add(this.dialog.dom['saveButton'],'disabledButton');
    else goog.dom.classes.remove(this.dialog.dom['saveButton'],'disabledButton');
    return validated;
}

chees.tick.SetlistSave.prototype.getData = function () {
    var data = {};
    data['setlistName'] = this.dialog.dom['setlistName'].value;
    data['setlistUse'] = this.pickRadio(['useAll','useSelection']);
    data['setlistDescription'] = this.dialog.dom['setlistDescription'].value;
    data ['setlistShare'] = this.pickRadio(['shareSelf','shareEveryone']);
    data ['setlistNotes'] = this.pickRadio(['includeNotes','excludeNotes']);
    return data;
}

chees.tick.SetlistSave.prototype.generatePreview = function () {
    var value = 'please fill in "use" field first';
    if (this.previewHidden) value = 'is hidden, click heading to toggle.';
    else if (this.dialog.dom['useAll'].checked) value = chees.tick.Task.debugPrint(this.list.rootTask);
    else if (this.dialog.dom['useSelection'].checked) value = chees.tick.Task.debugPrint(this.list.currentSelection);    
    this.dialog.dom['setlistPreview'].innerHTML = value;
}

chees.tick.SetlistSave.prototype.save = function () {

    var data = this.getData();
    
    if (!this.validateInputs(data)) {
        //alert ('please fill in all fields');        
        chees.tick.GlobalNotify.publish('please fill in all fields','bad');
        return false;
    }
    
    if (data['setlistUse'] == 'all') data.list = this.list.rootTask.toSimpleList(chees.tick.Task.toSetlist);
    else if (data['setlistUse'] = 'current') {
        data['list'] = this.list.currentSelection.toSimpleList(chees.tick.Task.toSetlist);
        data['list'].shift(); // remove first element
    }
 
    if (data['setlistNotes'] == 'exclude') {
        for (var i in data['list']) {
            data['list'][i][7] = null; // index of 7 corresponds to notes field
        }
    } 
 
    data['list'] = goog.json.serialize(data['list']);

    
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);    
    
    var self = this;
    goog.net.XhrIo.send(
        '/tick/api/setlistsave',
        function(e){return self.callback(e)},
        'POST',
        String(querydata)
    ); 
}

chees.tick.SetlistSave.prototype.clear = function () {
    this.dialog.dom['setlistName'].value = '';
    this.dialog.dom['useAll'].checked = false;
    this.dialog.dom['useSelection'].checked = false;
    this.dialog.dom['setlistDescription'].value = '';
    this.dialog.dom['shareSelf'].checked = false;
    this.dialog.dom['shareFriends'].checked = false;    
    this.dialog.dom['shareEveryone'].checked = false;   
    this.generatePreview();     
}

