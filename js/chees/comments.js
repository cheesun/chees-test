goog.provide('chees.tick.Comments');

goog.require('chees.Dompling');
goog.require('chees.tick.tools');

goog.require('goog.net.XhrLite');
goog.require('goog.json');
goog.require('goog.events');

/** @constructor */
chees.tick.Comments = function (container,target_id,target_type,user_gravatar,user_id,user_name) {
    this.container = goog.dom.getElement(container);;
    this.target_id = target_id;
    this.target_type = target_type;
    this.user_gravatar = user_gravatar;
    this.user_name = user_name;
    this.user_id = user_id;
    this.latest_comment_id = -1;
    
    var template = new chees.Dompling('template_comments');
    this.dom = template.steam('root');
    this.container.appendChild(this.dom['root']);
    
    this.button = this.dom['submit_button']
    
    this.comment_template = new chees.Dompling('template_comment');
    
    if (!user_gravatar && !user_id && !user_name) {
        this.button.disabled = true;
    }
    
    var self = this;
    goog.events.listen(this.button,goog.events.EventType.CLICK, function () { 
        return self.submit() 
    });
    
    goog.events.listen(this.dom['textinput'],goog.events.EventType.KEYPRESS, function(event) { 
        if (event.keyCode == goog.events.KeyCodes.ENTER && !event.shiftKey) {
            event.preventDefault(); 
            self.submit(); 
        } 
    });  
    
    this.getComments();
    
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
                var new_comment = self.addComment(current['text'],current['creator_gravatar'],current['creator_id'],current['creator'],current['age']);
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

chees.tick.Comments.prototype.addComment = function (text,user_gravatar,user_id,user_name,age) {
    if (!user_gravatar && !user_id && !user_name) {
        user_gravatar = this.user_gravatar;
        user_id = this.user_id;
        user_name = this.user_name; 
    }
    var data = {'text':text,'user_gravatar':user_gravatar,'user_id':user_id,'user_name':user_name,'age':age};
    var new_comment = this.comment_template.steam('root',data);
    this.dom['comment_area'].appendChild(new_comment['root']);
    return new_comment;
}

chees.tick.Comments.prototype.submit = function () {
    var text = this.dom['textinput'].value;
    var data = {
        'id' :      this.target_id,
        'type' :    this.target_type,
        'text' :    text        
    }
    var map = new goog.structs.Map(data);
    var querydata = goog.Uri.QueryData.createFromMap(map);
    
    var new_comment = this.addComment(text,null,null,null,'saving...');
        
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
    
    this.dom['textinput'].value = '';
}
