#!/usr/bin/python2.5
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
from google.appengine.ext import db  
from google.appengine.datastore import entity_pb  
from google.appengine.api import memcache

import logging

from tick.lrucache import LRUCache, CacheKeyError

class TwoLevelCache(object):
    '''
        uses both a simple LRUCache and Memcached
    '''
    def __init__(self,size=32000):
        self.cache = LRUCache(size=size)

    def get(self,key):
        # TODO: randomly go to memcached directly once in a while, that way we can invalidate if it's gone from there      
        try:
            #logging.warning('local cache hit for %s' % key)
            return self.cache[key]          
        except CacheKeyError:
            result = from_binary(memcache.get(key))
            if result:
                self.set(key,result)
            return result
     
    def set(self,key,value):
        self.cache[key] = value
        memcache.set(key,to_binary(value))

    def invalidate_cache(self,key):
        try:
            del self.cache[key]
        except CacheKeyError:
            pass
        memcache.delete(key)

# the module provides a cache at the instance level. 
# use this mainly for stuff you know wont change, as cache invalidation will not filter to other instances
instance_cache = TwoLevelCache()

def get(key):
    return instance_cache.get(key)
    
def set(key,value):
    return instance_cache.set(key,value)
    
def invalidate_cache(key):
    return instance_cache.invalidate_cache(key)    

def memoize_result(key,funct,*args,**kwargs):
    '''given a key, memoizes the result of a function in memcache'''
    result = get(key) #from_binary(memcache.get(key))
    if not result:
        #logging.warning('cache miss: %s' % key)
        result = funct(*args,**kwargs)
        set(key,result) #memcache.set(key,to_binary(result))
    else:
        #logging.warning('cache hit %s' % key)
        #logging.warning(result)
        pass
    return result


# functions to (de)serialise objects to be stored in memcached
def to_binary(data):
  """ compresses entities or lists of entities for caching.

  Args: 
        data - arbitrary data input, on its way to memcache
  """ 
  if isinstance(data, db.Model):
    # Just one instance
    return makeProtoBufObj(data)
  # if none of the first 5 items are models, don't look for entities
  elif isinstance(data,list) and any(isinstance(x, db.Model) for x in data):
    # list of entities
    entities = []
    for obj in data:
      # if item is entity, convert it.
      if isinstance(obj, db.Model):
       protobuf_obj = makeProtoBufObj(obj)
       entities.append(protobuf_obj)
      else:
       entities.append( obj )
    buffered_list = ProtoBufList(entities)
    return buffered_list
  else: # return data as is  
    return data

def from_binary(data):
  """ decompresses entities or lists from cache.

  Args: 
        data - arbitrary data input from memcache
  """ 
  if isinstance(data, ProtoBufObj):
    # Just one instance
    return db.model_from_protobuf(entity_pb.EntityProto(data.val))
  elif isinstance(data,ProtoBufList):
     entities = []
     for obj in data.vals:
       # if item is entity, convert it. 
       if isinstance(obj, ProtoBufObj):
         model_class = obj.model_class
         entities.append(db.model_from_protobuf(
         entity_pb.EntityProto(obj.val)) )
       else:
         entities.append( obj )    
    
     return entities
  else: # return data as is 
    return data

class ProtoBufObj():
  """ special type used to identify protobuf objects """
  def __init__(self, val, model_class): 
    self.val = val
    self.model_class = model_class 
    # model class makes it unnecessary to import model classes
  
class ProtoBufList():
  """ special type used to identify list containing protobuf objects """
  def __init__(self, vals):
    self.vals = vals

def makeProtoBufObj(obj):
  val = db.model_to_protobuf(obj).Encode()
  model_class =  db.class_for_kind(obj.kind())
  return ProtoBufObj(val, model_class) 

