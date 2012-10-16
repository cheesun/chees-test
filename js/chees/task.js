goog.provide('chees.tick.Task');

goog.require('chees.Dompling');
goog.require('chees.tick.tools');
goog.require('chees.tick.Notes');

goog.require('goog.json');
goog.require('goog.object');
goog.require('goog.color');
goog.require('goog.dom.classes');
goog.require('goog.fx.dom');
goog.require('goog.events');


// constructor
/** @constructor */
chees.tick.Task = function(id,text,virtual,locked) {

    // tree structure
    this.parent = null;

    // children
    this.first = null;
    this.last = null;

    // siblings
    this.next = null;
    this.prev = null;
    
    // attributes
    this.dom = null;
    this.virtual = virtual; // virtual tasks are only for containing other tasks
    this.taskList = null; // the tasklist this task belongs to
    this.focused = false;
    this.updated = false; // set to true if the text has been set, ever
    if (text) this.updated = true;
    this.editing = false;
    this.selected = false;
    this.locked = locked;
    this.num_sub = 0;
    this.num_open = 1;
    this.citation = null; // if a setlist has been inserted under the task, store the id here and notify the server when the task is saved

    // task data
    this.id = id;
    this.text = text;
    this.complete = false;
    //this.notes = '';
    if (this.complete) this.num_open = 0;
    
    // other flags
    this.collapsed = false;   
    
    // init
    this.makeDom();  
    if (text) this.setText(text);
    
    if (!this.virtual) {
        this.checkBox = new chees.tick.control.CheckBox(
            this.dom['checkBoxControl'],
            function (status) { self.updateStatus(status); }
        );
        this.noteObject = new chees.tick.Notes(this);        
    }
    
    // event handlers
    var self = this;
    
    // most interaction happens with non-virtual (non-root) tasks
    if (!this.virtual) {
        /*goog.events.listen(
            this.dom['task'],
            goog.events.EventType.DBLCLICK,
            function (e) { e.preventDefault(); e.stopPropagation(); return self.edit() }
        );*/

        // task control

        if (!this.locked) {

            goog.events.listen(
                this.dom['editbutton'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.edit() }
            );        

            goog.events.listen(
                this.dom['upbutton'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.moveUp() }
            );
            
            goog.events.listen(
                this.dom['downbutton'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.moveDown() }
            );        
            
            goog.events.listen(
                this.dom['leftbutton'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.moveLeft() }
            );
            
            goog.events.listen(
                this.dom['rightbutton'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.moveRight() }
            );

            // edit text        
            goog.events.listen(
                this.dom['edittextcancel'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.revert() }
            );

            goog.events.listen(
                this.dom['edittextdone'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.done() }
            );

            goog.events.listen(
                this.dom['edittextfind'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.find() }
            );

            goog.events.listen(
                this.dom['edittextdelete'],
                goog.events.EventType.CLICK,
                function (e) { e.preventDefault(); e.stopPropagation(); return self.del() }
            );
        
        }
        
        goog.events.listen(
            this.dom['dropTargetAfter'],
            goog.events.EventType.CLICK,
            function (e) { 
                e.preventDefault(); 
                e.stopPropagation(); 
                var newTask = self.taskList.newTask(); 
                newTask.insertAfter(self); 
                self.taskList.selectTask(newTask);
                newTask.edit();
                }
        );     

        // block parent events when editing
        
        this.keyHandler = new goog.events.KeyHandler(this.dom['tasktext'], true);
        goog.events.listen(
            this.keyHandler,
            goog.events.KeyHandler.EventType.KEY,
            function (e) {
                //alert('bubbled here first'); 
                if (self.editing) { e.stopPropagation(); }
            },
            true
        );          
           
        goog.events.listen(
            this.dom['taskeditcontainer'],
            goog.events.EventType.CLICK,
            function (e) {
                if (self.editing) e.stopPropagation(); 
                }
        );             
           
    }    
    
    // we can create under the task too
    goog.events.listen(
        this.dom['dropTargetUnder'],
        goog.events.EventType.CLICK,
        function (e) { 
            e.preventDefault(); 
            e.stopPropagation(); 
            if (!self.virtual && self.first == null) return; // only allow this if there are already children
            if (self.taskList.currentSelection && self.taskList.currentSelection != self.taskList.rootTask) {
                self.taskList.currentSelection.deselect();
                }
            var newTask = self.taskList.newTask(); 
            newTask.insertFirst(self); 
            self.taskList.selectTask(newTask);
            newTask.edit();
            }
    );       

 

    // priveleged methods
    
    this._backtrack = function () {
        var current = self.parent;
        while (current)  {
            if (current.next) return current.next;
            current = current.parent;
        }
        return null;
    }
    
    this._lastnode = function () {
        var current = self;
        while (current.last) current = current.last;
        return current;
    }

    this._checkGroup = function () {
        if (self.virtual) return;
        if (self.first != null) goog.dom.classes.add(this.dom['control'],'groupingTask');
        else goog.dom.classes.remove(this.dom['control'],'groupingTask');
    }

    this._checkTasks = function () {
        self.num_open = 1;
        if (self.complete) self.num_open = 0;
        var current = self.first;
        while (current != null) {
            self.num_open += current.num_open;
            current = current.next;
        }
        if (self.virtual) return;        
        //alert(self.num_open);
        //if (self.num_open == 0) goog.dom.classes.add(self.dom['task'],'completedGroup');
        //else goog.dom.classes.remove(self.dom.task,'completedGroup');
        if (self.num_open == 0) self.collapse();
        else self.expand();     
        if (self.parent) self.parent._checkTasks();      
    }

    this._addChild = function (child,before) {
        // tree
        child.parent = self;
        if (!before) {
            child.prev = self.last;
            child.next = null;
            if (!self.first) self.first = child;
            if (self.last) self.last.next = child;
            self.last = child;
            // dom
            self.dom['list'].appendChild(child.dom['root'])
        } else {
            if (before.parent != self) throw "before is not a child of this task";
            child.prev = before.prev;
            if (before.prev) before.prev.next = child;
            if (!child.prev) self.first = child;
            child.next = before;
            before.prev = child;
            self.dom['list'].insertBefore(child.dom['root'],before.dom['root']);
        }
        self._checkGroup();        
        // track total & open tasks  
        self._checkTasks();  
    }
    
    this._runAway = function () {
        if (self.parent) {
            // dom
            self.parent.dom['list'].removeChild(self.dom['root']);    
            // tree
            if (self.prev) self.prev.next = self.next;
            else self.parent.first = self.next;
            if (self.next) self.next.prev = self.prev;
            else self.parent.last = self.prev;       
            self.parent._checkGroup();               
            self.parent._checkTasks();
            self.parent = null;                
        }
        self.next = null;
        self.prev = null;
    }
    

};

// static

chees.tick.Task.templateMap = { 'default' : 'template_task', 'virtual' : 'template_roottask'};
chees.tick.Task.templateCache = {};

chees.tick.Task.render = function (template,data) {
    var template_element = chees.tick.Task.templateMap[template];
    if (!(template_element in chees.tick.Task.templateCache)) {
        chees.tick.Task.templateCache[template_element] = new chees.Dompling(template_element);
    }
    return chees.tick.Task.templateCache[template_element].steam("root",data);
}

chees.tick.Task.setTemplate = function (type,target) {
    chees.tick.Task.templateMap[type] = target;
}

chees.tick.Task.treecount = function (root) {
    if (root == null) return 0;
    var visit = [root];
    var current = 0;
    while (current < visit.length) {
        var children = visit[current].getChildren();
        for (var child in children) {
            visit.push(children[child]);
        }
        current ++;
    }
    return visit.length;
}

chees.tick.Task.findfirst = function (task) {
    if (task.parent) return chees.tick.Task.findfirst(task.parent);
    if (task.prev) return chees.tick.Task.findfirst(task.prev);
    return task;
}

chees.tick.Task._debugPrint = function (task) {
    if (task == null) return "";
    var first = task.first ? "<ul>" + chees.tick.Task._debugPrint(task.first) + "</ul>": "";
    var next = chees.tick.Task._debugPrint(task.next);
    
    return "<li>" + chees.tick.tools.escapeHTML(task.text) + first + "</li>" + next;                
}
chees.tick.Task.debugPrint = function (task) {
    return "<ul>" + chees.tick.Task._debugPrint(task.first) + "</ul>";
}

// public methods

chees.tick.Task.prototype.isChildOf = function (parent) {
    if (this == parent) return false;
    var current = this;
    while (!current.virtual) {
        if (current == parent) return true;
        current = current.parent;
    }
    return false;
}

chees.tick.Task.prototype.setText = function (text,esc) {
    var processed;
    if (esc==null || esc) processed = chees.tick.tools.escapeHTML(text); // escape any html in the text
    else processed = text;
    this.text = text;
    this.updated = true;
    processed = chees.tick.tools.augmentLinks(processed);
    if(!this.virtual) this.dom['tasktext'].innerHTML = processed;
}

chees.tick.Task.prototype.setTaskList = function (taskList) {
    this.taskList = taskList;
}

chees.tick.Task.prototype.reportChange = function () {
    if (!this.updated) return false; // dont report changes until the task has been fully created
    if (this.taskList) return this.taskList.reportChange();
    return false;
}

chees.tick.Task.prototype.setNotes = function (newNote,noReport) {
    this.noteObject.setNotes(newNote,noReport);
}

chees.tick.Task.prototype.collapse = function () {
    if (this.first) goog.dom.classes.add(this.dom['task'],'collapsedTask');
    this.collapsed = true;
}

chees.tick.Task.prototype.expand = function () {
    goog.dom.classes.remove(this.dom['task'],'collapsedTask');  
    this.collapsed = false;
}

chees.tick.Task.prototype.updateStatus = function (status) {
    this.complete = status;
    if (status) {
        goog.dom.classes.add(this.dom['control'],'completedTask');  
        this.num_open --;
    }
    else {
        goog.dom.classes.remove(this.dom['control'],'completedTask');
        this.num_open ++;
    }        
    this._checkTasks();
    this.reportChange();
}

chees.tick.Task.prototype.contains = function (t) {
    if (!t || t.virtual || t == this || this.virtual) return false;
    var current = t;
    while (current.parent) {
        if (current == this) return true;
        if (current.virtual) return false;
        current = current.parent;
    }
    return false;
}

chees.tick.Task.prototype.getChildren = function () {
    var output = [];
    var current = this.first;
    while (current != null) {
        output.push(current);
    }
    return output;
}

chees.tick.Task.prototype.lastAncestor = function () {
    var current = this;
    while (current.last != null) current = current.last;
    return current;
}

chees.tick.Task.prototype.insertBefore = function (task) {
    // tree
    this._runAway();
    task.parent._addChild(this,task);
}

chees.tick.Task.prototype.insertAfter = function (task) {
    // tree
    this._runAway();
    task.parent._addChild(this,task.next);
}
       
chees.tick.Task.prototype.insertBelow = function (task) {
    // tree
    this._runAway();
    task._addChild(this);
}

chees.tick.Task.prototype.insertFirst = function (task) {
    if (!task.first) {
        this.insertBelow(task);
    } else {
        this.insertBefore(task.first);
    }
}


chees.tick.Task.prototype.traverseNext = function () {
    return this.first || this.next || this._backtrack();
}

chees.tick.Task.prototype.traversePrev = function () {
    return (this.prev && this.prev._lastnode()) || this.parent;
}

chees.tick.Task.prototype.makeDom = function () {
    var data = {"text":this.text};
    if (!this.virtual) this.dom = chees.tick.Task.render('default',data);
    else this.dom = chees.tick.Task.render('virtual',data);         
    return this.dom['root'];
}

chees.tick.Task.prototype.toString = function () {
    return "<task>" + this.text + "</task>";
}

chees.tick.Task.toSimple = function (that) {
    return {
        'id'        : that.id,
        'text'      : that.text,
        'complete'  : that.complete,
        'parent'    : that.parent ? that.parent.id : null,
        'prev'      : that.prev ? that.prev.id : null,
        'next'      : that.next ? that.next.id : null,
        'first'     : that.first ? that.first.id : null,
        'last'      : that.last ? that.last.id : null,
        'notes'     : that.noteObject ? that.noteObject.getNotes() : null
    };
}

chees.tick.Task.toSetlist = function (that) {
    return [
        that.id,                                               // 0
        that.text,
        that.parent ? that.parent.id : null,
        that.prev ? that.prev.id : null,
        that.next ? that.next.id : null,
        that.first ? that.first.id : null,
        that.last ? that.last.id: null,
        that.noteObject ? that.noteObject.getNotes() : null    // 7
    ];
}

chees.tick.Task.prototype.toSimpleList = function (simplify) {
    var simple;    
    if (!simplify) simple = chees.tick.Task.toSimple(this);
    else simple = simplify(this);
    var children = [];
    var current = this.first;
    while (current) {
        children = children.concat(current.toSimpleList(simplify));
        current = current.next;
    }
    if (this.virtual) return children;
    else return [simple].concat(children);
}

chees.tick.Task.prototype.focus = function () {
    var self = this;
    if (!this.virtual) {
        goog.events.listen(
            this.dom['control'],
            goog.events.EventType.BLUR,
            function (e) { self.focused = false }
        )
    }
    this.dom['control'].focus();
    this.focused = true;    
}

chees.tick.Task.prototype.select = function () {
    if (!this.virtual) {
        goog.dom.classes.add(this.dom['task'],'selectedtask');
        if (!this.editing) goog.dom.classes.remove(this.dom['taskcontrol'],'hidden');        
        this.selected = true;
    }
}

chees.tick.Task.prototype.deselect = function () {
    if (this.editing) {
        if (this.dom['taskedit'].value == '') this.revert();
        else this.done();
        }
    goog.dom.classes.remove(this.dom['task'],'selectedtask');
    goog.dom.classes.add(this.dom['taskcontrol'],'hidden'); 
    this.selected = false;
}

chees.tick.Task.prototype.remove = function () {
    this._runAway();
}

chees.tick.Task.prototype.setStatus = function (status) {
    if(status) this.checkBox.check();
    else this.checkBox.unCheck();
}

chees.tick.Task.prototype.toggleStatus = function () {
    if (this.complete) this.checkBox.unCheck();
    else this.checkBox.check();   
}

chees.tick.Task.prototype.showTask = function (focus) {
    if (!chees.tick.tools.isFullyVisible(this.dom['control'])) {
        var y = goog.style.getPageOffset(this.dom['control']).y;
        window.scroll(0,y-100);    
    }
    if (focus)
        this.focus();
}

// task editing

chees.tick.Task.prototype.edit = function () {
    if (this.editing) return;
    this.editing = true;
    this.dom['taskedit'].value = this.text;
    goog.dom.classes.add(this.dom['tasktext'],'hidden');    
    goog.dom.classes.remove(this.dom['taskeditcontainer'],'hidden');    
    goog.dom.classes.remove(this.dom['edittext'],'hidden');
    goog.dom.classes.add(this.dom['taskcontrol'],'hidden');    
    this.dom['taskedit'].focus();
}

chees.tick.Task.prototype.revert = function () {
    if (!this.editing) return;
    this.editing = false;
    if (!this.updated) { // this was a new task and the user cancelled creation
        this.del(); 
        return;
    }
    this.taskList.setlistFindObject.removeLastAdded();
    this.taskList.setlistFindObject.reset();    
    goog.dom.classes.add(this.dom['edittext'],'hidden');
    if (this.selected) goog.dom.classes.remove(this.dom['taskcontrol'],'hidden');    
    goog.dom.classes.remove(this.dom['tasktext'],'hidden');    
    goog.dom.classes.add(this.dom['taskeditcontainer'],'hidden');      
    this.setText(this.text);
}

chees.tick.Task.prototype.done = function () {
    if (!this.editing) return;
    if (this.dom['taskedit'].value == '') {
        this.dom['taskedit'].focus();
        return;
        }
    this.editing = false;
    var used_setlist = this.taskList.setlistFindObject.confirmUsage();  
    this.taskList.setlistFindObject.reset();  
    goog.dom.classes.add(this.dom['edittext'],'hidden');
    if (this.selected) goog.dom.classes.remove(this.dom['taskcontrol'],'hidden');    
    goog.dom.classes.remove(this.dom['tasktext'],'hidden');    
    goog.dom.classes.add(this.dom['taskeditcontainer'],'hidden');  
    this.setText(this.dom['taskedit'].value);

    this.reportChange();
    
    // encourage the user to try the 'setlistfind' functionality
    if (!used_setlist && this.first === null) {
        var query = this.dom['taskedit'].value;
        this.taskList.setlistFindObject.direct(query,
            function(event) {
                if (event.target.getStatus() == 200) {
                    var text = event.target.getResponseText();
                    var returned = goog.json.parse(text);
                    var results = returned['results'];
                    var message = 'Did you know there are ' + results.length + ' setlists that match the text "' + query + '"? You can click the pencil (edit) and then the magnifying glass (find) to see their details and use them in your list.';
                    if (results.length == 1)
                        message = 'Did you know there is ' + results.length + ' setlist that match the text "' + query + '"? You can click the pencil (edit) and then the magnifying glass (find) to see its details and use it in your list.';
                    if (results.length > 0) 
                        chees.tick.GlobalNotify.publish(message);
                } 
            }
        )        
    }
}

chees.tick.Task.prototype.find = function() {
    if (!this.editing) return;
    this.taskList.setlistFindObject.search(this.dom['taskedit'].value,this.dom['setlistfindcontainer']);
}

chees.tick.Task.prototype.del = function(dont_select) {
    this.editing = false;
    goog.dom.classes.add(this.dom['edittext'],'hidden');
    if (!dont_select) {
        if (this.prev) this.taskList.selectUp();
        else if (this.next) this.taskList.selectDown();
        else this.taskList.selectUp();
    }
    this.remove(); 
    this.reportChange();
}

// movement

chees.tick.Task.prototype.moveLeft = function () {
    if (this.virtual || !this.parent || this.parent.virtual) return;
    this.insertAfter(this.parent);
    this.showTask(true);  
    this.reportChange();    
}

chees.tick.Task.prototype.moveRight = function () {
    if (this.virtual || !this.prev) return;
    this.insertBelow(this.prev);
    this.showTask(true);  
    this.reportChange();    
}

chees.tick.Task.prototype.moveDown = function () {
    if (this.virtual || !this.next) return;
    this.insertAfter(this.next);
    this.showTask(true);  
    this.reportChange();    
}

chees.tick.Task.prototype.moveUp = function () {
    if (this.virtual || !this.prev) return;
    this.insertBefore(this.prev);
    this.showTask(true);  
    this.reportChange();    
}







