goog.provide('chees.tick.Dialog');

goog.require('goog.events');
goog.require('goog.ui.Popup');
goog.require('goog.ui.PopupBase.EventType');
goog.require('goog.positioning.AnchoredViewportPosition');
goog.require('goog.positioning.Corner');

/** @constructor */
chees.tick.Dialog = function (button,template,hover) {
    this.button = button;
    
    this.template = new chees.Dompling(template);
    this.dom = this.template.steam('root');

    this.hover = hover;
    
    document.getElementById('overlay').appendChild(this.dom['root']);
    
    var position = new goog.positioning.AnchoredViewportPosition(this.button,goog.positioning.Corner.BOTTOM_RIGHT);
    this.popup = new goog.ui.Popup(this.dom['root']);  
    this.popup.setVisible(false);
    this.popup.setPinnedCorner(goog.positioning.Corner.TOP_RIGHT);    
    this.popup.setAutoHide(true);
    this.popup.setHideOnEscape(true);
    this.popup.setPosition(position);
           
    // events
    var self = this;

    if (this.hover) {
        goog.events.listen(
            this.button,
            goog.events.EventType.MOUSEOVER,
            function (e) { self.popup.setVisible(true); }
        );  
        
        goog.events.listen(
            this.dom['root'],
            goog.events.EventType.MOUSEOUT,
            function (e) { 
                if (e.relatedTarget == self.dom['button'] || e.relatedTarget == self.dom['root'] || goog.dom.contains(self.dom['root'],e.relatedTarget) || goog.dom.contains(self.button,e.relatedTarget)) return;
                self.popup.setVisible(false); 
            }
        );          
        
        goog.events.listen(
            this.button,
            goog.events.EventType.MOUSEOUT,
            function (e) { 
                if (e.relatedTarget == self.dom['button'] || e.relatedTarget == self.dom['root'] || goog.dom.contains(self.dom['root'],e.relatedTarget) || goog.dom.contains(self.button,e.relatedTarget)) return;
                self.popup.setVisible(false); 
            }
        );  
        
    }

    goog.events.listen(
        this.dom['root'],
        goog.events.EventType.CLICK,
        function (e) { e.stopPropagation(); }
    );       

    goog.events.listen(
        this.popup,
        goog.ui.PopupBase.EventType.HIDE,
        function (e) {       
            goog.dom.classes.remove(self.button,'activeDialog'); 
            if (e.target == self.button) {    
                goog.events.listenOnce(
                    self.button,
                    goog.events.EventType.CLICK,
                    function (e) {           
                        self.toggle();
                        }
                    );               
                }
            }
    );
    
    goog.events.listen(
        this.popup,
        goog.ui.PopupBase.EventType.SHOW,
        function (e) { 
            goog.dom.classes.add(self.button,'activeDialog'); 
        }
    ); 
    
    goog.events.listen(
        this.button,
        goog.events.EventType.CLICK,
        function (e) { self.toggle(); e.stopPropagation(); }
    );       
       
    goog.events.listen(
        window, 
        goog.events.EventType.RESIZE, 
        function (e) { if (self.popup.isVisible()) self.popup.reposition(); }
    );      
    
    if (chees.tick.GlobalNotify && chees.tick.GlobalNotify.notifier) {
        goog.events.listen(
            chees.tick.GlobalNotify.notifier,
            goog.events.EventType.RESIZE, 
            function (e) { if (self.popup.isVisible()) self.popup.reposition(); }
        );
    }
}

chees.tick.Dialog.prototype.toggle = function (show) {
    if (this.popup.isVisible()) this.popup.setVisible(false);
    else this.popup.setVisible(true);  
}

chees.tick.Dialog.prototype.show = function() {
    this.popup.setVisible(true);
}

chees.tick.Dialog.prototype.hide = function() {
    this.popup.setVisible(false);
}
