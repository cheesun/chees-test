from google.appengine.ext import db

from tickmodel import TickModel

class Rated(TickModel):
    favourites = db.IntegerProperty(default=0)
    likes = db.IntegerProperty(default=0)
    rating = db.IntegerProperty(default=1)
    # TODO: in future, create bloom filters to detect whether a certain user has already liked/favourited or not.

    def __init__(self,*args,**kwargs):
        super(Rated,self).__init__(*args,**kwargs)

        def before_put_trigger(this):
            old_rating, this.rating = this.rating, (this.favourites + 1) * (this.likes + 1)
            if old_rating != this.rating and this.is_saved():
                try:
                    this.update_rating()
                except AttributeError:
                    # this model isnt searchable
                    pass
          

        self.add_before_put_trigger(before_put_trigger)   
