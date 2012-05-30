# Make webapp.template use django 1.2
webapp_django_version = '1.2'

# enable stats
def webapp_add_wsgi_middleware(app):
    from google.appengine.ext.appstats import recording
    app = recording.appstats_wsgi_middleware(app)
    return app
