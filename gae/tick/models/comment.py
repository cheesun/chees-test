from google.appengine.ext import db
from google.appengine.api import users

from permissioned import Permissioned
from permissionindex import PermissionIndex
from audited import Audited
from tickmodel import TickModel

from shardedcounter import get_count, increment


class Comment(Audited):
    ''' Parent := Ticklist or Setlist
        Key Name := Parent||Number
    '''
    target_kind = db.StringProperty(required=True)
    target = db.ReferenceProperty(required=True)
    text = db.StringProperty(required=True,multiline=True)
    reference = db.IntegerProperty()
        
    @staticmethod
    def make_key_name(target,count=None):
        try:
            target_key = target.key()
        except AttributeError: # a key was passed into target, hopefully
            target_key = target
        target_id = target_key.id()
        if not count:
            count = increment('Comment_%s'%target_id)
        return '%s||%012d' % (target_id,count)
        
    @classmethod
    def create(cls,target,text,reference=None):
        # TODO: prevent double posting: add check for whether an identical comment has been posted within the last minute. if it has, dont repeat it.
        new_comment = Comment(target=target,target_kind=target.kind(),text=text,reference=reference,parent=target,key_name=cls.make_key_name(target))
        new_comment.put()
        return new_comment


