# -*- coding: utf-8 -*-

from google.appengine.ext import db
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.api import users

from django.utils import simplejson

import urllib
import logging
import random
import sys
from cgi import escape

from unidecode import unidecode

import models

# superclasses

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
        self.get = wrap_get_post(self.__class__.get)
        self.post = wrap_get_post(self.__class__.post)
        
    def output(self,text):
        if not isinstance(text,basestring):
            text = simplejson.dumps(text)
        return self.response.out.write(text)

class TickPageHandler(webapp.RequestHandler):
    CONTEXT = '' # subclasses can set this so that pages/errors know what kind of object they are working with
    def __init__(self,*args,**kw):
        #logging.warning('test!')
        webapp.RequestHandler.__init__(self,*args,**kw)
        self.template_dir = 'tick/templates/'
        self.current_user = None        
        def wrap_get_post(funct):
            def newfunct(*args,**kwargs):
                user_agent = self.request.headers['User-Agent']
                if 'MSIE 5' in user_agent or 'MSIE 6' in user_agent or 'MSIE 7' in user_agent:
                    self.output('msie.html')
                    return
                if users.get_current_user():
                    try:
                        self.current_user = models.TickUser.get_or_create() #models.TickUser.get_current_user() 
                    except models.NotInvitedError, e:
                        self.response.set_status(401)
                        self.output('invite_only.html')
                        return
                return funct(self,*args,**kwargs)
            return newfunct
        self.get = wrap_get_post(self.__class__.get)
        self.post = wrap_get_post(self.__class__.post)     
    
    def addUserInfo(self,data):
        user = users.get_current_user()
        current = self.request.path

        data['user_id'] = ''
        data['user'] = user
        data['login'] = users.create_login_url(current)

        data['admin'] = False
        
        if user:
            data['admin'] = users.is_current_user_admin()
            data['login'] = users.create_logout_url('tick/')
            tickuser = self.current_user #models.TickUser.get_current_user()
            if tickuser:
                data['user_id'] = tickuser.key().id()
                data['user'] = tickuser.tick_name
                data['gravatar'] = tickuser.gravatar_link()
            else:
                data['user'] = user.nickname()

        data['context'] = self.CONTEXT
        '''
        # this escapes all strings in the map...
        # but actually lets put that in the templates
        # since sometimes we need to know the actual value
        for item in data:
            value = data[item]
            if isinstance(value,basestring):
                data[item] = escape(value)
        '''
        return data
    
    def output(self,tmpl,data={},entity=None):
        if entity:
            # for now, every list is private
            if not entity.can_view(): 
            #models.TickUser.get_current_user(keys_only=True) != owner_key: #users.get_current_user().user_id() != owner:
                self.response.set_status(401)
                return self.response.out.write(template.render(self.template_dir+'401.html',self.addUserInfo(data)))
        output = template.render(self.template_dir+tmpl,self.addUserInfo(data))
        self.response.out.write(output) 


# use this to call datastore updates etc        
class Utility(TickPageHandler):
    def get(self):     
        #raise Exception('do not use')
        kind = models.TickUser
        last = self.request.get('last')
        output = {}
        try:
            if last:
                items = kind.all().order("__key__").filter('__key__ >', db.Key(last)).fetch(10)
            else:
                items = kind.all().order("__key__").fetch(10)
            counter = 0
            last_processed = 0               
            for i in items:
                last_processed = i.key()
                # START INIT CODE
                i.enqueue_indexing(url='/tick/tasks/searchindexing')
                    #i.indexed_ordinal_changed()
                # END INIT CODE       
                counter += 1
            output['text'] = '%s entities were fetched' % len(items)       
            output['link'] = 'utility?last=%s' % last_processed         
            output['messages'] = [Message('updated %s entities. last id was %s' % (counter,last_processed),'good')]            
            if not items:               
                output['link'] = ''
            self.output('utility.html',output)
        except Exception, e:
            self.output('utility.html',{'messages':[Message('error: %s' % str(e),'bad')]})

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
        id = int(self.request.get('id'))
        ver = int(self.request.get('ver'))
        changes = simplejson.loads(data)
        entity = models.TickList.save_list_items(id,ver,changes['inserts'],changes['updates'],changes['deletes'])         
        models.Activity.create('<actor>|updated|<target>',target=entity)   
        return self.output(entity.version)
        
class TickListLoad(TickApiHandler):
    def get(self):
        #import time
        #time.sleep(3)
        list_id = int(self.request.get('id'))
        ticklist,tasks = models.TickList.get_list_and_tasks(list_id)
        output = simplejson.dumps({
            'list'  : ticklist.to_simple(['version','sharing','can_edit']),
            'tasks' : [t.to_simple() for t in tasks],
            })
        return self.output(output)  

class TickListVersion(TickApiHandler):
    def get(self):
        list_id = int(self.request.get('id')) 
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
        output = simplejson.dumps({
            'id' : searchid,
            'results' : results
            })
        self.output(output)

class TickListShare(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        id = int(self.request.get('id'))
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
        lst = simplejson.loads(self.request.get('list'))
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
        
        output = simplejson.dumps({
            'id' : searchid,
            'results' : results
            })
        self.output(output)

class SetListLoad(TickApiHandler):
    def get(self):
        id = int(self.request.get('id'))
        setlist,tasks = models.SetList.get_setlist_and_tasks(id)
        output = simplejson.dumps({
            'list'  : setlist.to_simple(['description','sharing','can_edit']),
            'tasks' : [t.to_simple() for t in tasks],
            })  
        return self.output(output)

class SetListUse(TickApiHandler):
    def post(self):
        id = int(self.request.get('id'))
        ticklist_id = int(self.request.get('ticklist_id'))
        setlist = models.SetList.get_by_id(id)
        ticklist = models.TickList.get_by_id(ticklist_id)
        if setlist and ticklist:
            models.Activity.create('<actor>|used|<other>|in|<target>',target=ticklist,other=setlist)
        # TODO: also update citation data
        self.output('done')

class SetListShare(TickApiHandler):
    LOGIN_REQUIRED = True
    def post(self):
        id = int(self.request.get('id'))
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
        id = int(self.request.get('id'))
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
        leader = models.TickUser.get_by_id(int(self.request.get('leader')))
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
        id = int(self.request.get('id'))      
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
            #raise Exception('already recommended recently')
        return self.output('recommended')

# PAGES
        

class ListShow(TickPageHandler):
    CONTEXT = 'list'
    def get(self,id):
        l = models.TickList.get_by_id(int(id))
        return self.output('ticklist.html',{'name':l.name,'id':id, 'owner': l.owner.to_simple(['gravatar'])},l)  # originally list.html

class Message:
    def __init__(self,text,type='neutral'):
        self.text = text
        self.type = type

class Index(TickPageHandler):
    @staticmethod
    def process_stats(stats):
        return [
            ('lists open',stats['lists created']-stats['lists complete']),
            ('lists completed',stats['lists complete']),
            ('tasks open',stats['tasks created']-stats['tasks complete']),            
            ('tasks completed',stats['tasks complete']),
            ]
    def get(self):
        # TODO: also build user information here, in case of new users
        gen = models.TickUserStat.generate_stats(self.current_user)
        activities = [a.to_simple(['array','age']) for a in models.Activity.get_recent(limit=20)]
        stats = self.process_stats(gen) 
        return self.output('index.html',{'stats':stats,'feed':activities})

class ListTickLists(TickPageHandler):
    def compose(self,messages=None):
        lists = [l.to_simple(['updated','num_tasks','num_completed_tasks','open','owner_id','owner','owner_gravatar','top_task_path']) for l in models.TickList.get_lists()]
        faveset = set([l.target.key().id() for l in models.Favourite.get_favourites('TickList')])
        faves = [   
            dict(l,favourite=True) 
            for l in lists 
            if l['id'] in faveset]    
        other = [
            dict(l,favourite=False)
            for l in lists 
            if l['id'] not in faveset]            
        open_lists = [l for l in faves if l['open']] + [l for l in other if l['open']]
        closed_lists = [l for l in faves if not l['open']] + [l for l in other if not l['open']]
        data = {"open_lists":open_lists,"closed_lists":closed_lists}
        if messages:
            data['messages'] = messages        
        self.output('ticklists.html',data) 

    def get(self):
        self.compose()
            
    def post(self):
        action = self.request.get('action')
        name = self.request.get('name')
        
        if action == 'add':
            try:
                target = models.TickList.create_list(name)    
                models.Activity.create('<actor>|created|<target>',target=target)                
                return self.compose([Message('successfully added "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to add "%s": %s'%(name,e),'bad')])
                
        elif action == 'delete':
            try:
                id = int(self.request.get('id'))            
                target = models.TickList.delete_list(id)
                models.Activity.create('<actor>|deleted|<target>',target=target)
                return self.compose([Message('succesfully deleted "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to delete "%s": %s'%(name,e),'bad')])                

        elif action == 'clone':
            try:
                type_id = int(self.request.get('type_id'))
                setlist,target = models.TickList.create_from_setlist(name,type_id)
                models.Activity.create('<actor>|cloned|<other>|to|<target>',other=setlist,target=target,extra_recipients=[setlist.owner])
                return self.compose([Message('successfully created "%s"'%name,'good')])
            except Exception, e:
                return self.compose([Message('unable to create "%s": %s'%(name,str(e).replace('<','[').replace('>',']')),'bad')])                      
        
        elif action == 'close':
            try:
                id = int(self.request.get('id'))            
                target = models.TickList.close_list(id)
                models.Activity.create('<actor>|closed|<target>',target=target)
                return self.compose([Message('succesfully completed and closed "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to complete and close "%s": %s'%(name,e),'bad')])                 
        
        elif action == 'favourite':
            try:
                id = int(self.request.get('id'))  
                target = models.Favourite.set_favourite(models.TickList,id,True)
                models.Activity.create('<actor>|favourited|<target>',target=target)
                return self.compose([Message('succesfully favourited "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to favourite "%s": %s'%(name,e),'bad')])                 
        
        elif action == 'unfavourite':
            try:
                id = int(self.request.get('id'))            
                target = models.Favourite.set_favourite(models.TickList,id,False)
                models.Activity.create('<actor>|unfavourited|<target>',target=target)
                return self.compose([Message('succesfully unfavourited "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to unfavourite "%s": %s'%(name,e),'bad')])           

        return self.compose([Message('unknown action','bad')])                
        

        
        
class ListSetLists(TickPageHandler):
    def compose(self,messages=None):
        if self.current_user:
            faveset = set([l.target.key().id() for l in models.Favourite.get_favourites('SetList')])     
            mine = [dict(l.to_simple(['description','owner','rating','likes','favourites']),likeable=models.Like.can_like(l)) for l in models.SetList.get_my_setlists()]    
        else:
            faveset = set([])
            mine = []
        mine = [dict(l,favourite=True) for l in mine if l['id'] in faveset] + [dict(l,favourite=False) for l in mine if l['id'] not in faveset]
        other = [dict(l.to_simple(['description','owner','owner_gravatar','owner_id','rating','likes','favourites']),likeable=models.Like.can_like(l)) for l in models.SetList.get_other_setlists()]      
        other = [dict(l,favourite=True) for l in other if l['id'] in faveset] + [dict(l,favourite=False) for l in other if l['id'] not in faveset]
        data = {"mine":mine,"other":other}
        if messages:
            data['messages'] = messages        
        self.output('setlists.html',data) 

    def get(self):
        self.compose()

    def post(self):
        action = self.request.get('action')
        name = self.request.get('name')        

        if action == 'delete':
            try:
                id = int(self.request.get('id'))            
                target = models.SetList.delete_setlist(id)
                models.Activity.create('<actor>|favourited|<target>',target=target)
                return self.compose([Message('succesfully deleted "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to delete "%s": %s'%(name,e),'bad')])               

        elif action == 'favourite':
            try:
                id = int(self.request.get('id'))            
                target = models.Favourite.set_favourite(models.SetList,id,True)
                models.Activity.create('<actor>|favourited|<target>',target=target)       
                return self.compose([Message('succesfully favourited "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to favourite "%s": %s'%(name,e),'bad')])                 
        
        elif action == 'unfavourite':
            try:
                id = int(self.request.get('id'))            
                target = models.Favourite.set_favourite(models.SetList,id,False)
                models.Activity.create('<actor>|unfavourited|<target>',target=target)
                return self.compose([Message('succesfully unfavourited "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to unfavourite "%s": %s'%(name,e),'bad')])    

        elif action == 'like':
            try:
                id = int(self.request.get('id'))            
                target = models.Like.add_like(models.SetList,id)
                models.Activity.create('<actor>|liked|<target>',target=target)
                return self.compose([Message('succesfully liked "%s"'%name,'good')])
            except Exception,e:
                return self.compose([Message('unable to like "%s": %s'%(name,e),'bad')])   

        return self.compose([Message('unknown action','bad')])                


            
class SetListShow(TickPageHandler):
    CONTEXT = 'setlist'
    def get(self,id):
        l = models.SetList.get_setlist(int(id))
        return self.output('setlist.html',{'name':l.name,'id':id,'description':l.description,'owner':models.TickUser.get_by_user_id(l.creator_id).to_simple(['gravatar'])},l)


class Profile(TickPageHandler):

    def compose(self,profile_user,messages=None):       
        leader_entities = models.Follow.get_leaders(profile_user.key())
        follower_entities = models.Follow.get_followers(profile_user.key())
        if leader_entities:
            orig_leaders = frozenset([tuple(sorted(user.to_simple(['gravatar']).iteritems())) for user in leader_entities])
        else:
            orig_leaders = frozenset()
        if follower_entities:
            orig_followers = frozenset([tuple(sorted(user.to_simple(['gravatar']).iteritems())) for user in follower_entities])
        else:
            orig_followers = frozenset()

        leaders = [dict(item) for item in orig_leaders - orig_followers]
        mutual = [dict(item) for item in orig_leaders & orig_followers]
        followers = [dict(item) for item in orig_followers - orig_leaders]

        activities = [a.to_simple(['array','age']) for a in models.Activity.get_recent(actor=profile_user,limit=20)]

        data = {
            'leaders':      leaders,
            'followers':    followers,
            'mutual':       mutual,
            'messages':     messages,
            'profile_user': profile_user.to_simple(['big_gravatar','bigslip_gravatar','full_name','bio']),
            'following':    models.Follow.already_following(profile_user,self.current_user),
            'feed':         activities,
            }

        return self.output('profile.html',data)        

    def post(self,tickuser_id):
        action = self.request.get('action')
        if not tickuser_id:
            profile_user = self.current_user
        else:
            profile_user = models.TickUser.get_by_id(int(tickuser_id))    
        if action == 'follow':
            try:
                leader = models.TickUser.get_by_id(int(self.request.get('user_id')))
                follower = self.current_user
                #if profile_user != follower:
                #    raise Exception('follow request should be sent to your own profile')
                if follower.key() == leader.key():
                    raise Exception("you can't follow yourself")
                results = models.Follow.add_follower(leader,follower)          
                if results:
                    message = Message('you are now following %s' % leader.tick_name,'good')
                else:
                    message = Message('you were already following %s' % leader.tick_name,'neutral')
                return self.compose(profile_user,[message])      
            except Exception, e:
                return self.compose(profile_user,[Message('unable to follow: %s' %e,'bad')])
        elif action == 'unfollow':
            try:
                leader = models.TickUser.get_by_id(int(self.request.get('user_id')))
                follower = self.current_user
                #if profile_user != follower:
                #    raise Exception('follow request should be sent to your own profile')
                if follower.key() == leader.key():
                    raise Exception("you can't unfollow yourself")
                results = models.Follow.remove_follower(leader,follower)          
                if results:
                    message = Message('you are no longer following %s' % leader.tick_name,'good')
                else:
                    message = Message('you were not following %s' % leader.tick_name,'neutral')
                return self.compose(profile_user,[message])      
            except Exception, e:
                return self.compose(profile_user,[Message('unable to follow: %s' %e,'bad')])
              
    def get(self,tickuser_id):
        if not tickuser_id:
            profile_user = self.current_user
            if not profile_user:
                return self.redirect(users.create_login_url(self.request.path))
        else:
            profile_user = models.TickUser.get_by_id(int(tickuser_id))    
            if not profile_user:
                self.response.set_status(404)
                return self.output('404.html')
        return self.compose(profile_user)

     

        
