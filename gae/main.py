from tick.tick import ListShow, Index, ListTickLists, Utility, ListSetLists, SetListShow, Profile #ListLists

from google.appengine.ext import webapp
import wsgiref.handlers
from google.appengine.ext.webapp.util import run_wsgi_app

def main():
  application = webapp.WSGIApplication(
    [
      ('/tick/ticklist/(.*)',ListShow),
      ('/tick/setlist/(.*)',SetListShow),
      ('/tick/setlists',ListSetLists),      
      ('/tick/ticklists',ListTickLists),
      ('/tick/?',Index),
      ('/tick/utility',Utility),
      ('/tick/tickuser/?(.*)',Profile),
    ],
    debug=True)
  #wsgiref.handlers.CGIHandler().run(application)
  run_wsgi_app(application)

if __name__ == '__main__':
  main()
