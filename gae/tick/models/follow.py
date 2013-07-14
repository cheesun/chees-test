from google.appengine.ext import db

from audited import Audited
from permissioned import PermissionIndex
from util import transactional
from tickuser import TickUser


class FollowIndex(PermissionIndex):
    def __init__(self,*args,**kwargs):
        super(FollowIndex,self).__init__(*args,**kwargs)

    def add_followers(self,follower_ids):
        self.view_permissions.extend(follower_ids)

    def add_leaders(self,leader_ids):
        self.edit_permissions.extend(leader_ids)

    def remove_follower(self,follower_id):
        self.view_permissions.remove(follower_id)

    def remove_leader(self,leader_id):
        self.edit_permissions.remove(leader_id)

class Follow(Audited):
    #follower = db.ReferenceProperty(TickUser, required=True, collection_name='followers')
    #followee = db.ReferenceProperty(TickUser, required=True, collection_name='followees')
    leader_id = db.IntegerProperty(required=True) # TickUser id
    follower_ids = db.ListProperty(int) # list of TickUser ids

    @classmethod
    @transactional
    def add_follower(cls,leader,follower):
        # TODO: expand to handle more than 5000 followers, using extra entities
        follower_id = follower.key().id() #TickUser.get_by_user_id(follower.user_id(),keys_only=True).id()
        leader_id = leader.key().id()
        check = cls.all(keys_only=True).ancestor(leader).filter('followers_ids =',follower_id).get()
        if not check:
            entity = cls.all().ancestor(leader).filter('leader_id =',leader_id).get()
            if entity:
                entity.follower_ids.append(follower_id)
                index = entity.get_follow_index()
                index.add_followers(follower.all_user_ids)
                index.put()
                entity.put()
            else:
                new_entity = cls(parent=leader,leader_id=leader_id,follower_ids=[follower_id])
                new_entity.put()
                new_index = FollowIndex(parent=new_entity)
                new_index.add_leaders(leader.all_user_ids)
                new_index.add_followers(follower.all_user_ids)
                new_index.put()
            from activity import Activity
            Activity.create('<actor>|began following|<target>',actor=follower,target=leader,extra_recipients=[leader])
            return True
        else:
            return False

    @staticmethod
    @transactional
    def remove_follower(leader,follower):
        follower_id = follower.key().id()
        existing = Follow.all().ancestor(leader).filter('leader_id =',leader.key().id()).filter('follower_ids =',follower_id).get()
        if not existing:
            return False
        existing.follower_ids.remove(follower_id)
        existing.put()
        # do dependent index
        index = existing.get_follow_index()
        for user_id in follower.all_user_ids:
            index.remove_follower(user_id)
        index.put()
        from activity import Activity
        Activity.create('<actor>|stopped following|<target>',actor=follower,target=leader,extra_recipients=[leader])
        return True

    @classmethod
    def get_followers(cls,leader):
        try:
            leader_key = leader.key()
        except AttributeError:
            leader_key = leader
        entity = cls.all().filter('leader_id =',leader_key.id()).get()
        if entity:
            return [TickUser.get_by_id(tickuser_id) for tickuser_id in entity.follower_ids]
        else:
            return []

    @classmethod
    def get_leaders(cls,follower):
        # TODO: make this work for more than 1000 leaders
        try:
            follower_key = follower.key()
        except AttributeError:
            follower_key = follower

        entities = cls.all().filter('follower_ids =',follower.id()).fetch(1000)
        return [TickUser.get_by_id(entity.leader_id) for entity in entities]

    def get_follow_index(self,keys_only=False):
        return FollowIndex.all(keys_only=keys_only).ancestor(self).get()

    @classmethod
    def get_friends(cls,user):
        try:
            user_key = user.key()
        except AttributeError:
            user_key = user
        entity = cls.all().filter('leader_id =',user_key.id()).get()
        entities = cls.all().filter('follower_ids =',user_key.id()).fetch(1000)
        ids = set(entity.follower_ids) | set([entity.leader_id for entity in entities])
        return [TickUser.get_by_id(id) for id in ids]

    @classmethod
    def already_following(cls,leader,follower):
        check = cls.all(keys_only=True).ancestor(leader).filter('follower_ids =',follower.key().id()).get()
        return check is not None


