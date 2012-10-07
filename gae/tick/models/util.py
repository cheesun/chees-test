from google.appengine.ext import db
from unidecode import unidecode
import sys

import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'settings'
from google.appengine.dist import use_library
use_library('django', '1.2')
from django.template import defaultfilters

def transactional(funct):
    def f(*args,**kw):
        try:
            return db.run_in_transaction(funct,*args,**kw)
        except db.BadRequestError, e:
            if e.args[0] == 'Nested transactions are not supported.':
                return funct(*args,**kw)
            else:
                exc_info = sys.exc_info()
                raise exc_info[1], None, exc_info[2]            
    return f  

def slugify(text):
    return unicode(defaultfilters.slugify(unidecode(text)))

def truncate_words(text,num_words):
    return defaultfilters.truncatewords(text,num_words)

class TaskTree:
    '''
        structure specifically for building full relationships for each task stored in a setlist
        tasks must be added in order using add_node
    '''
    class TaskTreeNode:
    
        def __init__(self,tid=-1,text='',notes=''):
            self.tid = tid
            self.text = text
            self.prev = None
            self.next = None        
            self.first = None
            self.last = None
            self.pid = None
            self.notes = notes             
            
        def add_child(self,child):
            child.pid = self.tid
            if self.first == None:
                child.prev = None
                child.next = None
                self.first = child
                self.last = child
            else:
                self.last.next = child
                child.prev = self.last
                child.next = None
                self.last = child

        def to_dict(self):
            output = {
                'id':       self.tid,
                'text':     self.text,
                'complete': False,
                'parent':   self.pid,
                'notes':    self.notes,
                'prev':     None,
                'next':     None,
                'first':    None,
                'last':     None,
                }       
            if self.prev:
                output['prev'] = self.prev.tid
            if self.next:
                output['next'] = self.next.tid
            if self.first:
                output['first'] = self.first.tid
            if self.last:
                output['last'] = self.last.tid
            return output                
                
        def flatten(self):
            output = []
            # for everything other than the root
            if self.tid >= 0:
                output.append(self.to_dict())
            current = self.first
            while current:
                output.extend(current.flatten())
                current = current.next
            return output    

    def __init__(self):
        self.toplevel = []
        self.tasks = {}
        
    def reset(self):
        self.toplevel = []
        self.tasks = {}
        
    def add_node(self,pid,tid,text,notes):
        new_node = self.__class__.TaskTreeNode(tid,text,notes)
        self.tasks[tid] = new_node
        if pid is None:
            self.toplevel.append(new_node)
        else:
            self.tasks[pid].add_child(new_node)
        
    def get_flat(self):
        output = []
        for current in self.toplevel:
            output.extend(current.flatten())
        return output
        
        
class ListHash:
    @classmethod
    def build_hash(cls,tasks):
        hash = cls()
        for task in tasks:
            hash.add_item(task)            
        return hash

    @staticmethod
    def fnv_1a_64(input):
        '''
            FNV hash - simple and fast compared to secure hashes
            this function allows us to keep hashing consistent across platforms and language
            the client will use this too
            the initial number and the multiple are defined by the algorithm, for 64bits
            http://isthe.com/chongo/tech/comp/fnv/
        '''
        hash = 14695981039346656037L
        for c in input:
            hash ^= long(ord(c))
            hash = (hash * 1099511628211L) & 0xFFFFFFFFFFFFFFFF
        return hash       
            
    @staticmethod
    def hash_task(task):
        return self.fnv_1a_64(task.to_string())

    def _xor_into(self,hash):
        self.value ^= hash
    
    def remove_item(task):
        self._xor_into(self.hash_task(task))
        
    def add_item(task):
        self._xor_into(hash_task(task))
        
    def __init__(self,initial=0L):
        self.value = long(initial)

        
