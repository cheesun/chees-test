from google.appengine.ext import db

from audited import Audited
from permissioned import Permissioned
from util import transactional
from tickuser import TickUser


class Tag(Permissioned, Audited):
    #user = db.ReferenceProperty(required=True)
    #user_id = db.StringProperty(required=True)
    target_kind = db.StringProperty(required=True)
    target = db.ReferenceProperty(required=True)
    
    def __init__(self,*args,**kwargs):
        #raise Exception('args: %s, kwargs: %s'%(args,kwargs))
        super(Tag,self).__init__(*args,**kwargs)
    
    @staticmethod
    def make_key_name(tickuser,target):
        try:
            tickuser_key = tickuser.key()
        except AttributeError:
            tickuser_key = tickuser
        try:
            target_key = target.key()
        except AttributeError:
            target_key = target    
        return '%s||%s' % (tickuser_key.id(),target_key.id())
    
    @classmethod
    @transactional
    def add(cls,tickuser,target):
        tag_key = Tag.make_key_name(tickuser,target)
        existing_tag = cls.get_by_key_name(tag_key,parent=target)
        if existing_tag:
            return False
        args = {'key_name': tag_key,
                'parent': target, 
                'target': target,
                'target_kind': target.kind(), 
                'owner' : tickuser,
                }       
        cls(**args).put()
        return True

    @classmethod
    @transactional
    def remove(cls,tickuser,target):
        tag_key = Tag.make_key_name(tickuser,target)
        existing_tag = cls.get_by_key_name(tag_key,parent=target)
        if existing_tag:
            existing_tag.delete()
            return True    
        return False    
    
    @classmethod
    def can_tag(cls,target,user=None):
        if not user:
            user = TickUser.get_current_user(keys_only=True)
        if not user:
            return False
        tag_key = Tag.make_key_name(user,target)
        return cls.get_by_key_name(tag_key,parent=target) is None   
        
class Like(Tag):        
    @classmethod
    def can_like(cls,*args,**kwargs):
        '''maps to: Tag.can_tag(target,user)'''
        return super(Like,cls).can_tag(*args,**kwargs)
    
    @classmethod
    @transactional
    def add(cls,user,target): 
        try:
            target.likes += 1
            target.put()
        except AttributeError: 
            pass
        return super(Like,cls).add(user,target)

    @classmethod
    @transactional
    def remove(cls,user,target):
        raise Error('cannot unlike %ss' % target.kind())

    @classmethod
    def add_like(cls,kind,id):
        user = TickUser.get_current_user()
        existing = kind.get_by_id(id)    
        if not existing:
            raise Exception('%s does not exist' % kind.kind())
        result = cls.add(user,existing)
        if not result:
            raise Exception('%s already favourited' % kind.kind())  
        return existing
        
class Favourite(Tag):
    @classmethod
    @transactional
    def add(cls,user,target):
        try:
            target.favourites += 1
            target.put()
        except AttributeError:
            pass
        return super(Favourite,cls).add(user,target)

    @classmethod
    @transactional
    def remove(cls,user,target):
        try:
            target.favourites = max(0,target.favourites-1)
            target.put()
        except AttributeError:
            pass
        return super(Favourite,cls).remove(user,target)
    
    @classmethod
    def get_favourites(cls,target_kind,limit=50):
        current = TickUser.get_current_user(keys_only=True)
        faves = cls.all().filter('owner =',current).filter('target_kind =',target_kind).fetch(limit)
        return faves
        
    @classmethod
    def set_favourite(cls,kind,id,status):
        user = TickUser.get_current_user()
        if not user:
            raise Exception('not logged in')
        existing = kind.get_by_id(id)    
        if not existing:
            raise Exception('%s does not exist' % kind.kind())
        if status:
            result = cls.add(user,existing)
            if not result:
                raise Exception('%s already favourited' % kind.kind())         
        else:
            result = cls.remove(user,existing)        
            if not result:
                raise Exception('%s is not a favourite' % kind.kind()) 
        return existing
