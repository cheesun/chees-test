from google.appengine.ext import db
from google.appengine.api import users
from google.appengine.api.labs import taskqueue
from google.appengine.ext import webapp

from tickmodel import TickModel, TickModelError
from tickuser import TickUser
from permissionindex import PermissionIndex

import cache

class Permissioned(TickModel):
    owner = db.ReferenceProperty(TickUser)
    #owner_id = db.StringProperty()
    sharing = db.StringProperty(default='private',choices=['private','public','specific'])
    specified_permissions = db.ListProperty(str)
    PERMISSION_INDEX_TYPE = None

    def __init__(self,*args,**kwargs):
        super(Permissioned,self).__init__(*args,**kwargs)

        def before_put_trigger(this):
            if not this.is_saved():
                if not this.owner:
                    this.owner = TickUser.get_current_user(keys_only=True) #TickUser.get_by_user_id(users.get_current_user().user_id(),keys_only=True)

        self.add_before_put_trigger(before_put_trigger)

        # because searchables do their own permissioning, only handle default case
        def after_put_trigger(this):
            if this.is_saved() and this.attribute_changed('sharing'):
                this.enqueue_permissioning('/tick/tasks/permissioning')

        self.add_after_put_trigger(after_put_trigger)

        self.add_to_simple_field_mapping('owner',lambda this: this.get_and_cache_owner().tick_name)
        self.add_to_simple_field_mapping('owner_gravatar',lambda this: this.get_and_cache_owner().gravatar_link())
        self.add_to_simple_field_mapping('owner_id',lambda this: this.get_owner_key().id())

    def get_index_keys(self):
        target = self.PERMISSION_INDEX_TYPE
        return target.all(keys_only=True).ancestor(self.key()).fetch(1000)

    def get_and_cache_owner(self):
        cache_key = 'TickUser(%s)' % self.get_owner_key()
        owner = cache.get(cache_key)
        if not owner:
            owner = self.owner
            cache.set(cache_key,owner)
        return owner

    def get_owner_key(self):
        return self.__class__.owner.get_value_for_datastore(self)

    def can_edit(self,user=None):
        if not user:
            user = users.get_current_user()
        if not user:
            return False
        # also allow the creator - this is a hack
        # ^ maybe not? it's a good way to ensure the creator can always edit no matter what happens to the permissionindex
        if user.user_id() == self.creator_id: #in self.owner.all_user_ids:
            return True
        target = self.PERMISSION_INDEX_TYPE.all(keys_only=True).ancestor(self.key())
        check = target.filter('edit_permissions =',user.user_id()).get()
        return check is not None

    def can_view(self,user=None):
        if self.sharing == 'public':
            return True
        if not user:
            user = users.get_current_user()
        # TODO: remove this hack and the one above
        # in order to do this we need to be able to guarantee that the permissionsindex will be ready as soon as the object is accessed
        if user and user.user_id() == self.creator_id: #in self.owner.all_user_ids:
            return True
        target = self.PERMISSION_INDEX_TYPE.all(keys_only=True).ancestor(self.key())
        if user:
            check = target.filter('view_permissions =',user.user_id()).get()
        else:
            check = target.filter('view_permissions =','public').get()
        return check is not None

    def permission(self,index_entries=None,edit_user_ids=[],view_user_ids=[]):
        if not index_entries:
            try:
                index_entries = db.get(self.get_index_keys())
            except TickModelError:
                return

        view_permissions,edit_permissions=self.base_permissions()

        # create an entry if there arent any
        if not index_entries:
            if self.PERMISSION_INDEX_TYPE != PermissionIndex:
                # if the subclass is not using the default permissionindex we dont want to create any
                return
            new_index_entry = self.PERMISSION_INDEX_TYPE(
                parent = self,
                edit_permissions = edit_permissions,
                view_permissions = view_permissions)
            new_index_entry.put()

            index_entries = [new_index_entry]

        else:
            for entry in index_entries:
                entry.view_permissions = view_permissions
                entry.edit_permissions = edit_permissions

        '''
        # add new ids
        orig_view_permissions = index_entries[0].view_permissions
        orig_edit_permissions = index_entries[0].edit_permissions

        new_view_permissions = [user_id for user_id in view_user_ids if user_id not in orig_view_permissions]
        new_edit_permissions = [user_id for user_id in edit_user_ids if user_id not in orig_edit_permissions]

        for entry in index_entries:
            entry.view_permissions.extend(new_view_permissions)
            entry.edit_permissions.extend(new_edit_permissions)
        '''

        db.put(index_entries)

    def base_permissions(self):
        return (self.base_view_permissions(),self.base_edit_permissions())

    def base_view_permissions(self):
        # TODO: in future, this will create a list including: the owner, friends, and 'public' if required
        output = list(self.owner.all_user_ids) #[TickUser.self.__class__.owner.get_value_for_datastore(self)]
        if self.sharing == 'public':
            from follow import Follow
            [output.extend(tick_user.all_user_ids) for tick_user in Follow.get_followers(self.owner)]
            output.append('public')
        elif self.sharing == 'specific':
            output.extend(self.specified_permissions)
        return output

    def base_edit_permissions(self):
        output = self.owner.all_user_ids #[TickUser.self.__class__.owner.get_value_for_datastore(self)]
        return output

    @staticmethod
    def set_sharing(entity,sharing):
        if sharing not in ['public','private']:
            raise ValueError('sharing setting of %s is illegal, must be "private" or "public"' % sharing)
        entity.sharing = sharing
        entity.put()

    def enqueue_permissioning(self, url):
        if url:
            params = {'key': str(self.key())}
            taskqueue.add(url=url,params=params)

class Permissioning(webapp.RequestHandler):
    def post(self):
        key_str = self.request.get('key')
        if key_str:
            key = db.Key(key_str)
            entity = db.get(key)
            if not entity:
                self.response.set_status(200)   # Clear task because it's a bad key
            else:
                entity.permission()
