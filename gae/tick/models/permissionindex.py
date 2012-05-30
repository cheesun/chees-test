from google.appengine.ext import db

class PermissionIndex(db.Model):
    # TODO: make this support more than 5000 permissions by creating multiple entities
    edit_permissions = db.StringListProperty()
    view_permissions = db.StringListProperty()
    parent_kind = db.StringProperty(required=True)
    
    def __init__(self,*args,**kwargs):
        try:
            parent = args[0]
        except IndexError:
            try:
                parent = kwargs['parent']
            except KeyError:
                raise TickModelError('parent must be specified')                     
        if 'parent_kind' not in kwargs:
            kwargs['parent_kind'] = parent.kind()

        if len(args) < 1 and 'key_name' not in kwargs:
            kwargs['key_name'] = PermissionIndex.get_index_key_name(parent)
        super(PermissionIndex,self).__init__(*args,**kwargs)

    @staticmethod
    def get_index_key_name(parent, index_num=1):
        key = parent.key()
        return '%s||%s||%s' % (key.kind(),key.id_or_name(),index_num)

    '''def regenerate_permissions(self):
        self.edit_permissions = self.parent.gen_edit_permissions()
        self.view_permissions = self.parent.get_view_permissions()'''

