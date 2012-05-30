from google.appengine.ext import db
from google.appengine.api import users

from rated import Rated
from permissioned import Permissioned
from permissionindex import PermissionIndex
from audited import Audited
from util import slugify, transactional, TaskTree, truncate_words
from setlist import SetList
from tickuser import TickUser
from search import Searchable, StemmedIndex
from tickmodel import TickModel

import cache

import logging

class ListTypeQuery:
    '''
        Simulates a datastore query but only returns a static set of results when fetching
    '''
    def __init__(self,this):
        self.this = this
        self.done = False
    def filter(self,*args,**kw):
        self.done = True
        return self
    def order(self,*args,**kw):
        self.done = True
        return self
    def fetch(self,*args,**kw):
        if self.done:
            return []
        list_type = self.this.list_type
        self.done = True
        if list_type:
            return [list_type]
        else:
            return []

def ListTypeQueryGenerator(this):
    return ListTypeQuery(this)

def build_task_path(tasks):
    if len(tasks) == 0:
        return ''
    end = truncate_words(tasks[-1].text,10)
    if len(tasks) > 1:
        start = truncate_words(tasks[0].text,5)
        if len(tasks) > 2:
            words_used = 15 - len(start.split(' ')) - len(end.split(' '))
            show = max(2,min(5,(20-words_used)/(len(tasks)-2)))
            middle = [truncate_words(task.text,show) for task in tasks[1:-1]]
            return ' > '.join([start]+middle+[end])
        else:
            return ' > '.join([start,end])
    else:
        return end
        
            
class TickList(Searchable, Rated, Permissioned, Audited):
    # list attributes
    name = db.StringProperty(required=True)
    slug = db.StringProperty(required=True)
    next_task_id = db.IntegerProperty(required=True)
    open = db.BooleanProperty(required=True)
    deleted = db.BooleanProperty(required=True,default=False)
    list_type = db.ReferenceProperty(SetList)
    num_tasks = db.IntegerProperty(default=-1)
    num_completed_tasks = db.IntegerProperty(default=-1)
    version = db.IntegerProperty(required=True,default=0) # incremented each time the list or any of its tasks changes

    INDEX_ONLY = ['name']
    INDEX_TITLE_FROM_PROP = 'name'
    INDEX_ORDERING_FUNCT = lambda this: -float('%s.%s' % (this.updated.strftime('%s'),this.updated.microsecond))

    PERMISSION_INDEX_TYPE = StemmedIndex #PermissionIndex
    
    def __init__(self,*args,**kwargs):
        super(TickList,self).__init__(*args,**kwargs)

        # this must happen in the __init__ because TickTask isnt defined when TickList is being defined
        self.INDEX_SUBENTITY_QUERIES = [
            (lambda this: TickTask.all().ancestor(this).filter('parent_task =',None).filter('deleted =',False),['text']),
            (lambda this: ListTypeQueryGenerator(this),['name']),
            ]

        self.add_to_simple_default_fields(['id','name','next_task_id'])
        self.add_to_simple_field_mapping('can_edit',lambda this: this.can_edit())
        self.add_to_simple_field_mapping('top_task_path',lambda this: build_task_path(this.get_path_to_top_task()))

        def after_put_trigger(this):
            if this.attribute_changed(this.INDEX_TITLE_FROM_PROP):
                this.indexed_title_changed(ordinal_changed=True)             
            else:
                this.indexed_ordinal_changed()
            #if this.attribute_changed(this.version):
            #    this.enqueue_indexing(url='/tick/tasks/searchindexing')
                    
        self.add_after_put_trigger(after_put_trigger)

    def get_path_to_top_task(self):
        cache_key = '%s.get_path_to_top_task(%s,%s)'%(self.__class__.__name__,self.key().id(),self.version)
        path = cache.get(cache_key)
        if not path:
            candidates = TickTask.all().ancestor(self).filter('prev_sibling =',None).filter('deleted =',False).fetch(1000)
            if candidates:               
                mapping = {}
                for candidate in candidates:
                    mapping[candidate.id] = candidate
                    if candidate.parent_task == None:
                        parent = candidate
                current = parent
                path = [current]
                while current.first_child is not None:
                    current = mapping[current.first_child]
                    path.append(current)
            else:
                path = []
            cache.set(cache_key,path)
        return path

    @classmethod
    def get_my_lists(cls,limit=50):
        owner = TickUser.get_current_user(keys_only=True)
        lists = cls.all().filter('deleted =',False).filter('owner =',owner).order('-updated').fetch(limit)
        return lists        

    @classmethod
    def get_lists(cls,limit=50):
        user = users.get_current_user()
        ticklist_keys = set([])
        index_keys = set([])
        if user:
            # get all your latest lists just in case they arent indexed yet
            owner = TickUser.get_current_user(keys_only=True)
            ticklist_keys.update(cls.all(keys_only=True).filter('deleted =',False).filter('owner =',owner).order('-updated').fetch(limit))
            # get all the other lists you have permission to see, up till the limit
            index_keys.update(cls.PERMISSION_INDEX_TYPE.all(keys_only=True).filter('parent_kind =',cls.__name__).order('ordinal').filter('view_permissions =',user.user_id()).fetch(limit-len(ticklist_keys)))
        else:
            index_keys.update(cls.PERMISSION_INDEX_TYPE.all(keys_only=True).filter('parent_kind =',cls.__name__).order('ordinal').filter('view_permissions =','public').fetch(limit))
        ticklist_keys.update([key.parent() for key in index_keys])
        lists = db.get(ticklist_keys)
        non_deleted = [item for item in lists if item.deleted == False]
        return sorted(non_deleted,key=lambda x: x.updated,reverse=True)
        
    @classmethod
    @transactional    
    def save_list_items(cls,id,ver,inserts,updates,deletes):
        '''
        given a set of changes to tasks in a list
        save them to the datastore in a transaction
        id      :- output of <List instance>.key().id()
        ver     :- version that the changes should be built upon
        inserts :- [{'id':'','text':'','complete':'','parent':'','prev':'','next':'','first':'','last':''},...]
        updates :- [{'id':'',...},...]
        deletes :- [{'id':'',...},...]
        '''    
        l = cls.get_list(id)
        if not l.can_edit():
            raise Exception('you do not have permissions to edit this checklist')
        if l.version > ver:
            raise Exception('checklist has been changed on the server since your last save, please reload.')
        elif l.version < ver:
            raise Exception('local checklist is corrupt, please reload.')
        
        # deltas for tracking new (total) and completed tasks    
        total = 0
        compl = 0
        
        # flags
        reindex = False 
        
        # change tasks for this list
        for i in inserts:
            logging.warning(l.next_task_id)
            t = TickTask.create_task(l,i)
            total += 1
            if 'complete' in i and i['complete'] is True:
                compl += 1
            if t.parent_task == None:
                reindex = True

        for u in updates:
            t = TickTask.update_task(l,u)
            if 'complete' in u:
                if u['complete'] is True:
                    compl += 1
                else:
                    compl -= 1                
            if t.parent_task == None and ('text' in u or 'parent' in u):
                reindex = True

        for d in deletes:
            t = TickTask.delete_task(l,d)
            total -= 1
            if 'complete' in d and d['complete'] is True:
                compl -= 1
            if t.parent_task == None:
                reindex = True

        l.version += 1
        if l.num_tasks < 0 or l.num_completed_tasks < 0 or l.num_completed_tasks > l.num_tasks:
            # something is wrong, recalculate basis stats
            prepare = TickTask.all().ancestor(l).filter('deleted = ',False)
            l.num_tasks = prepare.count()
            l.num_completed_tasks = prepare.filter('complete = ',True).count()        
        l.num_tasks += total
        l.num_completed_tasks += compl
        l.put()
        logging.warning(l.next_task_id)
        if reindex:
            l.enqueue_indexing(url='/tick/tasks/searchindexing',delay=30,condition=('version',l.version))
        return l
        
    @classmethod
    def get_list(cls,id):
        existing_list = cls.get_by_id(id)
        if not existing_list:
            raise Exception('list does not exist')
        if not existing_list.can_view(): 
            raise Exception('you do not have permissions to view this ticklist')    
        return existing_list
        
    @classmethod
    @transactional
    def get_list_and_tasks(cls,list_id):
        ticklist = cls.get_list(list_id)
        tasks = TickTask.all().ancestor(ticklist).filter('list =',ticklist).filter('deleted =',False).fetch(1000)
        return (ticklist,tasks)

    @classmethod
    def create_list(cls,name,sharing='private'):
        owner = TickUser.get_current_user(keys_only=True)
        slug = slugify(name)
        exists = cls.all(keys_only=True).filter('slug =',slug).filter('owner =',owner).filter('deleted =',False).count(1)
        if exists > 0:
            raise Exception('active list of this name already exists')
        new_list = cls(
            name = name,
            slug = slug,
            next_task_id = 0,
            owner = owner,
            open = True,
            num_tasks = 0,
            num_completed_tasks = 0,
            sharing=sharing,
            )
        new_list.put()
        new_list.enqueue_indexing(url='/tick/tasks/searchindexing',condition=('version',new_list.version))        
        return new_list    

    @classmethod
    @transactional
    def delete_list(cls,id):
        existing_list = cls.get_list(id)
        if not existing_list.can_edit():
            raise Exception('you are not allowed to delete this list')
        if existing_list.deleted:
            raise Exception('list already deleted')        
        existing_list.deleted = True
        existing_list.put()
        existing_list.enqueue_deindexing(url='/tick/tasks/searchdeindexing')
        return existing_list

    @classmethod
    @transactional
    def close_list(cls,id):
        owner = users.get_current_user()
        existing_list = cls.get_list(id)
        if not existing_list.open:
            raise Exception('list already closed')        
        if not existing_list.num_completed_tasks == existing_list.num_tasks:
            raise Exception('list not complete')
        existing_list.open = False
        existing_list.put()
        return existing_list

    @classmethod
    def create_from_setlist(cls,name,type_id):
        setlist,tasks = SetList.get_setlist_and_tasks(type_id)
        inserts = []
        tree = TaskTree()
        for task in tasks:
            tree.add_node(task.parent_task, task.id, task.text, task.notes)
        inserts = tree.get_flat()
        new_list = cls.create_list(name)
        #new_list.num_tasks = len(tasks)
        new_list.list_type = setlist
        new_list.put()
        cls.save_list_items(new_list.key().id(),new_list.version,inserts,[],[])
        new_list.enqueue_indexing(url='/tick/tasks/searchindexing',condition=('version',new_list.version))                
        return (setlist,new_list)
        
class TickTask(db.Model):
    # task attributes
    id = db.IntegerProperty(required=True)
    list = db.ReferenceProperty(TickList)
    text = db.StringProperty(required=True)
    complete = db.BooleanProperty(required=True,default=False)
    locked = db.BooleanProperty(required=True,default=False)
    notes = db.TextProperty()
    comments = db.TextProperty()
    # tree attributes
    parent_task = db.IntegerProperty()
    prev_sibling = db.IntegerProperty()
    next_sibling = db.IntegerProperty()
    first_child = db.IntegerProperty()
    last_child = db.IntegerProperty()
    # auditing
    deleted = db.BooleanProperty(required=True,default=False)
    created = db.DateTimeProperty(auto_now_add=True)
    updated = db.DateTimeProperty(auto_now=True)

    _key_mappings = {
        'prev'      : 'prev_sibling',
        'next'      : 'next_sibling',
        'parent'    : 'parent_task',
        'first'     : 'first_child',
        'last'      : 'last_child',
    }     

    def __init__(self,*args,**kwargs):
        super(TickTask,self).__init__(*args,**kwargs)

        '''self.add_to_simple_default_fields(['id','text','complete','parent','prev','next','first','last','notes'])
        self.add_to_simple_field_mapping('prev',lambda this: this.prev_sibling)
        self.add_to_simple_field_mapping('next',lambda this: this.next_sibling)
        self.add_to_simple_field_mapping('parent',lambda this: this.parent_task)
        self.add_to_simple_field_mapping('first',lambda this: this.first_child)
        self.add_to_simple_field_mapping('last',lambda this: this.last_child)'''

    @classmethod
    @transactional
    def create_task(cls,l,data):
        # ensure that the next_task_id is kept in front of the actual tasks being created
        if l.next_task_id <= data['id']:
            l.next_task_id = data['id'] + 1
            l.put()
        newTask = cls(
            id = data['id'],
            list = l,
            text = data['text'],
            complete = data['complete'],
            parent_task = data['parent'],
            prev_sibling = data['prev'],
            next_sibling = data['next'],
            first_child = data['first'],
            last_child = data['last'],      
            notes = data['notes'],  
            parent = l # belongs to the list's entity group
            )
        newTask.put()
        return newTask
        
    @classmethod
    def update_task(cls,list,changes):
        if not changes:
            return
        t = cls.all().ancestor(list).filter('list =', list).filter('id =', changes['id']).get()
        changed = None
        for key in changes:
            # currently, we map client tasks to server tasks here
            # TODO: implement a better, more manageable way
            if key == 'id':
                # this should be the same so just leave it alone
                continue
            else:        
                # for all other keys, check the key mapping and store the data as is
                mapped = cls._key_mappings.get(key,key)       
                if mapped == 'complete' and changes[key] != t.complete:
                    changed = changes[key]
                setattr(t,mapped,changes[key])
        t.put()
        return t
        
    @classmethod
    def delete_task(cls,list,task):
        try:
            id = task['id']
        except TypeError,KeyError:
            id = task
        t = cls.all().ancestor(list).filter('list =', list).filter('id =', id).get()
        t.parent_task = None
        t.next_task = None
        t.prev_task = None
        t.deleted = True
        t.put()
        return t
        
    def to_string(self):
        return str((id,text,complete,parent_task,prev_task,next_task,first_child,last_child))

    def to_simple(self):
        output = {
            'id'        : self.id,
            'text'      : self.text,
            'complete'  : self.complete,
            'parent'    : self.parent_task,
            'prev'      : self.prev_sibling,
            'next'      : self.next_sibling,
            'first'     : self.first_child,
            'last'      : self.last_child,
            'notes'     : self.notes
        }
        return output

