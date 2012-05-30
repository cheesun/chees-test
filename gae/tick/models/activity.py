from google.appengine.ext import db
from google.appengine.api.labs import taskqueue
from google.appengine.ext import webapp
from google.appengine.api import datastore
from google.appengine.api import users

from datetime import datetime, timedelta

from dateutil import relativedelta 

from tickmodel import TickModel
from permissionindex import PermissionIndex
from tickuser import TickUser
from shardedcounter import get_count, increment



class ActivityIndex(PermissionIndex):
    date_key = db.StringProperty(required=True)

    def __init__(self,*args,**kwargs):
        try:
            parent = args[0]
        except IndexError:
            try:
                parent = kwargs['parent']
            except KeyError:
                raise TickModelError('parent must be specified')
        if parent.kind() != 'Activity':
            raise TickModelError('ActivityIndex must be a child of a Activity entity')    
        super(ActivityIndex,self).__init__(*args,**kwargs)

    @staticmethod
    def gen_date_key(date,user_id):
        # be careful: the time format string below is designed to have 12 places to allow comparison of keys in order
        # this will run out in the year 33679 - assuming the year 2038 problem is fixed :)
        # to those that are maintaining the code in 33679CE: sorry! but i'm sure you'll be able to fix it and upgrade properly. 
        # Say high to my descendants for me too!
        count = increment('activity_%s'%user_id)
        return '%s||%s||%s' % (date.strftime('%012s'),user_id,count)

        
class Activity(TickModel):
    grammar = db.StringListProperty() 
    sentence = db.StringProperty() # eg "<actor>|cloned the setlist|<other>|to the ticklist|<target>" ie: "(.*\|)?<(.*)>\|(.*)
    actor = db.ReferenceProperty(TickUser,collection_name='activities_as_actor')
    verb = db.StringProperty()
    target = db.ReferenceProperty(collection_name='activites_as_target') # currently, this should be a Permissioned object/subclass. we use the 'sharing' attribute to determine what to do.
    target_kind = db.StringProperty()
    other = db.ReferenceProperty(collection_name='activites_as_other') # another object that is affected by this activity
    other_kind = db.StringProperty()
    creation_date = db.DateTimeProperty(auto_now_add=True)
    extra_recipients = db.StringListProperty()

    def __init__(self,*args,**kwargs):
        super(Activity,self).__init__(*args,**kwargs)
        def before_put_trigger(this):
            if not self.is_saved():
                if this.target and not this.target_kind:
                    this.target_kind = this.target.kind()
        self.add_before_put_trigger(before_put_trigger)
        def after_put_trigger(this):
            # only do this the first time
            if self.just_created():
                this.enqueue_fanout('/tick/tasks/activityfanout')
        self.add_after_put_trigger(after_put_trigger)
        
        self.add_to_simple_field_mapping('target',lambda this: this.target.to_simple(['gravatar','name']))
        self.add_to_simple_field_mapping('target_kind',lambda this: this.target_kind.lower())
        self.add_to_simple_field_mapping('actor',lambda this: this.actor.to_simple(['gravatar','name']))
        self.add_to_simple_field_mapping('age',lambda this: this.gen_age())
        self.add_to_simple_field_mapping('array', lambda this: this.gen_array())

    @classmethod
    def create(cls,sentence,other=None,target=None,actor=None,extra_recipients=[]):
        expecting = 'text'
        pointers = frozenset(['<actor>','<target>','<other>'])
        grammar = sentence.split('|')
        if grammar[0] in pointers:
            grammar = [''] + grammar
        for token in grammar:
            if expecting == 'text':
                if token in pointers:
                    raise Exception('invalid activity grammar: %s found when text was expected' % token)
                expecting = 'entity'
            else: #entity
                if token not in pointers:
                    raise Exception('invalid activity grammar: "%s" found when <entity> was expected' % token)
                expecting = 'text'
        if not actor:
            actor = TickUser.get_current_user()
            
        # TODO: add check for whether the activity has happened within the last hour. if it has, dont repeat it.
        one_hour_ago = datetime.today() - timedelta(hours=1)
        query = cls.all(keys_only=True)
        if target:
            query = query.ancestor(target)
        existing = query.filter('sentence =',sentence).filter('actor =',actor).filter('target =',target).filter('other =',other).filter('creation_date >',one_hour_ago).get()
        if existing:
            return None
            
        extra = [item for sublist in [extra.all_user_ids for extra in extra_recipients] for item in sublist] # this is a fast and convenient way of flattening the list of lists
        new_entity = cls(parent=target,sentence=sentence,actor=actor,target=target,other=other,extra_recipients=extra)
        new_entity.put()
        return new_entity

    @staticmethod
    def get_recent(date_key=None,actor=None,limit=100):
        if not date_key:
            date_key = '%012d' % (int(datetime.now().strftime('%s')) - (60*60*24*7))
        #raise Exception(datetime.now().strftime('%012s') + ' ' + date_key)
        
        query = ActivityIndex.all(keys_only=True)
        user = users.get_current_user()
        if user:
            user_id = user.user_id()        
        else:
            user_id = 'public'            
        query.filter('view_permissions =',user_id)
        query.filter('date_key >',date_key)
        query.order('-date_key')
        index_entities = query.fetch(limit)
        activities = db.get([entity.parent() for entity in index_entities])
        if actor:
            activities = [a for a in activities if a.actor.key().id() == actor.key().id()]
        return activities

    def gen_array(self):
        # [words,entity,words,entity,words,entity,words]
        # where entity is actor, target or other
        output = []
        for token in self.sentence.split('|'):
            if token == '<actor>':
                output.append(self.actor.to_simple(['gravatar','name','kind_lower']))
            elif token == '<target>':
                output.append(self.target.to_simple(['gravatar','name','kind_lower']))
            elif token == '<other>':
                output.append(self.other.to_simple(['gravatar','name','kind_lower']))
            else:
                output.append({'is_text':True,'text':token})
        output.extend((7-len(output))*[{'is_text':True}]) # pad to 6 values
        return output

    
    def gen_age(self):
        now = datetime.now()
        rd = relativedelta.relativedelta (now,self.creation_date)
        if rd.years > 0:
            return '%d years ago' % rd.year
        elif rd.months > 0:
            return '%d months ago' % rd.months
        elif rd.days > 0:
            return '%d days ago' % rd.days
        elif rd.hours > 0:
            return '%d hours ago' % rd.hours
        elif rd.minutes > 0:
            return '%d minutes ago' % rd.minutes
        elif rd.seconds > 0:
            return '%d seconds ago' % rd.seconds
        return 'some time ago'
    
    def fanout(self):
        from follow import Follow, FollowIndex    
        follower_ids_set = set(self.actor.all_user_ids) # the owner should be able to see this activity
        follower_ids_set.update(set(self.extra_recipients)) # the extra recipients should be able to see it too
        if not hasattr(self.target,'sharing') or self.target.sharing == 'public':
            # if the target is public, so should all his/her followers
            follower_keys = Follow.all(keys_only=True).ancestor(self.actor).fetch(1000)
            for key in follower_keys:
                index_num = 0
                for ind in FollowIndex.all().ancestor(key).fetch(1000):
                    follower_ids_set.update(set(ind.view_permissions))
            if not self.other or not hasattr(self.other,'sharing') or self.other.sharing == 'public':
                # both target and other are public, the activity should be public too
                follower_ids_set.add('public')
        # create an activity index for each 5000 users that can see the activity
        max_list_size = datastore._MAX_INDEXED_PROPERTIES - 1        
        index_num = 1
        act_ind_ents = []
        follower_ids = list(follower_ids_set)
        while (index_num-1)*max_list_size < len(follower_ids):
            date_key = ActivityIndex.gen_date_key(self.creation_date,self.actor.key().id())
            new_act_ind = ActivityIndex(
                parent=self,
                date_key=date_key,
                edit_permissions=[],
                view_permissions=follower_ids[(index_num-1)*max_list_size:index_num*max_list_size])
            act_ind_ents.append(new_act_ind)
            index_num += 1
        db.put(act_ind_ents)

    def enqueue_fanout(self, url):
        if url:
            params = {'key': str(self.key())}
            taskqueue.add(url=url,params=params)


class ActivityFanout(webapp.RequestHandler):
    def post(self):
        key_str = self.request.get('key')
        if key_str:
            key = db.Key(key_str)
            entity = db.get(key)
            if not entity:
                self.response.set_status(200)   # Clear task because it's a bad key
            else:
                entity.fanout()        
                
