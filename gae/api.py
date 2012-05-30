from tick.tick import TickListSave, TickListLoad, SetListSave, SetListFind, SetListLoad, UserFollow, UserFind, SetListShare, TickListShare, UserUpdate, SetListUse, TickListVersion, UserInvite, TickListUpdate, Recommend, TickListFind

from tick.models import SearchIndexing, SearchDeindexing, Permissioning, ActivityFanout

from google.appengine.ext import webapp
import wsgiref.handlers
from google.appengine.ext.webapp.util import run_wsgi_app

def main():
  application = webapp.WSGIApplication(
    [
      ('/tick/api/listsave', TickListSave),
      ('/tick/api/listload', TickListLoad),
      ('/tick/api/ticklistshare', TickListShare),
      ('/tick/api/ticklistversion', TickListVersion),      
      ('/tick/api/ticklistfind', TickListFind),
      ('/tick/api/setlistsave', SetListSave),   
      ('/tick/api/setlistfind', SetListFind),
      ('/tick/api/setlistload', SetListLoad),      
      ('/tick/api/setlistshare', SetListShare), 
      ('/tick/api/setlistuse', SetListUse),            
      ('/tick/api/userfollow', UserFollow),
      ('/tick/api/userfind', UserFind),
      ('/tick/api/userupdate', UserUpdate),      
      ('/tick/api/userinvite', UserInvite),            
      ('/tick/api/ticklistupdate', TickListUpdate),    
      ('/tick/api/recommend', Recommend),    

      ('/tick/tasks/permissioning', Permissioning),      
      ('/tick/tasks/searchindexing', SearchIndexing),
      ('/tick/tasks/searchdeindexing', SearchDeindexing),      
      ('/tick/tasks/activityfanout', ActivityFanout),
     
    ],
    debug=True)
  #wsgiref.handlers.CGIHandler().run(application)
  run_wsgi_app(application)

if __name__ == '__main__':
  main()
