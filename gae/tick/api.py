from google.appengine.api import users
from google.appengine.ext import webapp

import json
import models

class TickApiHandler(webapp.RequestHandler):
    LOGIN_REQUIRED = False # subclasses can set this if you want to enforce users being logged in

    def __init__(self,*args,**kwargs):
        super(TickApiHandler,self).__init__(*args,**kwargs)
        self.current_user = models.TickUser.get_current_user()
        def wrap_get_post(funct):
            def newfunct(*args,**kwargs):
                try:
                    if self.LOGIN_REQUIRED:
                        if users.get_current_user() is None:
                            self.response.set_status(401)
                            self.output('login required')
                            return
                except Exception, e:
                    self.response.set_status(403)
                    self.output(str(e))
                    return
                return funct(self,*args,**kwargs)
            return newfunct
        try:
            self.get = wrap_get_post(self.__class__.get)
        except AttributeError:
            pass
        try:
            self.post = wrap_get_post(self.__class__.post)
        except AttributeError:
            pass


    def output(self,text):
        if not isinstance(text,basestring):
            text = json.dumps(text)
        return self.response.out.write(text)

# helper function used by some of the api calls

def get_simple(list_entity,user_key):
    ''' includes the owner information if the Permissioned entity does not belong to the specified user_key '''
    if list_entity.get_owner_key() == user_key:
        return list_entity.to_simple(['top_task_path'])
    else:
        return list_entity.to_simple(['owner','owner_gravatar','owner_id','top_task_path'])

# API CALLS

class TickListSave(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        data = self.request.get('data')
        id = long(self.request.get('id'))
        ver = long(self.request.get('ver'))
        changes = json.loads(data)
        entity = models.TickList.save_list_items(id,ver,changes['inserts'],changes['updates'],changes['deletes'])
        models.Activity.create('<actor>|updated|<target>',target=entity)
        return self.output(entity.version)

class TickListLoad(TickApiHandler):
    def get(self):
        #import time
        #time.sleep(3)
        list_id = long(self.request.get('id'))
        ticklist,tasks = models.TickList.get_list_and_tasks(list_id)
        output = json.dumps({
            'list'  : ticklist.to_simple(['version','sharing','can_edit']),
            'tasks' : [t.to_simple() for t in tasks],
            })
        return self.output(output)

class TickListVersion(TickApiHandler):
    def get(self):
        list_id = long(self.request.get('id'))
        return self.output(models.TickList.get_by_id(list_id).version)

class TickListFind(TickApiHandler):
    def get(self):
        query = self.request.get('q')
        searchid = self.request.get('id')
        user = models.TickUser.get_current_user()
        if user:
            user_key = user.key()
            results = [get_simple(ticklist,user_key) for ticklist in models.TickList.search(query)]
        else:
            results = [ticklist.to_simple(['owner','owner_gravatar','owner_id','top_task_path']) for ticklist in models.TickList.search(query)]
        output = json.dumps({
            'id' : searchid,
            'results' : results
            })
        self.output(output)

class TickListShare(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        id = long(self.request.get('id'))
        sharing = self.request.get('sharing')
        entity = models.TickList.get_by_id(id)
        if not entity.can_edit():
            raise Exception('you do not have permissions to change the sharing on this ticklist')
        entity.sharing = sharing
        entity.put()
        if sharing == 'public':
            models.Activity.create('<actor>|made|<target>|public',target=entity)
        self.output('ticklist %s is now %s' % (entity.name,sharing))

class SetListSave(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        lst = json.loads(self.request.get('list'))
        name = self.request.get('setlistName')
        desc = self.request.get('setlistDescription')
        sharing = self.request.get('setlistShare')
        existing = models.SetList.all(keys_only=True).filter('owner =',models.TickUser.get_current_user(keys_only=True)).filter('deleted =',False).filter('name =',name).get()
        if existing:
            raise Exception("you've already created an active setlist with this name")
        entity = models.SetList.create_setlist(name,desc,sharing,lst)
        if sharing == 'public':
            models.Activity.create('<actor>|created|<target>',target=entity)
        return self.output('%s setlist "%s" created' % (sharing,name))
        return self.output(str(lst))

class SetListFind(TickApiHandler):
    def get(self):
        query = self.request.get('q')
        searchid = self.request.get('id')
        user = models.TickUser.get_current_user()
        if user:
            user_key = user.key()
            results = [get_simple(setlist,user_key) for setlist in models.SetList.search(query)]
        else:
            results = [setlist.to_simple(['owner','owner_gravatar','owner_id']) for setlist in models.SetList.search(query)]

        output = json.dumps({
            'id' : searchid,
            'results' : results
            })
        self.output(output)

class SetListLoad(TickApiHandler):
    def get(self):
        id = long(self.request.get('id'))
        setlist,tasks = models.SetList.get_setlist_and_tasks(id)
        output = json.dumps({
            'list'  : setlist.to_simple(['description','sharing','can_edit']),
            'tasks' : [t.to_simple() for t in tasks],
            })
        return self.output(output)

class SetListUse(TickApiHandler):
    def post(self):
        id = long(self.request.get('id'))
        ticklist_id = long(self.request.get('ticklist_id'))
        setlist = models.SetList.get_by_id(id)
        ticklist = models.TickList.get_by_id(ticklist_id)
        if setlist and ticklist:
            models.Activity.create('<actor>|used|<other>|in|<target>',target=ticklist,other=setlist)
        # TODO: also update citation data
        self.output('done')

class SetListShare(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        id = long(self.request.get('id'))
        sharing = self.request.get('sharing')
        entity = models.SetList.get_by_id(id)
        if not entity.can_edit():
            raise Exception('you do not have permissions to change the sharing on this setlist')
        entity.sharing = sharing
        entity.put()
        entity.enqueue_indexing(url='/tick/tasks/searchindexing')
        if sharing == 'public':
            models.Activity.create('<actor>|made|<target>|public',target=entity)
        self.output('setlist %s is now %s' % (entity.name,sharing))

class UserFind(TickApiHandler):
    def get(self):
        query = self.request.get('q')
        searchid = self.request.get('id')

        def augment_simple(tickuser):
            follower = models.TickUser.get_current_user()
            simple = tickuser.to_simple(['gravatar','full_name','email_address'])
            if not follower:
                simple['follow'] = 'not logged in'
                simple['disabled'] = 'disabled'
            else:
                if tickuser.key().id() == follower.key().id():
                    simple['follow'] = 'you are'
                    simple['disabled'] = 'disabled'
                elif models.Follow.already_following(tickuser,follower):
                    simple['follow'] = 'following'
                    simple['disabled'] = 'disabled'
                else:
                    simple['follow'] = 'follow'
                    simple['disabled'] = ''
            return simple

        self.output({
            'id' : searchid,
            'results' : [augment_simple(tickuser) for tickuser in models.TickUser.search(query)]
            })

class UserCheckName(TickApiHandler):
    # TODO: allow users to check usernames before they choose them
    pass


class TickListUpdate(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        current_user = models.TickUser.get_current_user()
        id = long(self.request.get('id'))
        attr = self.request.get('attr')
        if attr != 'name':
            raise Exception('only the name of a ticklist may be changed')
        val = self.request.get('val')
        entity = models.TickList.get_by_id(id)
        orig_val = getattr(entity,attr)
        setattr(entity,attr,val)
        entity.put()
        models.Activity.create('<actor>|renamed the ticklist "%s" to|<target>'%orig_val,actor=current_user,target=entity)
        self.output('%s changed from %s to %s' % (attr,orig_val,val))


class UserUpdate(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        attr = self.request.get('attr')
        val = self.request.get('val')
        current_user = models.TickUser.get_current_user()
        orig_val = getattr(current_user,attr)
        setattr(current_user,attr,val)
        current_user.put()
        models.Activity.create('<actor>|changed their profile',actor=current_user)
        self.output('%s changed from %s to %s' % (attr,orig_val,val))

class UserFollow(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        follower = models.TickUser.get_current_user()
        leader = models.TickUser.get_by_id(long(self.request.get('leader')))
        results = models.Follow.add_follower(leader,follower)
        if results:
            return self.output('you are now following %s' % leader.tick_name)
        else:
            return self.output('you were already following %s' % leader.tick_name)

class UserInvite(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        email_address = self.request.get('email_address')
        invitation = models.Invitation.invite(email_address)
        return self.output('invited %s' % email_address)

class Recommend(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        current_user = models.TickUser.get_current_user()
        id = long(self.request.get('id'))
        type = self.request.get('type')
        if type == 'ticklist':
            entity = models.TickList.get_by_id(id)
        elif type == 'setlist':
            entity = models.SetList.get_by_id(id)
        else:
            raise Exception('invalid type')
        new = models.Activity.create('<actor>|recommended|<target>',actor=current_user,target=entity)
        if new is None:
            return self.output('already recommended recently')
        return self.output('recommended')

class Comment(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        id = long(self.request.get('id'))
        type = self.request.get('type')
        reference = self.request.get('reference',None)
        if reference:
            reference = long(reference)
        if type == 'ticklist':
            entity = models.TickList.get_by_id(id)
        elif type == 'setlist':
            entity = models.SetList.get_by_id(id)
        else:
            raise Exception('invalid type')
        models.Comment.create(entity,self.request.get('text'),reference)
        new = models.Activity.create('<actor>|commented on|<target>',actor=self.current_user,target=entity)
        return self.output('commented')

class GetComments(TickApiHandler):
    def get(self):
        id = long(self.request.get('id'))
        type = self.request.get('type')
        last_id = long(self.request.get('latest'))
        if type == 'ticklist':
            entity = models.TickList.get_by_id(id)
        elif type == 'setlist':
            entity = models.SetList.get_by_id(id)
        else:
            raise Exception('invalid type')
        if last_id >= 0:
            last_key_name = model.Comment.make_key_name(entity,last_id)
            comments = models.Comment.all().ancestor(entity).filter('__key__ >',Key.from_path(model.Comment,last_key_name,parent=entity)).order('__key__').fetch(1000)
        else:
            comments = models.Comment.all().ancestor(entity).order('__key__').fetch(1000)
        self.output([comment.to_simple(['creator','creator_gravatar','creator_id','text','age','reference']) for comment in comments])


