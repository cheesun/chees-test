from google.appengine.ext import db
from google.appengine.ext import webapp

import wsgiref.handlers
from google.appengine.ext.webapp import template

import random
import sys



class Elo:
  grade_rating = {
    "o" : 2000.0,
    "a" : 1700.0,
    "b" : 1400.0,
    "c" : 1100.0,
    "d" : 800.0,
    "e" : 500.0,   
    }

  @staticmethod
  def k_factor(games_played):
    return 800/(2*(games_played+1))

  @staticmethod
  def q_factor(rating):
    return pow(10,rating/400.0)

  @staticmethod
  def expectation(ra,rb):
    qa = Elo.q_factor(ra)
    qb = Elo.q_factor(rb)
    return qa/(qa+qb)

  @staticmethod
  def update(ra,rb,ga,gb,sa):
    sb = 1.0 - sa
    ea = Elo.expectation(ra,rb)
    eb = 1.0 - ea
    rda = ra + Elo.k_factor(ga) * (sa - ea)
    rdb = rb + Elo.k_factor(gb) * (sb - eb)
    return (rda,rdb)


class Ancestor(db.Model):
  name = db.StringProperty()
  @classmethod
  def get_root(cls):
    return cls.all().filter("name =","root").get()
  
class Player(db.Model):
  name = db.StringProperty()
  comps = db.IntegerProperty(default=0)
  rating = db.FloatProperty(default=5000)
  
class Comparison(db.Model):
  winner = db.ReferenceProperty(Player,collection_name="comparisons_won")
  loser = db.ReferenceProperty(Player,collection_name="comparisons_lost")
  
  @classmethod
  def do_comparison(cls,winner,loser,root):
    w = Player.all().ancestor(root).filter("name =",winner).get()
    l = Player.all().ancestor(root).filter("name =",loser).get()
    if not w or not l:
      raise Exception('players dont exist')
    cls(winner=w,loser=l,parent=root).put()
    w.rating, l.rating = Elo.update(w.rating,l.rating,w.comps,l.comps,1.0)
    w.comps += 1
    l.comps += 1
    w.put()
    l.put()
    
class Init(webapp.RequestHandler):
  def get(self):
    root = Ancestor.all().filter("name =","root").get()
    if not root:
      Ancestor(name="root").put()
      message = "ranker initialized"
    else:
      message = "ranker already initialized: no action taken"
    return self.response.out.write(template.render('init.html',{"message":message}))   

class Add(webapp.RequestHandler):
  def get(self):
    message = self.request.get("message")
    data = {
      "message" : message
      }
    return self.response.out.write(template.render('add.html',data))   
  def post(self):
    name = self.request.get('name').lower()
    rating = Elo.grade_rating[self.request.get('grade').lower()]
    existing = Player.all().filter("name =",name).get()
    if existing:
      self.redirect("add?message=did not add: %s already existed" % name)
    else:
      Player(name=name, rating=rating, parent=Ancestor.get_root()).put()  
      self.redirect("add?message=added: %s" % name)    

class Ask(webapp.RequestHandler):
  def get(self):
    message = self.request.get("message")
    try:
      players1 = Player.all().order("comps").fetch(10)
      player1 = random.choice(players1)
      players2 = Player.all().filter("name !=",player1.name).order("-name").fetch(1000)
      players2 = [player for player in players2 if abs(player1.rating-player.rating)< 300]
      player2 = random.choice(players2)
      data = {
        "message" : message, 
        "player1" : player1.name,
        "player2" : player2.name, 
        }
    except IndexError:
      data = {
        "message" : "not enough players", 
        "player1" : "undefined",
        "player2" : "undefined", 
        }
    return self.response.out.write(template.render('ask.html',data))    

  def post(self):
    winner = self.request.get('winner')
    loser = self.request.get('loser')
    root = Ancestor.get_root()
    try:  
      db.run_in_transaction(Comparison.do_comparison,winner,loser,root)
      self.redirect("ask?message=last match: you picked %s to beat %s" % (winner,loser))
    except Exception, e:
      self.redirect("ask?message=did not save: %s" % e)


class Index(webapp.RequestHandler):
  def get(self):
    return self.response.out.write(template.render('index.html',None))    
    
    
class Rank(webapp.RequestHandler):
  def get(self):
    data = {
      "players" : Player.all().order("-rating").fetch(1000)
      }
    return self.response.out.write(template.render('rank.html',data))        
    
    
def main():
  application = webapp.WSGIApplication(
    [
      #('/ask', Ask),
      ('/ranker/', Rank),      
      #('/add', Add),
      #('/init', Init),      
      #('/index', Index),            
      ('/ranker/rank', Rank), 
    ],
    debug=True)
  wsgiref.handlers.CGIHandler().run(application)

if __name__ == '__main__':
  main()
