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
