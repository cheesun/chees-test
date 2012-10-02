goog.provide('chees.tick.tools');

goog.require('goog.color');
goog.require('goog.style');
goog.require('goog.dom');


chees.tick.tools.isWhitespace = function (node) {
    if (node == null) return false;
    return node.nodeType == 3; // && /^\s*$/.test(node.data);
}


chees.tick.tools.firstElement = function (node) {
    var output = node.firstChild;
    if (chees.tick.tools.isWhitespace(output)) return chees.tick.tools.nextElement(output);
    return output;
}


chees.tick.tools.lastElement = function (node) {
    var output = node.lastChild;
    if (chees.tick.tools.isWhitespace(output)) return chees.tick.tools.prevElement(output);
    return output;
}

chees.tick.tools.prevElement = function (node) {
    var output = node.previousSibling;
    if (chees.tick.tools.isWhitespace(output)) return chees.tick.tools.prevElement(output);
    return output;
}

chees.tick.tools.nextElement = function (node) {
    var output = node.nextSibling;
    if (chees.tick.tools.isWhitespace(output)) return chees.tick.tools.nextElement(output);
    return output;
}


chees.tick.tools.validateEmail = function (email) { 
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
} 

chees.tick.tools.escapeHTML = function (text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
} 

chees.tick.tools.augmentLinks = function (text) {
    // go through and replace links in processed text
    var regex = "((?:(?:https?|ftps?|mailto)\\:\\/\\/)?"; // SCHEME
    regex += "(?:(?:[a-z0-9+!*(),;?&=\\$_.-]+(?:\\:[a-z0-9+!*(),;?&=\\$_.-]+)?@)?"; // User and Pass
    regex += "(?:[a-z0-9-.]*)\\.(?:aero|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|xxx)(?:\\.(?:[a-z]{2,3}))?"; // Host or IP
    regex += "(?:\\\\:[0-9]{2,5})?"; // Port
    regex += "(?:\\/(?:[a-z0-9+\\$%_-]\\.?)+)*\\/?"; // Path
    regex += "(?:\\?[a-z+&\\$_.-][a-z0-9;:@&%=+\\/\\$_.-]*)?"; // GET Query
    regex += "(?:#[a-z!_.-][a-z0-9+\\$!@_.,-]*)?))"; // Anchor    
    regex += "(\\s|$|\\b\\W(?:\\s|$|\\W))"; // Possible terminations
    return text.replace(new RegExp(regex,'gi'),'<a href="$1" target="_blank">$1</a>$2');
}


chees.tick.tools.getActualColor = function (node, def) {
    if (!def) def = '#ffc';
    var styleColor = 'transparent';
    var current = node;
    while ((styleColor == 'transparent' || styleColor == 'rgba(0, 0, 0, 0)') && current != null) {
        styleColor = goog.style.getBackgroundColor(current);
        current = current.parentNode;
    }
    if (!current) styleColor = goog.color.hexToRgbStyle(def);
    return styleColor;
}

chees.tick.tools.getCssClassBgColor = function (classname) {
    var temp = goog.dom.getElement('templates');
    var node = goog.dom.createDom('span',{'class':classname});
    temp.appendChild(node);
    return goog.style.getBackgroundColor(node);    
}

chees.tick.tools.isFullyVisible = function (element) {
    var dh = goog.dom.getDomHelper(element);

    var po = goog.style.getPageOffset(element);
    var vp = dh.getViewportSize();
    var ds = goog.dom.getDocumentScroll();
    var ch = element.clientHeight;

    var viewportStart = ds.y;
    var viewportEnd = ds.y + vp.height;
    var elementStart = po.y;
    var elementEnd = po.y + ch;

    if (elementStart < viewportStart) return false;
    if (elementStart < viewportEnd && elementEnd <= viewportEnd) return true;
    return false;
}

chees.tick.tools.isEmpty = function (obj) {
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }
    return true;
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (searchElement /*, fromIndex */ ) {
        "use strict";
        if (this == null) {
            throw new TypeError();
        }
        var t = Object(this);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 1) {
            n = Number(arguments[1]);
            if (n != n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n != 0 && n != Infinity && n != -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        return -1;
    }
}

