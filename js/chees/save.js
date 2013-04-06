goog.provide('chees.tick.Save');

goog.require('chees.tick.Dialog');

goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.structs.Map');
goog.require('goog.json');
goog.require('goog.events');

/** @constructor */
chees.tick.Save = function (button) {
    this.button = button;

    this.dialog = new chees.tick.Dialog(button,'template_savedialog');
    this.dialogButton = new chees.tick.control.Button(this.dialog.dom['saveButton'],function(){return self.save()});

    this.id = null;
    this.version = null;
    this.latestState = [];
    this.savedState = [];
    this.saved = true;
    this.saving = false;
    this.autosave = true;
    this.failed = false;

    this.notify();

    // server change checker
    var now = new Date();
    this.lastSaved = now.getTime();
    this.lastInterval = 1;
    this.lastLastInterval = 1;

    // events
    var self = this;

    goog.events.listen(
        this.dialog.dom['autoSave'],
        goog.events.EventType.CHANGE,
        function (e) { self.toggleAutoSave(); }
    );

}

chees.tick.Save.prototype.toggleAutoSave = function () {
    this.autosave = !this.autosave;
    if (this.autosave) this.dialog.dom['autoSave'].checked = true;
    else this.dialog.dom['autoSave'].checked = false;
}

chees.tick.Save.prototype.checkServerChange = function () {
    var now = new Date();
    if (this.version == null || this.lastSaved == null || now.getTime() - this.lastSaved < 60000 * this.lastInterval) {
        return;
    }
    if (!this.failed) {
        var self = this;
        function checkServerCallback (e) {
            if (e.target.getStatus() == 200) {
                var serverId = parseInt(e.target.getResponseText());
                if (serverId != self.version) {
                    self.lastSaved = null;
                    if (self.autosave) self.toggleAutoSave();
                    this.failed = true;
                    chees.tick.GlobalNotify.publish('list has changed on server, please refresh','bad');
                }
            }
        }
        goog.net.XhrIo.send(
            '/tick/api/ticklistversion?id=' + this.id,
            checkServerCallback
        );
    }
    var origLast = this.lastInterval;
    this.lastInterval += this.lastLastInterval;
    this.lastLastInterval = origLast;

}

chees.tick.Save.prototype.init = function (state) {
    this.button.style.display = 'block';
    this.latestState = state;
    this.savedState = state;
    this.notify();
    var self = this;
    function runAutoSave () {
        var save_sent = false;
        if(self.autosave) save_sent = self.save();
        if (save_sent) {
            var now = new Date();
            self.lastSaved = now.getTime();
            self.lastInterval = 1;
            self.lastLastInterval = 1;
        } else {
            self.checkServerChange();
        }
    }
    setInterval(runAutoSave,2000);
}

chees.tick.Save.prototype.notify = function (latestState) {
    if (latestState) this.latestState = latestState;
    if (goog.json.serialize(this.latestState) == goog.json.serialize(this.savedState)) {
        this.saved = true;
        this.button.setAttribute('value','saved');
        this.dialog.dom['saveButton'].setAttribute('value','saved');
        this.dialogButton.disable();
    } else {
        this.saved = false;
        this.button.setAttribute('value','save now');
        this.dialog.dom['saveButton'].setAttribute('value','save now');
        this.dialogButton.enable();
    }
}

chees.tick.Save.diffTask = function (a,b) {
    // for now we assume that all properties will be the same
    var diff = {};
    var differences = -1;
    for (var i in a) {
        if (b[i] != a[i] || i == 'id') {
            diff[i] = b[i];
            differences ++;
        }
    }
    if (differences <= 0) return {};
    return diff;
}


chees.tick.Save.prototype.getChanges = function () {

    var sq = new goog.structs.Queue();
    for (var i in this.savedState) sq.enqueue(this.savedState[i]);

    var lq = new goog.structs.Queue();
    for (var j in this.latestState) lq.enqueue(this.latestState[j]);

    var inserts = [];
    var updates = [];
    var deletes = [];

    while (!sq.isEmpty() || !lq.isEmpty()) {
        var currentS = sq.peek();
        var currentL = lq.peek();
        if (!(currentS instanceof Object)) {
            inserts.push(currentL);
            lq.dequeue();
        }
        else if (!(currentL instanceof Object)) {
            deletes.push(currentS);
            sq.dequeue();
        }
        else if (currentS.id < currentL.id) {
            deletes.push(currentS);
            sq.dequeue();
        }
        else if (currentL.id < currentS.id) {
            inserts.push(currentL);
            lq.dequeue();
        }
        else if (currentS.id == currentL.id) {
            var diff = chees.tick.Save.diffTask(currentS,currentL);
            if (!chees.tick.tools.isEmpty(diff)) updates.push(diff);
            sq.dequeue();
            lq.dequeue();
        }
    }

    var output = {};
    output['inserts'] = inserts;
    output['updates'] = updates;
    output['deletes'] = deletes;
    return goog.json.serialize(output);
}

chees.tick.Save.prototype.save = function () {
    if (this.saving || this.saved) return false;
    this.saving = true;
    this.button.setAttribute('value','saving...');
    this.dialog.dom['saveButton'].setAttribute('value','saving...');
    this.dialogButton.disable();
    var savetime = new goog.date.DateTime();
    var changes = this.getChanges();
    var data = new goog.structs.Map({'data':changes,'id':this.id,'ver':this.version});
    var querydata = goog.Uri.QueryData.createFromMap(data);
    var localstate = this.latestState;
    var self = this;
    goog.net.XhrIo.send(
        '/tick/api/listsave',
        function(e){return self.callback(e,localstate,savetime)},
        'POST',
        String(querydata)
    );
    return true;
}

chees.tick.Save.prototype.callback = function (event,state,time) {
    if (event.target.getStatus() == 200) {
        this.dialog.dom['saveMessage'].innerHTML = 'last saved at ' + time.toUsTimeString();
        goog.dom.classes.remove(this.dialog.dom['saveMessage'],'invalidInput');
        goog.dom.classes.add(this.dialog.dom['saveMessage'],'validInput');
        this.dialog.dom['saveDetails'].innerHTML = '';
        this.savedState = state;
        this.version = parseInt(event.target.getResponseText());
    } else {
        if (this.autosave) this.toggleAutoSave();
        var msg = 'Save at ' + time.toUsTimeString() + ' failed.';
        this.dialog.dom['saveMessage'].innerHTML = msg;
        goog.dom.classes.remove(this.dialog.dom['saveMessage'],'validInput');
        goog.dom.classes.add(this.dialog.dom['saveMessage'],'invalidInput');
        var text = event.target.getResponseText();
        this.dialog.dom['saveDetails'].innerHTML = text;
        this.failed = true;
        chees.tick.GlobalNotify.publish(msg + 'Please check details in the save menu.');
        this.dialog.show();
    }
    this.saving = false;
    this.notify();
}
