from google.appengine.ext import db
from google.appengine.api import users

from rated import Rated
from permissioned import Permissioned
from audited import Audited
from search import Searchable, StemmedIndex
from util import TaskTree, slugify, transactional
from tickuser import TickUser

class SetList(Searchable, Rated, Permissioned, Audited):
    # model list attributes
    name = db.StringProperty(required=True)
    slug = db.StringProperty(required=True)
    description = db.StringProperty(required=True,multiline=True)
    deleted = db.BooleanProperty(required=True,default=False)
    based_on = db.SelfReferenceProperty() # if this list is based on another one, or is a new version of it, reference it.
    
    # search and indexing options
    INDEX_ONLY = ['name','description']
    INDEX_TITLE_FROM_PROP = 'name'
    INDEX_ORDERING_FUNCT = lambda this: -float(this.rating)
       
    PERMISSION_INDEX_TYPE = StemmedIndex

    def __init__(self,*args,**kwargs):
        super(SetList,self).__init__(*args,**kwargs)
        self.add_to_simple_default_fields(['name'])
        self.add_to_simple_field_mapping('can_edit',lambda this: this.can_edit())
        # this needs to be done in the constructor because SetTask isnt defined yet when the class is created
        self.INDEX_SUBENTITY_QUERIES = [
            (lambda this: SetTask.all().ancestor(this).filter('deleted =',False),['text'])
            ]


    @classmethod
    def get_my_setlists(cls,limit=50):
        #current = TickUser.get_current_user(keys_only=True)
        #lists = cls.all().filter('deleted =',False).filter('owner =',current).order('-rating').fetch(limit)
        try:
            user_id = users.get_current_user().user_id()
        except AttributeError:
            return []
        keys = cls.PERMISSION_INDEX_TYPE.all(keys_only=True).filter('parent_kind =',cls.__name__).filter('edit_permissions =',user_id).order('-rating').fetch(limit)
        lists = db.get([key.parent() for key in keys])
        return lists
    
    @classmethod
    def get_other_setlists(cls,limit=50):
        #current = TickUser.get_current_user(keys_only=True)
        user = users.get_current_user()
        if user:
            user_id = user.user_id()
            my_keys = cls.PERMISSION_INDEX_TYPE.all(keys_only=True).filter('parent_kind =',cls.__name__).filter('edit_permissions =',user_id).order('-rating').fetch(limit)
        else:
            user_id = 'public'
            my_keys = []
        keys = cls.PERMISSION_INDEX_TYPE.all(keys_only=True).filter('parent_kind =',cls.__name__).filter('view_permissions =',user_id).order('-rating').fetch(limit)
        #lists = cls.all().filter('deleted =',False).filter('owner !=',current).order('owner').order('-rating').fetch(limit)
        lists = db.get([key.parent() for key in keys if key not in my_keys])
        return lists
        
    @classmethod
    def get_setlist(cls,id):
        existing_setlist = cls.get_by_id(id)
        if not existing_setlist:
            raise Exception('setlist does not exist')
        if not existing_setlist.can_view():
            raise Exception('you are not allowed to view this setlist')
        return existing_setlist        
        
    @classmethod
    def get_setlist_and_tasks(cls,id):
        setlist = cls.get_setlist(id)
        tasks = SetTask.all().ancestor(setlist).order('id').fetch(1000)
        return (setlist,tasks)
    
    @classmethod
    def create_setlist(cls,name,description,sharing,tasks,based_on = None):
        # tasks: [ ( id, text, parent, prev, next, first, last, notes ) ]
        new_setlist = cls(
            name = name,
            slug = slugify(name),
            description = description,
            #creator = users.get_current_user(),
            sharing = sharing,
            deleted = False,
            based_on = based_on
            )
        new_setlist.put()
        new_setlist.enqueue_indexing(url='/tick/tasks/searchindexing')       
        
        max_id = 0
        mappings = {}   
        for task in tasks:
            mappings[task[0]] = max_id
            max_id += 1
            try:
                parent_id = mappings[task[2]]
            except KeyError:
                parent_id = None            
            SetTask(
                id = mappings[task[0]],
                setlist = new_setlist,
                text = task[1],
                parent_task = parent_id,
                notes = task[7],
                parent = new_setlist # belongs to the model's entity group            
                ).put()
                
        new_setlist.put()
        return new_setlist

    @classmethod
    @transactional
    def delete_setlist(cls,id):
        existing_list = cls.get_by_id(id)
        if not existing_list:
            raise Exception('setlist does not exist')
        if existing_list.can_edit():
            raise Exception('you are not allowed to delete this setlist')
        if existing_list.deleted:
            raise Exception('setlist already deleted')        
        existing_list.deleted = True
        existing_list.put()
        existing_list.enqueue_deindexing(url='/tick/tasks/searchdeindexing')
        
'''
class TickSetTask(db.Model):
    # model task attributes
    id = db.IntegerProperty(required=True)
    setlist = db.ReferenceProperty(SetList)
    text = db.StringProperty(required=True)    
    parent_task = db.IntegerProperty()
    notes = db.TextProperty()
    comments = db.TextProperty()
    # not audited because we'll always just create a new list   

    def to_simple(self):
        output = {
            'id'        : self.id,
            'text'      : self.text,
            'parent'    : self.parent_task,
            'notes'     : self.notes,
        }
        return output
'''
       
class SetTask(db.Model):
    # model task attributes
    id = db.IntegerProperty(required=True)
    setlist = db.ReferenceProperty(SetList)
    text = db.StringProperty(required=True)    
    parent_task = db.IntegerProperty()
    notes = db.TextProperty()
    comments = db.TextProperty()
    # not audited because we'll always just create a new list   

    def to_simple(self):
        output = {
            'id'        : self.id,
            'text'      : self.text,
            'parent'    : self.parent_task,
            'notes'     : self.notes,
        }
        return output
    
