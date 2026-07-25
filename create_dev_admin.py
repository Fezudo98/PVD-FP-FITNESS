from app import create_app, db
from app.models import Usuario
from flask_bcrypt import Bcrypt
from config import Config

app = create_app(Config)
bcrypt = Bcrypt(app)

with app.app_context():
    # Verifica se já existe
    dev = Usuario.query.filter_by(email='dev@fpfitness.com').first()
    if not dev:
        novo_admin = Usuario(
            nome="Desenvolvedor",
            email="dev@fpfitness.com",
            senha_hash=bcrypt.generate_password_hash('dev123456').decode('utf-8'),
            role='admin'
        )
        db.session.add(novo_admin)
        db.session.commit()
        print("Admin criado com sucesso!")
    else:
        print("Admin de desenvolvedor já existia.")
