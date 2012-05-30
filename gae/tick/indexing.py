from google.appengine.ext import db
from unidecode import unidecode
import string

class TickIndexStats(db.Model):
    ''' stores stats about indexing of each kind '''
    kind = db.StringProperty(required=True)
    shard
    number_indexed_shard = db.IntegerProperty(required=True,default=0)

class TickIndexPhrase(db.Model):
    phrase = db.StringProperty(required=True) # this could be one word or a phrase consisting of space separated words
    number_indexed = db.IntegerProperty(required=True,default=0) # the number of entities indexed for this phrase
    number_existing = db.IntegerProperty(required=True,default=0) # the number of instances of this phrase detected overall
    
class TickIndexEntry(db.Model):
    phrase_key = db.ReferenceProperty(TickIndexKey) # reference to the phrase
    entity_key = db.StringProperty(required=True) # reference to the entity
    score = db.FloatProperty(required=True, default=0) # some score to order the entities, this could probably just be the rating

def index(entity,fields,max_phrase_length=3):
    phrases = set()
    for field in fields:
        text = unidecode(getattr(entity,field)).translate(string.maketrans("",""), string.punctuation).split(' ')
        text_length = len(text)
        for phrase_length in range(max_phrase_length,0,-1):
            for current in range(text_length-phrase_length+1):
                phrases.add(tuple(text[current:current+phrase_length]))
    for phrase in phrases:
        for_key = '.'.join(phrase)
        for_entity = ' '.join(phrase)
        index_entry = TickIndexPhrase.get_or_insert(key_name=consolidated,phrase=for_entity)
        index_entry.number_indexed = index_entry.number_indexed + 1
        index_entry.number_existing = index_entry.number_existing + 1
        
        



        
class TickIndexed(object):
    def enqueue_indexing(self, url, only_index=None):
        """Adds an indexing task to the default task queue.
            
        Args:
            url: String. The url associated with LiteralIndexing handler.
            only_index: List of strings.  Restricts indexing to these prop names.
        """
        if url:
            params = {'key': str(self.key())}
            if only_index:
                params['only_index'] = ' '.join(only_index)
            taskqueue.add(url=url, params=params)    
    
    
