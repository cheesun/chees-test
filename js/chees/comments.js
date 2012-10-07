goog.provide('chees.tick.Comments');

goog.require('chees.Dompling');
goog.require('chees.tick.tools');

goog.require('goog.net.XhrLite');
goog.require('goog.json');
goog.require('goog.events');

/** @constructor */
chees.tick.Comments = function (container,list,target_id,target_type,user_gravatar,user_id,user_name) {
    this.container = goog.dom.getElement(container);
    this.list = list;
    this.target_id = target_id;
    this.target_type = target_type;
    this.user_gravatar = user_gravatar;
    this.user_name = user_name;
    this.user_id = user_id;
    this.latest_comment_id = -1;
    
    this.max_showing = 5;
    this.showing_older = false;
    
    var template = new chees.Dompling('template_comments');
    this.dom = template.steam('root');
    this.container.appendChild(this.dom['root']);
    
    this.button = this.dom['comment_button']
    this.reference = null;
    
    this.comment_template = new chees.Dompling('template_comment');
    this.reference_template = new chees.Dompling('template_reference');
    
    if (!user_gravatar && !user_id && !user_name) {
        this.dom['new_comment'].style.display = 'none';
        this.button.disabled = true;
    }
    
    var self = this;
    goog.events.listen(this.dom['root'],goog.events.EventType.CLICK, function (e) {
       e.stopPropagation();     
    });
    
    goog.events.listen(this.button,goog.events.EventType.CLICK, function () { 
        self.submit(); 
    });

    goog.events.listen(this.dom['cancel_button'],goog.events.EventType.CLICK, function () { 
        self.clear();
    });

    goog.events.listen(this.dom['clear_reference_button'],goog.events.EventType.CLICK, function () { 
        self.clearReference();
    });
    
    goog.events.listen(this.dom['refer_button'],goog.events.EventType.CLICK, function () { 
        self.setReference();
    });
    
    goog.events.listen(this.dom['show_hide_button'],goog.events.EventType.CLICK, function () { 
        self.toggleShowHide();
    });
    
    goog.events.listen(this.dom['textinput'],goog.events.EventType.KEYDOWN, function(event) { 
        if (event.keyCode == goog.events.KeyCodes.ENTER && !event.shiftKey) {
            event.preventDefault(); 
            self.submit(); 
        } else if (event.keyCode == goog.events.KeyCodes.ESC) {
            event.preventDefault();
            self.clear();
        }
    });  
    
    this.getComments();
    
}

chees.tick.Comments.prototype.setReference = function () {
    var task = this.list.getTask();
    if (!task) { 
        chees.tick.GlobalNotify.publish("Please select an item from the list first!","bad"); 
        return; 
    }
    this.reference = task;
    this.dom['reference'].appendChild(        
        this.reference_template.steam('root',{
            'refer':'your comment will refer to: ',
            'reference': this.list.getPath(task)
        })['root']
    ) ;
    this.dom['reference_container'].style.display = 'block';    
}

chees.tick.Comments.prototype.clearReference = function () {
    this.reference = null;
    this.dom['reference'].innerHTML = '';
    this.dom['reference_container'].style.display = 'none';
}

chees.tick.Comments.prototype.clear = function () {
    this.dom['textinput'].value = '';
    this.clearReference();
}

chees.tick.Comments.prototype.getComments = function () {
    var data = {
        'id' :      this.target_id,
        'type' :    this.target_type,
        'latest' :  this.latest_comment_id
    }
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);
    
    var self = this;
    function callback (event) {
        if (event.target.getStatus() == 200) {       
            var response = event.target.getResponseText();       
            var parsed = goog.json.parse(response);    
            for (var i in parsed) {
                current = parsed[i];
                if (current['id'] > self.latest_comment_id) self.latest_comment_id = current['id'];
                var new_comment = self.addComment(current['text'],current['creator_gravatar'],current['creator_id'],current['creator'],current['age'],current['reference']);
            }
        } else {
            chees.tick.GlobalNotify.publish('failed to get comments: ' + event.target.getResponseText(),'bad');
        }    
    }
    goog.net.XhrIo.send(
        '/tick/api/getcomments?' + String(querydata),
        callback,
        'GET'
        
    );       
}

chees.tick.Comments.prototype.toggleShowHide = function (show) {
    if (show === false || this.showing_older) {
        var number_hidden = this.dom['hidden_comments'].childNodes.length;
        var plural = '';
        if  (number_hidden > 1) plural = 's';
        this.dom['show_hide_message'].innerHTML = 'hiding ' + number_hidden + ' older comment' + plural;
        this.dom['show_hide_button'].value = 'show';
        this.showing_older = false;
        this.dom['hidden_comments'].style.display = 'none';
    } else {
        this.dom['show_hide_message'].innerHTML = 'showing all comments';
        this.dom['show_hide_button'].value = 'hide'
        this.dom['hidden_comments'].style.display = 'block';
        this.showing_older = true;
    }
}

chees.tick.Comments.prototype.addComment = function (text,user_gravatar,user_id,user_name,age,reference) {
    if (!user_gravatar && !user_id && !user_name) {
        user_gravatar = this.user_gravatar;
        user_id = this.user_id;
        user_name = this.user_name; 
    }
    var processed = chees.tick.tools.escapeHTML(text);
    processed = processed.replace(/\n/g,'<br>');
    var data = {'text': chees.tick.tools.augmentLinks(processed),'user_gravatar':user_gravatar,'user_id':user_id,'user_name':user_name,'age':age};
    var new_comment = this.comment_template.steam('root',data);
    var self = this;
    if (reference) {        
        var task = this.list.getTask(parseInt(reference));
        var rdom = this.reference_template.steam('root',{
            'refer':'referred to: ',
            'reference': this.list.getPath(task)
        });
        goog.events.listen(rdom['reference'],goog.events.EventType.CLICK,function(){self.list.gotoTask(task)});
        new_comment['reference'].appendChild(rdom['root']) ;
    }
    this.dom['comment_area'].appendChild(new_comment['root']);
    if (this.dom['comment_area'].childNodes.length > this.max_showing) {
        var temp = this.dom['comment_area'].firstChild;
        this.dom['comment_area'].removeChild(temp);
        this.dom['hidden_comments'].appendChild(temp);
        this.toggleShowHide(this.showing_older);
        this.dom['show_hide'].style.display = 'block';
    }
    
    return new_comment;
}

chees.tick.Comments.prototype.submit = function () {
    var text = this.dom['textinput'].value;
    if (text.length < 2) {
        chees.tick.GlobalNotify.publish('Please enter some comment text first.','bad');
        return;
    }
    var data = {
        'id' :          this.target_id,
        'type' :        this.target_type,
        'text' :        text
    }
    var reference_id = null;
    if (this.reference) {
        data['reference'] = parseInt(this.reference.id);
        reference_id = parseInt(this.reference.id);
    }
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);
    
    var new_comment = this.addComment(text,null,null,null,'saving...',reference_id);
        
    var self = this;
    function callback (event) {
        if (event.target.getStatus() == 200) {       
            new_comment['comment_age'].innerHTML = 'just now';
        } else {
            chees.tick.GlobalNotify.publish('failed to add comment: ' + event.target.getResponseText(),'bad');
            var e = self.dom['comment_area'];
            e.removeChild(new_comment['root']);
        }    
    }
    goog.net.XhrIo.send(
        '/tick/api/comment',
        callback,
        'POST',
        String(querydata)
    );       
    
    this.clear();
}
