# -*- coding: utf-8 -*-

from google.appengine.ext import db
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.api import users

import random
from cgi import escape

import models

class TickPageHandler(webapp.RequestHandler):
    CONTEXT = '' # subclasses can set this so that pages/errors know what kind of object they are working with
    def __init__(self,*args,**kw):
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
                models.Activity.create('<actor>|deleted|<target>',target=target)
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

     

        
