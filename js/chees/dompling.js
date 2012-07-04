/* simple templating
 * define the html in your document, generally you want them to be hidden
 * the title of each node, if specified, becomes the instance attribute name and the title attribute is removed
 * if you would like a title to be set on the output node, append that title as [title]
 * instances of "!variable!" int the dom are replaced with unescaped HTML
 * instances of "$variable$" in the dom are replaced with the value passed in via a dict {'variable':'new value'}
 * instances of %text% in the dom are replaced with that text <-- we use this to escape things like img tags so they dont get loaded when the page loads
 */


goog.provide('chees.Dompling');  

goog.require('goog.object');
goog.require('chees.tick.tools');

/** @constructor */
chees.Dompling = function(rootNode) {
    this.rootNode = goog.dom.getElement(rootNode);
    this.html = this.rootNode.innerHTML;
    this.rootNode.style.display = "none";
}

chees.Dompling.trim = function (s) {
    return s.replace(/^\s*/, "").replace(/\s*$/, "");
}

chees.Dompling.knead = function (string, data) {
    var output = string.substring();
    output = output.replace(/%(\w*)%/g,"$1");
    var re;
    for (var i in data) {
        var value = data[i];
        if (value == null) value = '';            
        re = new RegExp("\\$"+i+"\\$",'g');
        output = output.replace(re,chees.tick.tools.escapeHTML(value));
    }
    for (var i in data) {
        var value = data[i];
        if (value == null) value = '';            
        re = new RegExp("!"+i+"!",'g');
        output = output.replace(re,value);
    }    
    return output;
}


/** @return {!Object.<string, Element>} */
chees.Dompling.prototype.steam = function (root,data) {
    var tmp = goog.dom.createDom('div'); //,{"name":root});
    tmp.innerHTML = chees.Dompling.trim(chees.Dompling.knead(this.html,data));
    var newdom = tmp.firstChild;
    var elements = tmp.getElementsByTagName("*");
    var output = { root : newdom };
    for (var i = 0; i < elements.length; i++) {
        if (goog.object.containsKey(elements[i],"title")) {
            var node = elements[i];
            var title = node.getAttribute("title");
            var groups = /(.*)\[(.*)\]/.exec(title);
            if (groups === null) {
                output[title] = node;
                node.removeAttribute("title");    
            } else {
                output[groups[1]] = node;
                node.setAttribute("title",groups[2]);
            }
        }
    }
    
    return output; 
    // beware that attributes of output should be accessed via quoted identifiers
    // since with ADVANCED_OPTIMIZATIONS direct access will be renamed
}
