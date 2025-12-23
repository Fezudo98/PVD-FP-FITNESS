from flask import Flask
from .extensions import db, migrate, bcrypt, cors
import os

def create_app(config_class):
    # static_folder='../static' because app/__init__.py is in app/, so static is in ../static
    # template_folder='../frontend' because templates are there
    app = Flask(__name__, 
                template_folder=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend')),
                static_folder=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static')))
    
    app.config.from_object(config_class)

    # Init Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    cors.init_app(app)

    # Register Blueprints
    from .routes.auth import auth_bp
    app.register_blueprint(auth_bp)
    
    from .routes.admin import admin_bp
    app.register_blueprint(admin_bp)
    
    from .routes.store import store_bp
    app.register_blueprint(store_bp)
    
    from .routes.api import api_bp
    app.register_blueprint(api_bp)

    from .routes.resources import resources_bp
    app.register_blueprint(resources_bp)

    return app
