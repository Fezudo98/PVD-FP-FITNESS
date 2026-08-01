from flask import Flask
from .extensions import db, migrate, bcrypt, cors
from datetime import datetime
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
    cors.init_app(app, resources={r"/api/*": {"origins": app.config.get('CORS_ORIGINS')}})
    
    from .extensions import limiter
    limiter.init_app(app)

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

    @app.context_processor
    def inject_template_globals():
        termos_versao = app.config.get('TERMOS_VERSAO', '')
        try:
            termos_versao_formatada = datetime.strptime(termos_versao, '%Y-%m-%d').strftime('%d/%m/%Y')
        except (ValueError, TypeError):
            termos_versao_formatada = termos_versao
        return {
            'current_year': datetime.now().year,
            'termos_versao': termos_versao,
            'termos_versao_formatada': termos_versao_formatada
        }

    # Iniciar Cronjobs em Background (Apenas no processo principal do Werkzeug/Gunicorn para não duplicar, mas o APScheduler lida bem com Gunicorn)
    if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        from .scheduler import init_scheduler
        app.scheduler = init_scheduler(app)

    return app
