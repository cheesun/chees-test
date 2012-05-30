from google.appengine.ext import db
from google.appengine.api import users

from tickmodel import TickModel

class Audited(TickModel):
    creator_id = db.StringProperty()
    created = db.DateTimeProperty(auto_now_add=True)
    updater_id = db.StringProperty()
    updated = db.DateTimeProperty(auto_now=True)        

    def __init__(self,*args,**kwargs):
        super(Audited,self).__init__(*args,**kwargs)

        def before_put_trigger(this):
            if not this.is_saved():
                this.creator_id = users.get_current_user().user_id()
            else:
                this.updater_id = users.get_current_user().user_id()


        self.add_before_put_trigger(before_put_trigger)
        
        #from tickuser import TickUser
        
        self.add_to_simple_field_mapping('creator',lambda this: TickUser.get_by_user_id(this.creator_id).tick_name)
        self.add_to_simple_field_mapping('updater',lambda this: TickUser.get_by_user_id(this.updater_id).tick_name)        


