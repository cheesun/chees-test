from google.appengine.ext import db
from google.appengine.api import users

from tickmodel import TickModel

from datetime import datetime, timedelta
from dateutil import relativedelta 

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

        from tickuser import TickUser
        self.add_to_simple_field_mapping('creator',lambda this: TickUser.get_by_user_id(this.creator_id).tick_name)
        self.add_to_simple_field_mapping('creator_gravatar',lambda this: TickUser.get_by_user_id(this.creator_id).gravatar_link())
        self.add_to_simple_field_mapping('updater',lambda this: TickUser.get_by_user_id(this.updater_id).tick_name)
        self.add_to_simple_field_mapping('updater_gravatar',lambda this: TickUser.get_by_user_id(this.updater_id).gravatar_link())
        self.add_to_simple_field_mapping('age',lambda this: this.age())

    def age(self,updated=False,refdate=None):
        if not refdate:
            refdate = datetime.now()
        if updated: 
            rd = relativedelta.relativedelta (refdate,self.updated)
        else: # we are looking for created
            rd = relativedelta.relativedelta (refdate,self.created)
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
