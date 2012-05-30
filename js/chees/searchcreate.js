goog.provide('chees.tick.SearchAndCreateDialog');

goog.require('chees.Dompling');
goog.require('chees.tick.control');
goog.require('chees.tick.tools');

goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');

goog.require('goog.ui.Popup');
goog.require('goog.ui.PopupBase.EventType');
goog.require('goog.positioning.AnchoredViewportPosition');
goog.require('goog.positioning.Corner');

goog.require('goog.events.KeyHandler');
goog.require('goog.events.KeyCodes');
goog.require('goog.events.KeyEvent');
goog.require('goog.events');

// SearchResult
/** @constructor */
chees.tick.SearchResult = function (type,data,dom) {
    this.type = type;
    this.data = data;
    this.dom = dom;
}

chees.tick.SearchResult.prototype.primaryAction = function () {
    throw Error('not implemented');
    // should be overloaded when created
}

chees.tick.SearchResult.prototype.rightAction = function () {
    throw Error('not implemented');
    // should be overloaded when created
}

chees.tick.SearchResult.prototype.leftAction = function () {
    throw Error('not implemented');
    // should be overloaded when created
}

chees.tick.SearchResult.prototype.select = function () {
    goog.dom.classes.add(this.dom['root'],'selectedResult');
}

chees.tick.SearchResult.prototype.deselect = function () {
    goog.dom.classes.remove(this.dom['root'],'selectedResult');
}

// ResultHandler
/** @constructor */
chees.tick.ResultHandler = function () {
    this.resultType = 'result';
    this.targetUrl = null;
    this.lastProcessedQuery = -1;
};

chees.tick.ResultHandler.prototype.doQuery = function (searchId,searchText,callback) {
    var self = this;
    var myCallback = function (event) {
        if (searchId < self.lastProcessedQuery) return;
        self.lastProcessedQuery = searchId;
        var response = event.target.getResponseText();       
        var parsed = goog.json.parse(response);    
        if (event.target.getStatus() == 200) {
            return callback(searchId,parsed);
        } else {
            return parsed;
        }        
    }
    var searchQuery = encodeURIComponent(searchText);
    return goog.net.XhrIo.send(this.targetUrl + '?q=' + searchQuery + '&id=' + searchId, myCallback);  
};


chees.tick.ResultHandler.prototype.doSearch = function (searchId,query,callback) {
    // subclass should implement this by calling doQuery with its own callback. 
    // that callback should finally call the callback passed into this function
    // return this.doQuery(searchId,query,callback);
    throw Error('not implemented');
};



// TickListSearchResult
/** 
 * @constructor 
 * @extends chees.tick.SearchResult
 */
chees.tick.TickListResult = function (data,dom) {
    chees.tick.SearchResult.call(this,'ticklist',data,dom);    
}

goog.inherits(chees.tick.TickListResult, chees.tick.SearchResult);

chees.tick.TickListResult.prototype.primaryAction = function () {
    window.location = '/tick/ticklist/' + this.data.id;
}

// TickListResultHandler
/** 
 * @constructor 
 * @extends chees.tick.ResultHandler
 */
chees.tick.TickListResultHandler = function () {
    chees.tick.ResultHandler.call(this);
    this.resultType = 'ticklist';
    this.targetUrl = '/tick/api/ticklistfind';
    this.resultTemplate = new chees.Dompling('template_ticklistresult');
    this.listOwnerTemplate = new chees.Dompling('template_listowner');
    this.createTicklistTemplate = new chees.Dompling('template_ticklistcreate');    
};
goog.inherits(chees.tick.TickListResultHandler, chees.tick.ResultHandler);


chees.tick.TickListResultHandler.prototype.doSearch = function (searchId,query,callback) {
    var self = this;
    var compare = query.toLowerCase();
    var myCallback = function (searchId,data) {
        var output = [];
        var nameExists = false;
        // create a result for each ticklist result
        for (var i in data['results']) {
            var resultData = data['results'][i];      
            var resultDom = self.resultTemplate.steam('root',resultData);
            if (resultData['name'].toLowerCase() == compare) nameExists = true;
            if ('owner' in resultData) {
                var ownerDom = self.listOwnerTemplate.steam('root',resultData);        
                resultDom['root'].insertBefore(ownerDom['root'],resultDom['slip'].nextSibling);
            }
            output.push(new chees.tick.TickListResult(resultData,resultDom));
        }
        // create a result for creating a new list
        if (!nameExists) {
            var newdata = {'query':query};
            var createDom = self.createTicklistTemplate.steam('root',newdata);
            var newResult = new chees.tick.SearchResult(self.resultType,newdata,createDom);
            newResult.primaryAction = function(){createDom['form'].submit()};
            output.push(newResult);
        }
        return callback(searchId,output);
    }
    this.doQuery(searchId,query,myCallback);
};

// UserSearchResult
/** 
 * @constructor 
 * @extends chees.tick.SearchResult
 */
chees.tick.UserSearchResult = function (data,dom) {
    chees.tick.SearchResult.call(this,'user',data,dom);    
}

goog.inherits(chees.tick.UserSearchResult, chees.tick.SearchResult);

chees.tick.UserSearchResult.prototype.primaryAction = function () {
    this.dom['form'].submit();
}


// UserResultHandler
/** 
 * @constructor 
 * @extends chees.tick.ResultHandler
 */
chees.tick.UserResultHandler = function () {
    chees.tick.ResultHandler.call(this);
    this.resultType = 'user';
    this.targetUrl = '/tick/api/userfind';
    this.resultTemplate = new chees.Dompling('template_userresult');
    this.inviteTemplate = new chees.Dompling('template_inviteuser');    
};
goog.inherits(chees.tick.UserResultHandler, chees.tick.ResultHandler);

chees.tick.UserResultHandler.prototype.doSearch = function (searchId,query,callback) {
    var self = this;
    var compare = query.toLowerCase();
    var myCallback = function (searchId,data) {
        var output = [];
        var emailExists = false;    
        // create a result for each user result
        for (var i in data['results']) {
            var resultData = data['results'][i];      
            if ('email_address' in resultData && resultData['email_address'] == query) emailExists = true;
            var resultDom = self.resultTemplate.steam('root',resultData);
            output.push(new chees.tick.UserSearchResult(resultData,resultDom));
        }
        // create a result for inviting new users
        if (!emailExists && chees.tick.tools.validateEmail(query)) {
            var newdata = {'query':query};
            var createDom = self.inviteTemplate.steam('root',newdata);
            var inviteButton = new chees.tick.control.AjaxButton(
                createDom['inviteButton'],
                '/tick/api/userinvite',
                {'email_address':query},
                {'start':'invite','working':'inviting...','done':'invited','disabled':'invite'}
            )
            inviteButton.enable();
            output.push(new chees.tick.SearchResult(self.resultType,newdata,createDom));
        }
        return callback(searchId,output);
    }
    this.doQuery(searchId,query,myCallback);
};

// SetlistSearchResult
/** 
 * @constructor 
 * @extends chees.tick.SearchResult
 */
chees.tick.SetListResult = function (data,dom) {
    chees.tick.SearchResult.call(this,'setlist',data,dom);

    this.loadUrl = '/tick/api/setlistload';
    this.previewDom = null;
    this.showingPreview = false;

    var self = this;
    this.showPreviewCallback = function(event) {
        if (event.target.getStatus() == 200) {
            var response = event.target.getResponseText();
            var returned = goog.json.parse(response);        
            var template = new chees.Dompling('template_setlistpreview');
            self.previewDom = template.steam('root',{
                'description':returned['list']['description'],
                'list':chees.tick.SetListResult.setlistToList(returned['tasks'])});
            self.dom['slip'].appendChild(self.previewDom['root']);
            self.showPreview();
        } else {
        }
    }

    goog.events.listen(dom['previewButton'],goog.events.EventType.CLICK,function(e){
        self.rightAction();
        e.stopPropagation();
    });
    
}
goog.inherits(chees.tick.SetListResult, chees.tick.SearchResult);

chees.tick.SetListResult.setlistToList = function (setlist) {
    var list = document.createElement('UL');
    var lists = {};
    lists[null] = list;
    for (var i in setlist) {
        var current = setlist[i];
        var new_element = document.createElement('LI');
        new_element.appendChild(document.createTextNode(current['text']));
        var new_list = document.createElement('UL');
        new_element.appendChild(new_list);
        lists[current['id']] = new_list;
        lists[current['parent']].appendChild(new_element);        
    }
    return list.outerHTML;
} 

chees.tick.SetListResult.prototype.hidePreview = function (){
    this.previewDom['root'].style.display = 'none';
    this.dom['previewButton'].value = 'preview';
    this.dom['previewButton'].innerHTML = 'preview';
    this.showingPreview = false;
}

chees.tick.SetListResult.prototype.showPreview = function (){
    this.previewDom['root'].style.display = 'block';
    this.dom['previewButton'].value = 'hide preview';                                                
    this.dom['previewButton'].innerHTML = 'hide preview';                    
    this.showingPreview = true;
} 


chees.tick.SetListResult.prototype.primaryAction = function () {
    window.location = '/tick/setlist/' + this.data['id'];
}

chees.tick.SetListResult.prototype.rightAction = function () {
    if (!this.previewDom) {
        goog.net.XhrIo.send(
            this.loadUrl + '?id=' + this.data['id'],
            this.showPreviewCallback
        );    
    } else {
        if (this.showingPreview) this.hidePreview();
        else this.showPreview();
    }
}


// SetListResultHandler
/** 
 * @constructor 
 * @extends chees.tick.ResultHandler
 */
chees.tick.SetListResultHandler = function () {
    chees.tick.ResultHandler.call(this);
    this.resultType = 'setlist';
    this.targetUrl = '/tick/api/setlistfind';
    this.resultTemplate = new chees.Dompling('template_setlistresult');
    this.listOwnerTemplate = new chees.Dompling('template_listowner');
};
goog.inherits(chees.tick.SetListResultHandler, chees.tick.ResultHandler);


chees.tick.SetListResultHandler.prototype.doSearch = function (searchId,query,callback) {
    var self = this;
    var compare = query.toLowerCase();   
   
    var myCallback = function (searchId,data) {
        var output = [];
        // create a result for each setlist result
        for (var i in data['results']) {
            var resultData = data['results'][i];      
            var resultDom = self.resultTemplate.steam('root',resultData);
             
            if ('owner' in resultData) {
                var ownerDom = self.listOwnerTemplate.steam('root',resultData);
                resultDom['root'].insertBefore(ownerDom['root'],resultDom['slip'].nextSibling);
            }
            output.push(new chees.tick.SetListResult(resultData,resultDom));
        }
        return callback(searchId,output);
    }
    this.doQuery(searchId,query,myCallback);
};

/** @constructor */
chees.tick.SearchAndCreateDialog = function (input,parent,template) {
    this.input = goog.dom.getElement(input); // the input field which triggers changes in the dialog
    this.parent = goog.dom.getElement(parent); // which element this dialog appears in
    this.template = template; // what template to use for the dialog body
    
    this.dialogTemplate = new chees.Dompling(template);
    this.dialogDom = this.dialogTemplate.steam('root');

    this.parent.appendChild(this.dialogDom['root']);
   
    this.dialogDom['root'].style.display = 'none';

    this.loadAnimation = new chees.tick.control.Loading(this.dialogDom['loading'],'5','200');
    
    this.lastInput = '';

    this.lastSearchId = 0;
    this.lastLoadedSearch = -1;
    this.currentResults = [];
    this.queries = [];
    this.lastQueryChange = null;

    this.selectedItem = 0;
    
    this.sections = [];
    this.received = 0;
   
    var self = this;     

    goog.events.listen(
        this.input,
        goog.events.EventType.BLUR,
        function (e) { self.handleBlur(); }
    );  

    goog.events.listen(
        this.input,
        goog.events.EventType.CLICK,
        function (e) { e.stopPropagation(); }
    );

    goog.events.listen(
        this.parent,
        goog.events.EventType.CLICK,
        function (e) { e.stopPropagation(); }
    );

    goog.events.listen(
        this.input,
        [
            goog.events.EventType.INPUT,
            goog.events.EventType.PROPERTYCHANGE
        ],
        function (e) { self.processInput(); }
    );        

    goog.events.listenOnce(
        this.input,
        goog.events.EventType.FOCUS,
        function (e) { 
            self.input.value=''; 
        }
    ); 
    
    this.hideDialog('type to search or create lists');
    
    // search stuff
    
    this.sections.push(new chees.tick.UserResultHandler());
    this.sections.push(new chees.tick.TickListResultHandler());
    this.sections.push(new chees.tick.SetListResultHandler());
    
    //this.sections = [this.ticklistSection,this.setlistSection,this.userSection];
        
    // keyboard
    this.keyHandler = new goog.events.KeyHandler(this.input, true);

    function movementKeyHandler(e) {   
        var keyCode = e.keyCode;
        if (keyCode == goog.events.KeyCodes.UP) {
            var len = self.currentResults.length;
            var orig = self.selectedItem%len;
            self.selectedItem --;
            if (self.selectedItem < 0) self.selectedItem += len;
            if (orig in self.currentResults) self.currentResults[orig].deselect();
            self.currentResults[self.selectedItem%len].select();
        }
        else if (keyCode == goog.events.KeyCodes.DOWN) {
            var len = self.currentResults.length;
            var orig = self.selectedItem%len;
            self.selectedItem ++;
            if (self.selectedItem >= len) self.selectedItem -= len;
            if (orig in self.currentResults) self.currentResults[orig].deselect();
            self.currentResults[self.selectedItem%len].select();        
        }
        else if (keyCode == goog.events.KeyCodes.ENTER) {
            self.currentResults[self.selectedItem].primaryAction();
        }
        else if (keyCode == goog.events.KeyCodes.RIGHT) {
            self.currentResults[self.selectedItem].rightAction();
        }
        else if (keyCode == goog.events.KeyCodes.LEFT) {
            self.currentResults[self.selectedItem].leftAction();
        }        
        else if (keyCode == goog.events.KeyCodes.ESC) {
            self.input.value = '';
            self.processInput();
            self.input.blur();
        }
        else return;
        e.preventDefault();
        e.stopPropagation();
    }
    goog.events.listen(this.keyHandler,goog.events.KeyHandler.EventType.KEY,movementKeyHandler);  
     
    
}

// set up dom behaviour
chees.tick.SearchAndCreateDialog.prototype.startLoading = function () {this.loadAnimation.play()}

chees.tick.SearchAndCreateDialog.prototype.stopLoading = function () {this.loadAnimation.stop()}

chees.tick.SearchAndCreateDialog.prototype.handleBlur = function () {
    if (this.input.value == '') {
        this.hideDialog('type to search or create lists');
        var self = this;
        goog.events.listenOnce(
            this.input,
            goog.events.EventType.FOCUS,
            function (e) { 
                self.input.value=''; 
            }
        );          
    }
}

chees.tick.SearchAndCreateDialog.prototype.hideDialog = function (inputText) {
    goog.dom.classes.add(this.input,'inactive');    
    if (inputText != null) { this.input.value = inputText; }
    this.dialogDom['root'].style.display = 'none';
}

chees.tick.SearchAndCreateDialog.prototype.showDialog = function () {
    this.dialogDom['root'].style.display = 'block';
}

chees.tick.SearchAndCreateDialog.prototype.processInput = function (force) {
    var now = new Date();
    this.lastQueryChange = now.getTime();
    var currentInput = this.input.value;
    var status = (currentInput != this.lastInput);
    this.lastInput = currentInput;
    if (status) {
        if (currentInput == '') {
            this.hideDialog();
        } else {
            // if the string is longer than 2 characters, or the first 2 characters contain other languages (eg CJK), search
            var self = this;
            if (currentInput.length > 2 || currentInput.charCodeAt(0) > 255 || currentInput.charCodeAt(1) > 255) setTimeout(function(){return self.search()},300);
            goog.dom.classes.remove(this.input,'inactive');             
            this.showDialog();       
        }
    }    
}

// general search functionality
chees.tick.SearchAndCreateDialog.prototype.addResult = function (searchId,resultList) {   
    if (searchId < this.lastLoadedSearch) return;
    if (searchId > this.lastLoadedSearch && this.received == 0) {  //resultList.length > 0) {
        this.currentResults = [];
        this.dialogDom['resultList'].innerHTML = '';
        this.lastLoadedSearch = searchId;
        this.selectedItem = 0;
    }
    this.received++;
    for (var i=0; i< resultList.length; i++) {
        var result = resultList[i];
        this.currentResults.push(result);
        // TODO: remove this debugging
        /*
        with ({res:result}) {
            goog.events.listen(res.dom['root'],goog.events.EventType.CLICK,function(e){
                if (e.target != res.dom['root']) return;
                res.select();
            });          
        }*/
        this.dialogDom['resultList'].appendChild(result.dom['root']);
        if (this.currentResults.length == 1) this.currentResults[0].select();
    }
    if (this.received == this.sections.length) {
        this.stopLoading();
        this.received = 0;
    }
}

chees.tick.SearchAndCreateDialog.prototype.search = function () {
    this.startLoading();

    var now = new Date();
    if (now.getTime() < this.lastQueryChange + 250) return;
    var searchText = this.input.value;
    if (searchText == '') {
        return false;
    }
    var searchQuery = encodeURIComponent(searchText);
    this.queries.push(searchQuery);
        
    var self = this;
    var addResultCallback = function (searchId,resultList) { return self.addResult(searchId,resultList) };
    for (var i=0;i<this.sections.length;i++) {
        this.sections[i].doSearch(this.lastSearchId,searchText,addResultCallback);
    }
    /*
    this.userResultHandler.doSearch(this.lastSearchId,searchText,addResultCallback);
    this.ticklistResultHandler.doSearch(this.lastSearchId,searchText,addResultCallback);
    this.setlistResultHandler.doSearch(this.lastSearchId,searchText,addResultCallback);    */
    this.lastSearchId ++;    

    return true;
}


