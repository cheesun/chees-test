from google.appengine.ext import db
from google.appengine.api import users
from google.appengine.api import mail

from hashlib import md5

from audited import Audited
from search import Searchable
from util import transactional

#from cache import memoize_result, invalidate_cache
import cache

class NotInvitedError(Exception):
    pass

class TickUser(Searchable,Audited):
    INDEX_ONLY = ['tick_name','full_name','email_address']
    INDEX_TITLE_FROM_PROP = 'tick_name'
    INDEX_USES_MULTI_ENTITIES = False
    INDEX_ADD_STOP_WORDS = frozenset(['com','edu','gov','org','net'])
    
    tick_name = db.StringProperty()
    full_name = db.StringProperty()
    email_address = db.StringProperty()
    primary_email_address = db.StringProperty() # obsolete
    all_users = db.ListProperty(users.User)
    all_user_ids = db.StringListProperty()
    bio = db.StringProperty()
    
    # TODO: implement add_user/merge_user functionality
    
    def __init__(self,*args,**kwargs):
        super(TickUser,self).__init__(*args,**kwargs)
        
        def before_put_trigger(this):
            if not this.is_saved():
                if not this.tick_name:
                    this.tick_name = this.all_users[0].nickname()
                if not this.email_address:
                    this.email_address = this.all_users[0].email() 

        def after_put_trigger(this):
            for user_id in this.all_user_ids:
                for keys_only in [True,False]:
                    cache.invalidate_cache('%s.get_by_user_id(%s,%s)'%(self.__class__.__name__,user_id,keys_only))
                    cache.invalidate_cache('%s.get_current_user(%s,%s)'%(self.__class__.__name__,user_id,keys_only))        
            
            cache.invalidate_cache('%s(%s)'%(self.__class__.__name__,self.key()))    
        
            #if this.attribute_changed('tick_name'):
            #    invalidate_cache('OwnerName(%s)'%self.key())
                
            #if this.attribute_changed('email_address'):
            #    invalidate_cache('OwnerGravatarLink(%s)'%self.key())                
            
            if this.attribute_changed(this.INDEX_TITLE_FROM_PROP):
                this.indexed_title_changed()
            this.enqueue_indexing(url='/tick/tasks/searchindexing')
                    
        self.add_before_put_trigger(before_put_trigger)
        self.add_after_put_trigger(after_put_trigger)

        self.add_to_simple_field_mapping('name',lambda this: this.tick_name)        
        self.add_to_simple_field_mapping('gravatar',lambda this: this.gravatar_link())
        self.add_to_simple_field_mapping('bigslip_gravatar',lambda this: this.gravatar_link(48))
        self.add_to_simple_field_mapping('big_gravatar',lambda this: this.gravatar_link(128))        
        self.add_to_simple_default_fields(['id','tick_name'])

    @classmethod
    def get_by_user_id(cls,user_id,keys_only=False):
        return cache.memoize_result('%s.get_by_user_id(%s,%s)'%(cls.__name__,user_id,keys_only),cls.all(keys_only=keys_only).filter('all_user_ids =',user_id).get)
        #return cls.all(keys_only=keys_only).filter('all_user_ids =',user_id).get()
            
    @classmethod
    def get_current_user(cls,keys_only=False):
        current_user = users.get_current_user()
        if current_user:
            return cache.memoize_result('%s.get_current_user(%s,%s)'%(cls.__name__,current_user.user_id(),keys_only),cls.get_by_user_id,current_user.user_id(),keys_only=keys_only)   
        else:
            return None

    @classmethod
    def get_or_create(cls,user=None):
        if not user:
            user = users.get_current_user()
        if not user:
            raise Exception('not logged in - cannot get or create TickUser')
        existing = cls.all().filter('all_users = ',user).get()
        if not existing:
            invitations = None
            if not users.is_current_user_admin():
                invitations = Invitation.all().filter('email_address =',user.email().lower()).fetch(1000)
            if users.is_current_user_admin() or invitations:
                existing = cls(
                    tick_name       = user.nickname(),
                    email_address   = user.email(),
                    all_users       = [user],
                    all_user_ids    = [user.user_id()],
                    )
                existing.put()
                # add inviters as followers
                if invitations:
                    from follow import Follow
                    for invite in invitations:
                        Follow.add_follower(existing,invite.inviter)
                # add default lists
                from ticklist import TickList
                from setlist import SetList
                TickList.create_list('Suggestions for Tick','public')
                getting_started = SetList.all(keys_only=True).filter('name =','getting started with tick').get()
                if getting_started:
                    TickList.create_from_setlist('Getting Started',getting_started.id())
                TickUserStat.generate_stats(existing) # TODO: create a new stats infrastructure
            else:
                raise NotInvitedError('not invited')
        return existing

    def gravatar_link(self,size=24):
        processed = self.email_address.strip().lower()
        md5hash = md5(processed).hexdigest()
        return "http://www.gravatar.com/avatar/%s?d=identicon&s=%s" % (md5hash,size)

class TickUserStat(db.Model):
    user = db.ReferenceProperty(TickUser, required=True)
    name = db.StringProperty(required=True)
    value = db.IntegerProperty(required=True)
    # auditing
    updated = db.DateTimeProperty(auto_now=True)        

    @transactional
    @classmethod
    def increment_user_stat(cls,user,name,amt):
        tick_user = TickUser.all().filter('all_users = ',user).get()
        stat = cls.all().ancestor(tick_user).filter('name = ',name).get()
        if stat:
            stat.value += 1
        else:
            stat = cls(user=user,name=name,value=amt,parent=tick_user)
        stat.put()

    @classmethod
    def generate_stats(cls,user=None):
        ''' 
            builds stats from scratch if there are any missing
            the method is VERY inefficient so it should be avoided at all costs
            normally we should increment just the stats we are changing 
            it also only collects stats for the first 1000 lists belonging to a user
        '''
        from ticklist import TickList, TickTask        
        # lists
        if user:
            lists = TickList.all().filter('owner =',TickUser.get_current_user()).filter('deleted =',False).fetch(1000)
        else:
            lists = TickList.all().filter('deleted =',False).fetch(1000)
        lists_complete = len([ lst for lst in lists if not lst.open ])
        tasks_created = 0
        tasks_complete = 0
        for lst in lists:
            tasks_created += lst.num_tasks
            tasks_complete += lst.num_completed_tasks
        # TODO: cache this in memcached
        return {
            'lists created':    len(lists),
            'tasks created':    tasks_created,
            'tasks complete':   tasks_complete,
            'lists complete':   lists_complete,
            }          

class Invitation(Audited):
    email_address = db.StringProperty()
    inviter = db.ReferenceProperty(TickUser)
    sent = db.BooleanProperty(default=False)

    @staticmethod
    def make_key_name(user_key,email_address):
        return '%s||%s' % (user_key.id(), email_address)

    @classmethod
    def have_invited(cls,user,email_address):
        return cls.get_by_key_name(cls.make_key_name(user,email_address),parent=user) is not None

    @classmethod
    def invite(cls,orig_email_address):
        email_address = orig_email_address.lower()
        if not mail.is_email_valid(email_address):
            raise Exception('invalid email address')
        current_user = TickUser.get_current_user(keys_only=True)
        key_name = cls.make_key_name(current_user,email_address)
        invitation = cls.get_or_insert(key_name=key_name,parent=current_user,email_address=email_address,inviter=current_user,sent=False)
        if invitation.sent == False:
            result = cls.sendmail(email_address)
            invitation.sent = True
            invitation.put()
        return invitation
    
    @staticmethod
    def sendmail(email_address):
        current_user = TickUser.get_current_user()
        from_user = current_user.full_name or current_user.tick_name or current_user.email_address
        if not mail.is_email_valid(email_address):
            raise Exception('invalid email address')

        message = mail.EmailMessage()
        message.sender = 'chees Tick <thecheesun@gmail.com>'
        message.to = email_address
        message.subject = '%s is inviting you to join Tick!' % from_user
        message.body = """
Hi!

%s has invited you to Tick, an online application where you can get yourself and your friends organised by using lists of items, sharing set lists, and more!

We're in ALPHA testing, which means you are one of the first users of the app and you'll be able to help decide how Tick turns out!

Simply go to http://test.thecheesun.com/tick and log in using your google account, we've already got your account ready and waiting!

Regards,
The Tick Team
        """ % from_user
        message.send()

    
        
    
    
    

