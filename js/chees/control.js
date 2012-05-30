goog.provide('chees.tick.control');

goog.require('chees.tick.tools');

goog.require('goog.events.KeyHandler');
goog.require('goog.events.KeyCodes');
goog.require('goog.events.KeyEvent');
goog.require('goog.events');

goog.require('goog.dom.classes');
goog.require('goog.dom');
goog.require('goog.net.XhrLite');

/** @constructor */
chees.tick.control.AjaxButton = function (button,target,data,states) {
    this.button = button;
    this.target = target;
    var map = new goog.structs.Map(data);
    this.querydata = goog.Uri.QueryData.createFromMap(map);
    
    this.states = states; // should contain start, working, done, disabled

    this.button.value = this.states['start'];

    var self = this;
    this.button.onclick = function () { return self.begin() };    


    /* state machine:

           +<-----(failed)-----+
           |                   |
        [start] -(begin)-> [working] -(receive)-> [done]
           |                   |                     |
           +-------------------+---------------------+-------(disable)-> [disabled]
           
    */
}

chees.tick.control.AjaxButton.prototype.enable = function () {
    this.button.value = this.states['start'];
    this.button.disabled = false;    
}

chees.tick.control.AjaxButton.prototype.disable = function () {
    this.button.value = this.states['disabled'];
    this.button.disabled = true;
}

chees.tick.control.AjaxButton.prototype.failed = function () {
    this.button.value = this.states['failed'];
    this.button.disabled = false;
}

chees.tick.control.AjaxButton.prototype.receive = function (text) {
    if (!text) this.button.value = this.states['done'];
    else this.button.value = text;
    this.button.disabled = true;
}

chees.tick.control.AjaxButton.prototype.begin = function () {
    this.button.value = this.states['working'];
    this.button.disabled = true;
    
    var self = this;
    function callback (event) {
        if (event.target.getStatus() == 200) {       
            return self.receive(event.target.getResponseText());
        } else {
            alert('request failed: ' + event.target.getResponseText());
            return self.failed();
        }    
    }
    goog.net.XhrIo.send(
        this.target,
        callback,
        'POST',
        String(this.querydata)
    );        
}

/** @constructor */
chees.tick.control.AjaxEditable = function (display_id,attribute,target,validator,extradata,realvalue) {
    
    this.display = document.getElementById(display_id);
    if (realvalue != undefined) {
        this.realValue = realvalue;
        this.display.innerHTML = chees.tick.tools.escapeHTML(realvalue);
    } else {
        this.realValue = this.display.innerHTML;
    }
    this.button = goog.dom.createDom('input',{'type':'button','value':'change'});
    goog.dom.insertSiblingAfter(this.button,this.display);
    this.input = goog.dom.createDom('input',{'type':'text'});
    this.cancel = goog.dom.createDom('input',{'type':'button','value':'cancel'});
    this.target = target; // target url
    this.validator = validator; // validator url
    this.extradata = extradata; // dict of extra data to send with the request
    this.attribute = attribute; 
    var self = this;
    this.button.style.display = 'none';
    goog.events.listen(this.display.parentNode,goog.events.EventType.MOUSEOVER,function () { self.button.style.display = 'inline' });  
    goog.events.listen(this.display.parentNode,goog.events.EventType.MOUSEOUT,function () { if (self.display.style.display != 'none') self.button.style.display = 'none' });      
    this.button.onclick = function () { return self.edit() };
    this.display.onclick = function () { return self.edit() };
    
    this.keyHandler = new goog.events.KeyHandler(this.display.parentNode, true);
    function movementKeyHandler(e) {   
        var keyCode = e.keyCode;
        if (self.display.style.display == 'none') {
            if (keyCode == goog.events.KeyCodes.ENTER) self.beginSave();
            else if (keyCode == goog.events.KeyCodes.ESC) self.cancelSave();
            else return;
        }
        else return;
        e.preventDefault();
        e.stopPropagation();
    }
    goog.events.listen(this.keyHandler,goog.events.KeyHandler.EventType.KEY,movementKeyHandler);      
    
    
}

chees.tick.control.AjaxEditable.prototype.edit = function () {
    this.display.style.display = 'none';
    goog.dom.insertSiblingAfter(this.input,this.display);
    this.input.value = this.realValue; //this.display.innerHTML;
    this.input.focus();
    this.input.select();
    this.button.value = 'save';
    goog.dom.insertSiblingAfter(this.cancel,this.button);   
    var self = this;    
    this.button.onclick = function () { return self.beginSave() };
    this.cancel.onclick = function () { return self.cancelSave() };    
}

chees.tick.control.AjaxEditable.prototype.beginSave = function () {
    var self = this;    
    function callback (event) {
        if (event.target.getStatus() == 200) {       
            self.completeSave();
        } else {
            alert('update failed: ' + event.target.getResponseText());
        }
    }
    var data = {};
    for (var key in this.extradata) {
        data[key] = this.extradata[key];
    }
    data['attr'] = this.attribute;
    data['val'] = this.input.value;
    
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);    
        
    goog.net.XhrIo.send(
        this.target,
        callback,
        'POST',
        String(querydata)
    );     
    //goog.net.XhrLite.send(this.target+'?attr='+this.attribute+'&val='+this.input.value,callback);    
}

chees.tick.control.AjaxEditable.prototype.completeSave = function () {
    var new_value = this.input.value;
    this.realValue = new_value;
    this.display.innerHTML = chees.tick.tools.escapeHTML(new_value);
    this.display.style.display = 'inline';
    goog.dom.removeNode(this.input);
    goog.dom.removeNode(this.cancel);    
    this.button.value = 'change';
    var self = this;
    this.button.onclick = function () { return self.edit() };
}

chees.tick.control.AjaxEditable.prototype.cancelSave = function () {
    this.button.style.display = 'none'
    this.display.style.display = 'inline';
    goog.dom.removeNode(this.input);
    goog.dom.removeNode(this.cancel);
    this.button.value = 'change';
    var self = this;
    this.button.onclick = function () { return self.edit() };
}

/** @constructor */
chees.tick.control.Loading = function (target,dots,delay) {
    this.delay = delay;
    this.dots = dots;
    this.target = target;
    this.container = target.parentNode;
    this.element = goog.dom.createDom('div',{'class':'containsFloats'});    
    this.element.appendChild(goog.dom.createDom('div',{'class':'loading'},'loading'));
    this.clearing = goog.dom.createDom('div',{'class':'clearing'});    
    this.displayed_dots = 0;
    this.interval = null;
    this.playing = false;
}

chees.tick.control.Loading.prototype.play = function() {
    if (this.playing) return;
    this.playing = true;
    this.container.removeChild(this.target);
    this.container.appendChild(this.element);
    this.container.appendChild(this.clearing);
    var self = this;
    function frame() {
        if (self.displayed_dots < self.dots) {
            self.element.appendChild(goog.dom.createDom('li',{'class':'dot'}));
            self.displayed_dots ++;            
        }
        else {
            while (self.element.childNodes.length > 2) {
                self.element.removeChild(self.element.lastChild);
            }
            self.displayed_dots = 0;
        }        
    }
    this.interval = setInterval(frame,this.delay);
}

chees.tick.control.Loading.prototype.stop = function() {    
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.interval);
    this.interval = null;
    /*while (this.element.hasChildNodes()) {
        this.element.removeChild(this.element.firstChild);
    } */
    //this.element.innerHTML = '';   
    this.container.removeChild(this.element);
    this.container.removeChild(this.clearing);
    this.container.appendChild(this.target);
}

/** @constructor */
chees.tick.control.Button = function (element,action) {
    this.element = element;
    this.action = action;
    this.element.onclick = action;
}
chees.tick.control.Button.prototype.disable = function () {
    goog.dom.classes.add(this.element,'disabledButton');
    this.element.onclick = null;
}
chees.tick.control.Button.prototype.enable = function () {
    goog.dom.classes.remove(this.element,'disabledButton');
    this.element.onclick = this.action;
}

/** @constructor */
chees.tick.control.CheckBox = function (element, action) {
    this.element = element;
    this.checked = false;
    this.action = action;
    var self = this;
    goog.events.listen(
        this.element,
        goog.events.EventType.CLICK,
        function (e) { self.toggle(); e.stopPropagation(); }
    );    
}

chees.tick.control.CheckBox.prototype.check = function () {
    this.checked = true;
    if(this.action) this.action(this.checked);    
    goog.dom.classes.add(this.element,'checkedCheckBox');
}

chees.tick.control.CheckBox.prototype.unCheck = function () {
    this.checked = false;
    if(this.action) this.action(this.checked);    
    goog.dom.classes.remove(this.element,'checkedCheckBox');    
}

chees.tick.control.CheckBox.prototype.toggle = function () {
    if(this.checked) this.unCheck();
    else this.check();
}


