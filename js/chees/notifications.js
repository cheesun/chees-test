goog.provide('chees.tick.Notifications');
goog.provide('chees.tick.GlobalNotify');

goog.require('goog.dom');
goog.require('goog.fx.Animation');
goog.require('goog.style');
goog.require('goog.events');

/** @constructor 
 *  global (exported) construct which allows outsiders to register a specific Notifications object
 *  used by chees.tick libraries via chees.tick.GlobalNotify.publish() * 
 * */
var GlobNot = function() { this.notifier = null};
GlobNot.prototype.register = function (notifier) {
        this.notifier = notifier;
    }
GlobNot.prototype.publish = function (message,classname) {
        if (this.notifier) return this.notifier.publishMessage(message,classname);
    }

chees.tick.GlobalNotify = new GlobNot();
    
/** 
 * @constructor
 * @extends {goog.events.EventTarget}
 */

chees.tick.Notifications = function (container, note_text, close_button, displaytime, max_msg) {
    this.container = document.getElementById(container);
    this.note_text = document.getElementById(note_text);
    this.close_button = document.getElementById(close_button);
    this.doc_body = document.getElementsByTagName("body")[0];
    this.displaytime = displaytime || 60000;
    this.max_messages = max_msg || 2;
    
    this.hide_timeout = null;
    this.current_anim = null;
    this.last_published = null;
    
    this.ANIMATION_EVENTS = [ goog.fx.Animation.EventType.BEGIN,
                            goog.fx.Animation.EventType.ANIMATE,
                            goog.fx.Animation.EventType.END ];

    this.empty_next_time = false;

    goog.style.setPosition(this.container,0,-1000); 

    // events
    var self = this;
    goog.events.listen(
        this.close_button,
        goog.events.EventType.CLICK,
        function (e) {
            e.stopPropagation(); 
            clearTimeout(self.hide_timeout);
            self.hide_timeout = null;
            var anim = self.hide(); 
            self.empty_next_time = true;
            
        }
    );  
}
goog.inherits(chees.tick.Notifications, goog.events.EventTarget);

// animation
chees.tick.Notifications.prototype.renderFrame = function (e) {
    var size = goog.style.getBorderBoxSize(this.container);
    var hscroll = (document.all ? document.scrollLeft : window.pageXOffset);
    var vscroll = (document.all ? document.scrollTop : window.pageYOffset);
    var original_margin = parseInt(goog.style.getStyle(this.doc_body,'margin-top')) || 0;
    var new_margin = parseInt(size.height+e.y);
    goog.style.setPosition(this.container,0,e.y);
    goog.style.setStyle(this.doc_body,'margin-top',new_margin.toString() + 'px');
    window.scrollTo(hscroll, vscroll-original_margin+new_margin);
    goog.events.dispatchEvent(this,new goog.events.Event(goog.events.EventType.RESIZE));
}

chees.tick.Notifications.prototype.repositionHidden = function () {
    this.container.style.display = 'block';
    var size = goog.style.getBorderBoxSize(this.container);
    goog.style.setPosition(this.container,0,-size.height); 
}

chees.tick.Notifications.prototype.show = function () {
    if (this.current_anim && this.current_anim.isPlaying()) this.current_anim.pause();
    else {
        var position = goog.style.getPosition(this.container);
        var size = goog.style.getBorderBoxSize(this.container);
        if (position.y + size.height <= 0) this.repositionHidden();
    }
    var position = goog.style.getPosition(this.container);
    this.current_anim = new goog.fx.Animation([position.x,position.y],
                                               [0,0],
                                               250);
    var self = this;
    goog.events.listen(
        this.current_anim,
        this.ANIMATION_EVENTS,
        function (e) {self.renderFrame(e)}
    );  
    this.current_anim.play();
    var size = goog.style.getBorderBoxSize(this.container);

    // hide it once the displaytime has passed
    if (this.hide_timeout) clearTimeout(this.hide_timeout);
    this.hide_timeout = setTimeout(function(){self.hide()},this.displaytime);
    return this.current_anim;
}

chees.tick.Notifications.prototype.hide = function () {
    if (this.current_anim && this.current_anim.isPlaying()) this.current_anim.pause();
    var pos = goog.style.getPosition(this.container);
    var size = goog.style.getBorderBoxSize(this.container);
    this.current_anim = new goog.fx.Animation([pos.x,pos.y],
                                               [0,-size.height],
                                               500);
    var self = this;
    goog.events.listen(
        this.current_anim,
        this.ANIMATION_EVENTS,
        function (e) {self.renderFrame(e)}
    );  
    goog.events.listen(
        this.current_anim,
        goog.fx.Animation.EventType.END,
        function (e) {self.container.style.display = 'none'}
    );
    this.current_anim.play(false);
    return this.current_anim;
}

//logic
chees.tick.Notifications.prototype.publishMessage = function(text,css_class) {
    // prevent spam
    text = chees.tick.tools.escapeHTML(text);
    if (!this.last_published || this.last_published.slice(0,10) !== text.slice(0,10)) {
        // clear things out if the user dismissed messages last time
        if (this.empty_next_time) {
            this.note_text.innerHTML = '';
            this.empty_next_time = false;
        } 
        
        // update text
        var new_element = document.createElement('div');
        new_element.innerHTML = text;
        goog.dom.classes.add(new_element,css_class);

        this.note_text.appendChild(new_element);
        if (this.note_text.children.length > this.max_messages) this.note_text.removeChild(this.note_text.children[0]);
    } else {
        if (this.empty_next_time) return;
    }
    this.last_published = text;   
    this.show();
}









