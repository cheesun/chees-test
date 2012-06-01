goog.provide('chees.tick.List');

goog.require('chees.tick.Task');
goog.require('chees.tick.control');
goog.require('chees.tick.tools');
goog.require('chees.tick.Save');
goog.require('chees.tick.Share');
goog.require('chees.tick.SetlistSave');
goog.require('chees.tick.SetlistFind');

goog.require('goog.events.KeyHandler');
goog.require('goog.events.KeyCodes');
goog.require('goog.events.KeyEvent');
goog.require('goog.events');

goog.require('goog.fx');
goog.require('goog.fx.DragDropItem');
goog.require('goog.fx.DragDropGroup');

goog.require('goog.style');
goog.require('goog.math');

goog.require('goog.dom.classes');
goog.require('goog.dom.DomHelper');

goog.require('goog.json');
goog.require('goog.date');

goog.require('goog.structs.Queue');

goog.require('goog.userAgent');

  

var debug_counter = 0;
function debug (text) {
    var e = goog.dom.getElement('debug');
    e.innerHTML = debug_counter + ': ' + text + '<br>' + e.innerHTML;
    debug_counter ++;
}

/** @constructor */
chees.tick.List = function(element,user_id) {
    // dom
    var d = new chees.Dompling("template_list");  
    this.dom = d.steam("root");

    this.container = goog.dom.getElement(element);
    this.container.appendChild(this.dom['root']);
        
    // list properties
    this.title = '';
    this.id = null;
    
    this.list_type = null;
    
    // list state
    this.nextTaskId = 0;
    
    this.rootTask = new chees.tick.Task(null,null,true);

    // state    
    this.currentSelection = this.rootTask;
    this.dom['rootElement'].appendChild(this.rootTask.dom['root']);
    this.editMode = false;

    
    // permissions
    this.can_edit = false;
    this.user_id = user_id;
    
    // load plugins now that the list is done
    this.saveObject = null; // initialized later, in the loadJSON function
    if (this.user_id) this.setlistSaveObject = new chees.tick.SetlistSave(this.dom['setlistSaveButton'],this); // only allow setlist saving for logged in users
    this.setlistFindObject = new chees.tick.SetlistFind(this);
    this.shareObject = new chees.tick.Share(this.dom['shareButton']); // initialized later, in the loadJSON function

    // set up event handlers
    this.initKeyboard();
    this.initClicks();
    this.initDrag();
    
    // init the rootTask
    this.initTask(this.rootTask);    
}

// static methods

// this makes it so that although the whole task is draggable
// only clicking on the bullet point begins dragging
chees.tick.List.patchDraggable = function (draggable,task) {
    var bullet = task.dom['taskbullet'];
    var li = task.dom['taskbulletli'];
    draggable.getDraggableElement = function(target) {
        if(target != bullet && target != li) return null; 
        return draggable.element; 
        }  
}

// public methods

chees.tick.List.prototype.loadSetlist = function (id) {    
    this.list_type = 'setlist';
    var loadAnimation = new chees.tick.control.Loading(this.rootTask.dom['list'],'20','100');
    loadAnimation.play();
    this.is_setlist = true;
    var self = this;
    this.setlistFindObject.loadSetlist(
        id,
        function (loaded) {
            loadAnimation.stop();
            self.setupList(loaded['list']);
            self.selectTask(self.rootTask);  
            self.setlistFindObject.insertSetlist(id);          
            self.setlistFindObject.reset();
        }    
    );    
}

chees.tick.List.prototype.loadList = function (id) {
    this.list_type = 'ticklist';
    this.is_setlist = false;
    var loadAnimation = new chees.tick.control.Loading(this.rootTask.dom['list'],'20','100');
    loadAnimation.play();

    var self = this;
    function load (event) {
        loadAnimation.stop();
        if (event.target.getStatus() == 200) {
            var obj = goog.json.parse(event.target.getResponseText());
            self.setupList(obj['list']);
            self.setupTasks(obj['tasks']);
            self.dom['rootElement'].focus();
        } else {
            alert('load failed: ' + event.target.getResponseText());
        }
    }
        
    goog.net.XhrIo.send(
        '/tick/api/listload?id='+id,
        function(e){return load(e)},
        'GET'
    );                
}    

chees.tick.List.prototype.setupList = function (list) {
    // set up list attributes
    this.nextTaskId = list['next_task_id'] || 0;
    this.can_edit = ('can_edit' in list) && list['can_edit'];
    this.id = list['id'];
    this.title = list['name'];
    this.rootTask.setText(this.title);
    this.shareObject.init(this.id,this.list_type,'/tick/api/'+this.list_type+'share',list['sharing'],this.can_edit);
    if (this.can_edit && !this.is_setlist) {
        this.saveObject = new chees.tick.Save(this.dom['saveButton']);    
        this.saveObject.id = list['id'];
        this.saveObject.version = list['version'];
    } else {
        goog.dom.removeNode(this.dom['saveWidget']);
    }
}


chees.tick.List.prototype.setupTasks = function (tasks) {
    // prepare the tasks
    var t = {};
    var o = {};
    var q = new goog.structs.Queue();
    var firstTask;
    for (var i in tasks) {
        var task = tasks[i];
        t[task['id']] = task;
        if (task['parent'] == null && task['prev'] == null) {
            q.enqueue(task['id']);
            firstTask = task['id'];
        }
    }
    
    if (firstTask != null) {

        // code to check for and prevent cycles
        var visited = {};        

        // enqueue all top level tasks
        var current = t[firstTask]['next'];
        while (current != null) {
            if (current in visited) { 
                alert('cycle detected! ' + current);
                break;            
            } else {
                visited[current] = true;
                q.enqueue(current);
                current = t[current]['next'];
            }
        }

        var toplevel = [];      
        while (!q.isEmpty()) {
            var task = t[q.dequeue()];
            // create the task
            var newtask = new chees.tick.Task(task['id']);
            newtask.setText(task['text']);
            newtask.setNotes(task['notes'],true);
            o[task['id']] = newtask;
            if (task['parent'] != null) newtask.insertBelow(o[task['parent']]);
            else toplevel.push(newtask); //newtask.insertBelow(this.rootTask);
            newtask.setStatus(task['complete']);        
            this.initTask(newtask);
            // enqueue children
            var current = task['first'];
            while (current != null) {
                if (current in visited) { 
                    alert('cycle detected! ' + current);
                    break;            
                } else {
                    visited[current] = true;            
                    q.enqueue(current);
                    current = t[current]['next'];
                }
            }
        }

        // we put the toplevel tasks into the dom last so that building subtasks is fast        
        for (var i=0; i<toplevel.length; i++) toplevel[i].insertBelow(this.rootTask);
        
    }
    
    // set up save object with initial state from list
    if (this.can_edit && !this.is_setlist) this.saveObject.init(this.generateList());
    
    this.rootTask.focus();
}


chees.tick.List.prototype.initClicks = function () {
    var self = this;          
    goog.events.listen(
        window,
        goog.events.EventType.CLICK,
        function (e) {
            if (self.currentSelection.editing) return;
            self.selectTask(self.rootTask);
            e.stopPropagation(); 
        }
    );       
}

chees.tick.List.prototype.initKeyboard = function () {
    this.keyHandler = new goog.events.KeyHandler(document, true);

    var self = this;

    function movementKeyHandler(e) {   
        var stopBubble = true;
        var keyCode = e.keyCode;
        var globalCaught = true;

        if (e.platformModifierKey) {
            if (keyCode == goog.events.KeyCodes.S && self.can_edit) self.saveObject.save(); 
            else {
                globalCaught = false;          
            }
        } else {
            globalCaught = false;
        }        
        if (!globalCaught) {
            if (self.currentSelection.editing) {
                if (e.platformModifierKey && keyCode == goog.events.KeyCodes.M) self.currentSelection.find();            
                if (keyCode == goog.events.KeyCodes.ESC) { self.currentSelection.revert(); self.currentSelection.focus(); }
                else if (keyCode == goog.events.KeyCodes.ENTER) { self.currentSelection.done(); self.currentSelection.focus(); }
                return;
            } else {      
                if (e.target.nodeName == 'INPUT' || e.target.nodeName == 'TEXTAREA') return;            
                if (e.platformModifierKey) { // control or apple key
                    if      (keyCode == goog.events.KeyCodes.UP) self.currentSelection.moveUp();
                    else if (keyCode == goog.events.KeyCodes.DOWN) self.currentSelection.moveDown();
                    else if (keyCode == goog.events.KeyCodes.LEFT) self.currentSelection.moveLeft();
                    else if (keyCode == goog.events.KeyCodes.RIGHT) self.currentSelection.moveRight();
                    else if (keyCode == goog.events.KeyCodes.ENTER) self.toggleTask();    
                    else if (keyCode == goog.events.KeyCodes.E) self.currentSelection.edit();            
                    else if (keyCode == goog.events.KeyCodes.DELETE) self.deleteTask(); //self.currentSelection.del();                           
                    else stopBubble = false;          
                } else if (e.shiftKey) { // move between sibling tasks
                    if      (keyCode == goog.events.KeyCodes.UP) self.selectPrev();
                    else if (keyCode == goog.events.KeyCodes.DOWN) self.selectNext();
                    else if (keyCode == goog.events.KeyCodes.ENTER) self.createTaskUnder();    
                    else stopBubble = false;
                }
                else { // move to adjacent tasks
                    if      (keyCode == goog.events.KeyCodes.UP) self.selectUp();
                    else if (keyCode == goog.events.KeyCodes.DOWN) self.selectDown();
                    else if (keyCode == goog.events.KeyCodes.LEFT) self.selectLeft();
                    else if (keyCode == goog.events.KeyCodes.RIGHT) self.selectRight();
                    else if (keyCode == goog.events.KeyCodes.ENTER) self.createTaskAfter();
                    else if (keyCode == goog.events.KeyCodes.ESC) {
                        /*if (self.currentSelection.focused) self.selectTask(self.currentSelection);
                        else self.currentSelection.focus(); */
                        self.selectTask(self.rootTask);
                    }
                    else stopBubble = false;
                }
            }
        }
        if (stopBubble) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
    goog.events.listen(this.keyHandler,goog.events.KeyHandler.EventType.KEY,movementKeyHandler);  
}

chees.tick.List.prototype.initDrag = function () {
    this.dropGroup = new goog.fx.DragDropGroup();   
    this.dragGroup = new goog.fx.DragDropGroup();
    
    this.dragGroup.addTarget(this.dropGroup);
    this.dragGroup.setDragClass('dragtask');

    this.dragGroup.init();
    this.dropGroup.init(); 
    
    var self = this;

    // for sources
    function dragStartHandler(e) {
        if(self.currentSelection != e.dragSourceItem.data)
            self.selectTask(e.dragSourceItem.data);
        self.currentSelection.done();
    }

    goog.events.listen(this.dragGroup,'dragstart',dragStartHandler);     

    // for targets
    function isValidTarget(sourceTask,targetTask,position) {
        if (!sourceTask || !targetTask) return false;
        else if (position == 'under' && targetTask.first == sourceTask) return false;
        else if (position == 'after' && targetTask.next == sourceTask) return false;
        else if (sourceTask == targetTask) return false;
        else if (sourceTask.contains(targetTask)) return false;
        return true;
    }
    
    function dropItemHandler(e) {
        var sourceTask = e.dragSourceItem.data;
        var targetTask = e.dropTargetItem.data['task'];    
        var position = e.dropTargetItem.data['pos'];
        if (isValidTarget(sourceTask,targetTask,position)) {
            dragOutHandler(e);
            if (position == 'under') sourceTask.insertFirst(targetTask);
            else if (position == 'after') sourceTask.insertAfter(targetTask);
            self.reportChange();
        }
    }

    function dragOverHandler(e) {
        var sourceTask = e.dragSourceItem.data;
        var targetTask = e.dropTargetItem.data['task'];    
        var position = e.dropTargetItem.data['pos'];
        if (isValidTarget(sourceTask,targetTask,position)) {
            if (position == 'after') goog.dom.classes.add(targetTask.dom['dropTargetAfter'],'dragOver'); 
            else if (position == 'under') goog.dom.classes.add(targetTask.dom['dropTargetUnder'],'dragOver'); 
        }        
    }
    
    function dragOutHandler(e) {
        var targetTask = e.dropTargetItem.data['task'];     
        var position = e.dropTargetItem.data['pos'];     
            if (position == 'after') goog.dom.classes.remove(targetTask.dom['dropTargetAfter'],'dragOver'); 
            else if (position == 'under') goog.dom.classes.remove(targetTask.dom['dropTargetUnder'],'dragOver');          
    }

    goog.events.listen(this.dropGroup,'drop',dropItemHandler);
    goog.events.listen(this.dropGroup,'dragover',dragOverHandler);     
    goog.events.listen(this.dropGroup,'dragout',dragOutHandler);   

    // add root child drag target
    var new_target_under = new goog.fx.DragDropItem(this.rootTask.dom['dropTargetUnder'],{'task':this.rootTask,'pos':'under'});
    this.dropGroup.addDragDropItem(new_target_under);    

}

chees.tick.List.prototype.initTask = function (t) {
    if (t != this.rootTask) {
        // add drag and drop functionality
        var new_source = new goog.fx.DragDropItem(t.dom['root'],t);
        chees.tick.List.patchDraggable(new_source,t);
        this.dragGroup.addDragDropItem(new_source);          
    
        var new_target_after = new goog.fx.DragDropItem(t.dom['dropTargetAfter'],{'task':t,'pos':'after'});
        this.dropGroup.addDragDropItem(new_target_after);
    
        var new_target_into = new goog.fx.DragDropItem(t.dom['control'],{'task':t,'pos':'under'});
        this.dropGroup.addDragDropItem(new_target_into); 
    
    }
    
    var new_target_under = new goog.fx.DragDropItem(t.dom['dropTargetUnder'],{'task':t,'pos':'under'});
    this.dropGroup.addDragDropItem(new_target_under);    
    
    
       
    // add handler to select when clicked
    var self = this;
    
    if (t != this.rootTask) {
        goog.events.listen(
            t.dom['control'], 
            goog.events.EventType.CLICK,
            function (e) {
                if (e.target.nodeName == 'INPUT' || e.target.nodeName == 'TEXTAREA') {
                    self.selectTask(t,false,true);
                }
                else self.selectTask(t,true,true);
                e.stopPropagation(); 
            }
        );
    }
    
    // add handler to report changes when task is changed
    t.setTaskList(this);
    
}

chees.tick.List.prototype.showTask = function (t, focus) {
    if (!chees.tick.tools.isFullyVisible(t.dom['control'])) {
        var y = goog.style.getPageOffset(t.dom['control']).y;
        window.scroll(0,y-50);    
    }
    if (focus)
        t.focus();
}

// selects a task in the list
// t: the task to focus
// focus: also focuses the task (defaults to false)
// stay: does not deselect if the task is already selected
chees.tick.List.prototype.selectTask = function (t,focus,stay) {
    if (this.currentSelection == t && stay) {
        return;
    }
    if (this.currentSelection != this.rootTask) {
        this.currentSelection.deselect();
    }
    if (!t || this.currentSelection == t || t == this.rootTask) { 
        this.currentSelection = this.rootTask;
        if (this.setlistSaveObject) this.setlistSaveObject.generatePreview();     
        return; 
    }
    this.currentSelection = t;
    if (this.setlistSaveObject) this.setlistSaveObject.generatePreview();    
    t.select();
    this.showTask(t, focus);
}   

chees.tick.List.validateText = function (text) {
    if (!text) return false;
    if (text.length > 255) return false;
    return true;
}

chees.tick.List.prototype.newTask = function (text) {
    if (!text) text = '';
    var newTask = new chees.tick.Task(this.nextTaskId++, text);
    this.initTask(newTask);
    return newTask;
}

chees.tick.List.prototype.createTaskAfter = function () {
    var newTask = this.newTask(); 
    if (this.currentSelection == this.rootTask) newTask.insertFirst(this.rootTask);    
    else newTask.insertAfter(this.currentSelection); 
    this.selectTask(newTask);
    newTask.edit();    
}

chees.tick.List.prototype.createTaskUnder = function () {
    var newTask = this.newTask(); 
    newTask.insertFirst(this.currentSelection); 
    this.selectTask(newTask);
    newTask.edit();    
}

chees.tick.List.prototype.selectPrev = function () {
    if (this.currentSelection == this.rootTask) this.selectTask(this.rootTask.last);
    else {
        var prev = this.currentSelection.prev;
        if (prev) this.selectTask(prev);
    }
}

chees.tick.List.prototype.selectNext = function () {
    if (this.currentSelection == this.rootTask) this.selectTask(this.rootTask.first);
    else {
        var next = this.currentSelection.next;
        if (next) this.selectTask(next);
    }
}

chees.tick.List.prototype.selectUp = function () {
    if (this.currentSelection == this.rootTask) this.selectTask(this.rootTask.lastAncestor());
    else this.selectTask(this.currentSelection.traversePrev());
    if (this.currentSelection.parent.collapsed) this.selectUp();
}

chees.tick.List.prototype.selectDown = function () {
    if (this.currentSelection == this.rootTask) this.selectTask(this.rootTask.first);
    else {
        var next = this.currentSelection.traverseNext();
        if (next) this.selectTask(next);
        else this.selectTask(this.rootTask);
    }
    if (this.currentSelection.parent.collapsed) this.selectDown();    
}

chees.tick.List.prototype.selectLeft = function () {
    if (this.currentSelection == this.rootTask || this.currentSelection.parent == this.rootTask) return;
    else this.selectTask(this.currentSelection.parent);
}

chees.tick.List.prototype.selectRight = function () {
    if (this.currentSelection.collapsed) return;
    if (this.currentSelection.first) this.selectTask(this.currentSelection.first);
}

chees.tick.List.prototype.deleteTask = function () {
    if (this.currentSelection == this.rootTask) return;
    var prev = this.currentSelection.traversePrev();
    var next = this.currentSelection.next;
    this.currentSelection.remove();
    //var next = prev.traverseNext();
    if (next) this.selectTask(next,true);
    else if (prev) this.selectTask(prev,true);
    else this.selectTask(this.rootTask,true);   
    this.reportChange(); 
}

chees.tick.List.prototype.toggleTask = function () {
    if (this.currentSelection == this.rootTask) return;
    this.currentSelection.toggleStatus();
    this.reportChange();
}

chees.tick.List.prototype.generateList = function () {
        var list = this.rootTask.toSimpleList();    
        list.sort(function(a,b){return a['id'] - b['id']});
        return list;    
}

chees.tick.List.prototype.reportChange = function () {
    if (this.saveObject) {
        this.saveObject.notify(this.generateList());
    }
}

chees.tick.List.prototype.showSimple = function () {
    alert(goog.json.serialize(this.currentSelection.toSimple()));
}

chees.tick.List.prototype.leavePage = function (evt) {
    if (!this.saveObject.saved) return "This list has unsaved changes, which will be lost if you navigate away from this page. Are you sure you want to leave?";
}



