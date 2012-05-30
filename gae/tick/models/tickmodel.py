from google.appengine.ext import db

#import logging

class TickModelError(Exception):
    pass

class TickModel(db.Model):
    __initialized = False # will be set to true at the end of init, and is used by our overloaded __setattr__
    
    def __init__(self,*args,**kwargs):
        super(TickModel,self).__init__(*args,**kwargs)
        self.__before_put_triggers = []
        self.__after_put_triggers = []
        self.__capabilities = []
        self.__to_simple_default_fields = set(['id'])
        self.__to_simple_field_mappings = {
            'id'        : lambda x: x.key().id(), 
            'kind'      : lambda x: x.kind(),   
            'kind_lower': lambda x: x.kind().lower(),               
            }        
        self.__changed_attributes = set()
        self.__just_created = not self.is_saved() # this allows after put triggers to fire on the first creation only
        self.__initialized = True # this must be the last line in the __init__        

    # introspection
    
    def __setattr__(self,attribute,value):
        if self.__initialized:
            self.__changed_attributes.add(attribute)
        return super(TickModel,self).__setattr__(attribute,value)

    def attribute_changed(self,attribute):
        return attribute in self.__changed_attributes        

    def just_created(self):
        return self.__just_created

    def add_capability(self,capability):
        self.__capabilities.append(capability)

    def get_capabilities(self):
        return list(self.__capabilities)
    
    # triggers
    
    def add_before_put_trigger(self,trigger):
        # adds a trigger, call this in the __init__
        # dont try to add a parent or key here, because Model.__init__ does some funky stuff
        self.__before_put_triggers.append(trigger)

    def add_after_put_trigger(self,trigger):
        # adds a trigger, call this in the __init__
        self.__after_put_triggers.append(trigger)

    def put(self,*args):
        for trigger in self.__before_put_triggers:
            trigger(self)  
        result = db.Model.put(self,*args)
        for trigger in self.__after_put_triggers:
            trigger(self)
        # clear attributes changed before the last put
        # not sure if we should do this yet. depends on the typical life-cycle of a TickModel instance      
        # it's a question of whether we want to know whether it changed since it was loaded,
        # or whether the current values are different from what's in the datastore <-- current meaning
        self.__changed_attributes = set() 
        self.__just_created = False
        return result

    # representation

    def add_to_simple_default_fields(self,fields):
        self.__to_simple_default_fields.update(fields)

    def add_to_simple_field_mapping(self,field,lamb):
        # lamb should be a lambda function taking the self argument
        self.__to_simple_field_mappings[field] = lamb
        
    def to_simple(self,fields=[]):
        output = {}
        output_fields = self.__to_simple_default_fields | set(fields)
        for field in output_fields:
            if field in self.__to_simple_field_mappings:
                output[field] = self.__to_simple_field_mappings[field](self)
            else:
                try:
                    output[field] = getattr(self,field)
                except AttributeError:
                    pass                    
        #logging.warning(output)
        return output 


        

