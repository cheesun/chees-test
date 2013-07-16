goog.provide('chees.tick.Share');

goog.require('chees.tick.Dialog');
goog.require('chees.tick.control');

goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');
goog.require('goog.events');

goog.require('goog.ui.ac');


/** @constructor */
chees.tick.Share = function (button) {
    this.button = button;

    this.dialog = new chees.tick.Dialog(button,'template_sharedialog');
    this.dialog.dom['accessSection'].style.display = 'none';

    this.possibleSettings = ['private','specific','public'];
    this.id = null;
    this.targetUrl = null;
    this.actualAccess = null;

    this.specified_permissions = null;

    var self = this;

    // set up friend picker autocomplete
    goog.net.XhrIo.send(
      '/tick/api/userfind?friends_only=true',
      function(e){
        var results = goog.json.parse(e.target.getResponseText())['results'];
        var friends = results.map(function(item){
          return item['email_address'];
        });
        var matcher = new goog.ui.ac.ArrayMatcher(friends, true);
        var renderer = new goog.ui.ac.Renderer(self.dialog.dom['accessPickerAutoComplete']);
        var inputHandler = new goog.ui.ac.InputHandler(null, null, true);
        self.auto_completer = new goog.ui.ac.AutoComplete(matcher, renderer, inputHandler);
        inputHandler.attachAutoComplete(self.auto_completer);
        inputHandler.attachInputs(self.dialog.dom['accessPickerText']);
      }
    );

    // events
    goog.events.listen(
        this.dialog.dom['accessChangeButton'],
        goog.events.EventType.CLICK,
        function (e) { self.saveAccess(); }
    );

    goog.events.listen(
        this.dialog.dom['accessSelect'],
        goog.events.EventType.CHANGE,
        function (e) { self.accessChanged(); }
    );

    goog.events.listen(
        this.dialog.dom['accessCancelButton'],
        goog.events.EventType.CLICK,
        function (e) { self.accessCancel(); }
    );

    goog.events.listen(
      this.dialog.dom['accessPickerText'],
      goog.events.EventType.KEYDOWN,
      function (e) { self.accessChanged(); }
    );
}

chees.tick.Share.prototype.getSpecified = function () {
  return this.dialog.dom['accessPickerText'].value;
}

chees.tick.Share.prototype.accessCancel = function () {
    this.selectAccess(this.actualAccess);
    this.dialog.dom['accessButtons'].style.visibility = 'hidden';
}

chees.tick.Share.prototype.accessChanged = function () {
    var select = this.dialog.dom['accessSelect'];
    var value = select.options[select.selectedIndex].value;

    if ( value == this.actualAccess && this.getSpecified() == this.specified_permissions )
        this.dialog.dom['accessButtons'].style.visibility = 'hidden';
    else
        this.dialog.dom['accessButtons'].style.visibility = 'visible';

    if(value == 'specific') {
      this.dialog.dom['accessPicker'].style.display = 'inline-block';
      this.auto_completer.setTarget(this.dialog.dom['accessPickerText']);
    } else
      this.dialog.dom['accessPicker'].style.display = 'none';
}

chees.tick.Share.prototype.selectAccess = function (access) {
    var select = this.dialog.dom['accessSelect'];
    select.options[select.selectedIndex].selected = false;
    for (var i=0; i<select.options.length; i++) {
        if (select.options[i].value == access) {
            select.options[i].selected = true;
            break;
        }
    }
}

chees.tick.Share.prototype.init = function (id,list_type,targetUrl,access,can_edit,specified_permissions) {
    this.list_type = list_type;
    this.button.style.display = 'block';
    if (access != null) {
        this.actualAccess = access;
        if (can_edit) this.dialog.dom['accessSection'].style.display = 'block';
        this.selectAccess(access);
        if (access == 'specific'){

          this.specified_permissions = this.dialog.dom['accessPickerText'].value = specified_permissions.join(', ');
          this.dialog.dom['accessPicker'].style.display = 'inline-block';
        }
    }
    this.id = id;
    this.targetUrl = targetUrl;

    this.recommendButton = new chees.tick.control.AjaxButton(
        this.dialog.dom['recommendButton'],
        '/tick/api/recommend',
        {'type':this.list_type,'id':this.id},
        {'start':'recommend','working':'recommending...','done':'recommended','disabled':'recommend','failed':'could not recommend'}
    );
}

chees.tick.Share.prototype.saveAccessCallback = function (event) {
    var text = event.target.getResponseText();
    this.dialog.dom['accessSelect'].disabled = false;
    this.dialog.dom['accessChangeButton'].disabled = false;
    this.dialog.dom['accessCancelButton'].disabled = false;
    this.dialog.dom['accessChangeButton'].value = 'save';
    if (event.target.getStatus() == 200) {
        var sp = text.split(' ');
        this.actualAccess = sp[sp.length-1];
        goog.dom.classes.remove(this.dialog.dom['saveDetails'],'invalidInput');
        goog.dom.classes.add(this.dialog.dom['saveDetails'],'validInput');
        this.dialog.dom['saveDetails'].innerHTML = event.target.getResponseText();
        this.dialog.dom['accessButtons'].style.visibility = 'hidden';
    } else {
        if (text) this.dialog.dom['saveDetails'].innerHTML = 'save failed: ' + text;
        else this.dialog['saveDetails'].innerHTML = 'save failed';
        goog.dom.classes.remove(this.dialog.dom['saveDetails'],'validInput');
        goog.dom.classes.add(this.dialog.dom['saveDetails'],'invalidInput');
    }
}

chees.tick.Share.prototype.saveAccess = function () {
    if (this.targetUrl == null || this.actualAccess == null) return;
    this.dialog.dom['accessSelect'].disabled = true;
    this.dialog.dom['accessChangeButton'].disabled = true;
    this.dialog.dom['accessCancelButton'].disabled = true;
    this.dialog.dom['accessChangeButton'].value = 'saving...';
    var select = this.dialog.dom['accessSelect'];
    var value = select.options[select.selectedIndex].value;
    var new_permissions = this.getSpecified();
    var data = new goog.structs.Map({
      'sharing' : value,
      'id' : this.id,
      'specified' : new_permissions
    });
    var querydata = goog.Uri.QueryData.createFromMap(data);

    var self = this;
    goog.net.XhrIo.send(
        this.targetUrl,
        function(e){self.specified_permissions = new_permissions; return self.saveAccessCallback(e)},
        'POST',
        String(querydata)
    );
    //TODO: include a loading animation or something here
}
