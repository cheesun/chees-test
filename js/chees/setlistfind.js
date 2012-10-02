goog.provide('chees.tick.SetlistFind');

goog.require('chees.Dompling');
goog.require('chees.tick.Task');
goog.require('chees.tick.tools');

goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');

goog.require('goog.events');
goog.require('goog.ui.Popup');
goog.require('goog.ui.PopupBase.EventType');
goog.require('goog.positioning.AnchoredViewportPosition');
goog.require('goog.positioning.Corner');
goog.require('goog.math.Box');
goog.require('goog.fx.dom.FadeInAndShow');
goog.require('goog.fx.dom.FadeOutAndHide');

/** @constructor */
chees.tick.SetlistFind = function (list) { //button,taskEntry,taskEntryText,list) {
    //this.button = button;
    //this.taskEntry = taskEntry;
    //this.taskEntryText = taskEntryText;
    this.list = list;
    
    this.dialogTemplate = new chees.Dompling('template_finddialog');
    this.dialogDom = this.dialogTemplate.steam('root');
    
    this.resultTemplate = new chees.Dompling('template_finditem');

    // preview popup
    this.previewTemplate = new chees.Dompling('template_findpreview');
    this.previewDom = this.previewTemplate.steam('root');
    document.getElementById('overlay').appendChild(this.previewDom['root']);
    this.previewPopup = new goog.ui.Popup(this.previewDom['root']);  
    this.previewPopup.setVisible(false);  
    this.previewPopup.setAutoHide(true);
    this.previewPopup.setPinnedCorner(goog.positioning.Corner.TOP_LEFT);    
    this.previewPopup.setHideOnEscape(true);

    // current state
    this.results = [];
    this.currentSelection = null;
    this.lastAdded = null;

    // setlist cache
    // id -> { 'list' : {...} , 'tasks' : [...] }
    this.setlistCache = {};

    // events
    var self = this;
    goog.events.listen(
        window, 
        goog.events.EventType.RESIZE, 
        function (e) { if (self.previewPopup.isVisible()) self.previewPopup.reposition(); }
    );             
    
    this.initKeyboard();
}

chees.tick.SetlistFind.prototype.select = function (target) {
    this.previewPopup.setVisible(false);
    if (this.currentSelection != null) 
        goog.dom.classes.remove(
            this.results[this.currentSelection][0].root,
            'findItemSelected'            
            );
    if (target == 'down') {
        if (this.currentSelection == null) this.currentSelection = 0
        else this.currentSelection = (this.currentSelection + 1) % this.results.length;
    }
    else if (target == 'up') {
        if (this.currentSelection == null) this.currentSelection = this.results.length-1;
        else this.currentSelection = Math.abs((this.currentSelection - 1) % this.results.length);        
    }
    else {
        var f = function (element,index,array) {
            return goog.array.equals(element,target);
        }
        var newSelection = goog.array.findIndex(this.results,f);
        if (newSelection >= 0) this.currentSelection = newSelection;
    }
    goog.dom.classes.add(
        this.results[this.currentSelection][0].root,
        'findItemSelected'        
        );            
}

chees.tick.SetlistFind.prototype.initKeyboard = function () {
    this.keyHandler = new goog.events.KeyHandler(this.dialogDom['root'], true);

    var self = this;

    function movementKeyHandler(e) {
        var stopBubble = true;
        var keyCode = e.keyCode;
       
        if      (keyCode == goog.events.KeyCodes.UP) self.select('up');
        else if (keyCode == goog.events.KeyCodes.DOWN) self.select('down');
        else if (keyCode == goog.events.KeyCodes.LEFT) {
            self.previewPopup.setVisible(false);
        }
        else if (keyCode == goog.events.KeyCodes.RIGHT) {
            var current = self.results[self.currentSelection];
            self.showPreview(current[0],current[1]);
        }
        else if (keyCode == goog.events.KeyCodes.ENTER) self.insertSetlist(self.results[self.currentSelection][1]);
        else if (keyCode == goog.events.KeyCodes.ESC) {
            if (self.currentSelection.focused) self.list.selectTask(self.currentSelection);
            else self.currentSelection.focus();                    
        }
        else stopBubble = false;

        if (stopBubble) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
    goog.events.listen(this.keyHandler,goog.events.KeyHandler.EventType.KEY,movementKeyHandler,true);  
}

chees.tick.SetlistFind.prototype.hideDialog = function () {
    this.currentSelection = null;
    this.previewPopup.setVisible(false);
    if (this.dialogDom['root'].parentNode) this.dialogDom['root'].parentNode.removeChild(this.dialogDom['root']);
}

/*chees.tick.SetlistFind.prototype.toggleDialog = function () {
    if (!this.popup.isVisible()) {
        if(this.search())   
            this.popup.setVisible(true); 
        else {
            var self = this;
            goog.events.listenOnce(
                this.button,
                goog.events.EventType.CLICK,
                function (e) {        
                    self.toggleDialog(); 
                    }
            );
        }
    }
    else {
        this.popup.setVisible(false);
    }
}*/

chees.tick.SetlistFind.prototype.setlistToList = function(setlist) {
    var list = document.createElement('UL');
    var lists = {};
    lists[null] = list;
    for (var i in setlist) {
        var current = setlist[i];
        var new_element = document.createElement('LI');
        new_element.appendChild(document.createTextNode(current.text));
        var new_list = document.createElement('UL');
        new_element.appendChild(new_list);
        lists[current.id] = new_list;
        lists[current.parent].appendChild(new_element);        
    }
    return list;
}

chees.tick.SetlistFind.prototype.loadSetlist = function (id,funct) {
    if (id in this.setlistCache) {
        if (funct)
            return funct();
    } else {
        var self = this;
        goog.net.XhrIo.send(
            '/tick/api/setlistload?id=' + id,
            function(e){
                if (e.target.getStatus() == 200) 
                    self.setlistCache[id] = goog.json.parse(e.target.getResponseText());
                if (funct)
                    return funct(self.setlistCache[id]);               
            }
        );             
    }
}



chees.tick.SetlistFind.prototype.insertSetlist = function (id,reset) {
    var self = this;
    this.loadSetlist(
        id,
        function () {
            if (id in self.setlistCache) {
                var addedTasks = {};
                addedTasks[null] = self.list.currentSelection; // remember the parent as well
                var tasks = self.setlistCache[id]['tasks'];
                var toplevel = [];
                for (var i in tasks) {
                    var current = tasks[i];    
                    addedTasks[current['id']] = self.list.newTask(current['text']);
                    addedTasks[current['id']].setNotes(current['notes'],true);
                    if (current['parent'] != null) addedTasks[current['id']].insertBelow(addedTasks[current['parent']]);
                    else toplevel.push(addedTasks[current['id']]);
                }
                // do top level tasks last so that building subtasks is fast (no dom manipulation)
                for (var i in toplevel) toplevel[i].insertBelow(addedTasks[null]);
                self.previewPopup.setVisible(false);
                self.hideDialog();
                self.lastAdded = addedTasks;
                self.lastAddedId = id;
            } else {
                chees.tick.GlobalNotify.publish('unable to load setlist','bad');
            }
            if (reset) self.reset();
        }
    )
}

chees.tick.SetlistFind.prototype.removeLastAdded = function () {
    if (this.lastAdded == null) return;
    for (var i in this.lastAdded) {
        if (i == 'null') continue;
        this.lastAdded[i].del();
    }
}

chees.tick.SetlistFind.prototype.confirmUsage = function () {
    if (this.lastAdded == null) return false;
    var data = {'id':this.lastAddedId,'ticklist_id':this.list.id};
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);        
    goog.net.XhrIo.send(
        '/tick/api/setlistuse',
        function(e){
            if (e.target.getStatus() != 200) 
               chees.tick.GlobalNotify.publish(e.target.getResponseText(),'bad');
        },
        'POST',
        String(querydata)        
    );  
    return true;
}

chees.tick.SetlistFind.prototype.showPreview = function (previewItem,id) {
    this.previewDom['description'].innerHTML = 'loading...';
    var self = this;
    this.loadSetlist(
        id,
        function () {
            if (id in self.setlistCache) {
                self.previewDom['list'].innerHTML = '';
                self.previewDom['list'].appendChild(self.setlistToList(self.setlistCache[id]['tasks']));
                self.previewDom['description'].innerHTML = '';
                self.previewDom['description'].innerHTML = self.setlistCache[id]['list']['description'];
            }
            else {
                self.previewDom['description'].innerHTML = 'unable to load setlist';
            }
        }
    );
    
    var finddialog = this.dialogDom['root'];
    var popupPosition = new goog.positioning.AnchoredViewportPosition(finddialog,goog.positioning.Corner.TOP_RIGHT);
    this.previewPopup.setPosition(popupPosition);
    this.previewPopup.setVisible(true);

    goog.events.listenOnce(
        this.previewPopup,
        goog.ui.PopupBase.EventType.BEFORE_HIDE,
        function (e) { 
            goog.dom.classes.remove(finddialog,'findDialogShowingPreview');
            setTimeout(
                function () {
                    goog.events.listenOnce(
                        previewItem.root,
                        goog.events.EventType.CLICK,
                        function (e) { 
                            self.select([previewItem,id]);
                            self.showPreview(previewItem,id);
                        }
                    );          
                },
                goog.ui.PopupBase.DEBOUNCE_DELAY_MS);            
        }
    );
    
    goog.dom.classes.add(this.dialogDom['root'],'findDialogShowingPreview');
}

chees.tick.SetlistFind.prototype.addResult = function (result) {
    var newItem = this.resultTemplate.steam('root',result); //{'title':' '+title,'id':id});
    this.dialogDom['contents'].appendChild(newItem.root);    
    this.results.push([newItem,result['id']]);
    var self = this;
    goog.events.listen(
        newItem['findItemAdd'],
        goog.events.EventType.CLICK,
        function (e) { 
            e.stopPropagation();
            self.insertSetlist(result['id']);
            }
    );
    goog.events.listenOnce(
        newItem.root,
        goog.events.EventType.CLICK,
        function (e) { 
            self.select([newItem,result['id']]);        
            self.showPreview(newItem,result['id']);
            }
    );
}

chees.tick.SetlistFind.prototype.callback = function (event,container) {
    container.appendChild(this.dialogDom['root']);
    if (event.target.getStatus() == 200) {
        var text = event.target.getResponseText();
        var returned = goog.json.parse(text);
        var results = returned['results'];
        this.dialogDom['contents'].innerHTML = '';
        this.results = [];
        if (results.length == 0) this.dialogDom['contents'].innerHTML = 'no setlists found';
        for (var i in results) {
            this.addResult(results[i]);
        }
        this.focus();
    } else {
        this.dialogDom['contents'].innerHTML = 'search failed: ' + event.target.getResponseText();
    }
}

chees.tick.SetlistFind.prototype.reset = function () {
    this.hideDialog();
    this.results = [];
    this.currentSelection = null;
    this.lastAdded = null;
    this.lastAddedId = null;
    this.dialogDom['contents'].innerHTML = '';
}

chees.tick.SetlistFind.prototype.direct = function(text,callback) {
    if (text == '') {
        return callback("{'results':[]}");
    }
    var searchQuery = encodeURIComponent(text);
    goog.net.XhrIo.send(
        '/tick/api/setlistfind?q=' + searchQuery,
        callback
    );    
}

chees.tick.SetlistFind.prototype.search = function (text,container) {
    if (text == '') return false;
    var searchQuery = encodeURIComponent(text);
    this.dialogDom['contents'].innerHTML = '';
    this.lastAdded = null;
    var self = this;
    goog.net.XhrIo.send(
        '/tick/api/setlistfind?q=' + searchQuery,
        function(e){return self.callback(e,container)}
    );    
    return true;
}

chees.tick.SetlistFind.prototype.focus = function () {
    this.dialogDom['contents'].focus();
}

