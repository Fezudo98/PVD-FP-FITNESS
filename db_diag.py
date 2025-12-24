from app import create_app, db
from app.models import Usuario, Configuracao

from config import Config
app = create_app(Config)

with open('diag_result.txt', 'w', encoding='utf-8') as f:
    with app.app_context():
        f.write("--- Users ---\n")
        users = Usuario.query.all()
        for u in users:
            f.write(f"User: {u.nome}, Role: {u.role}, Email: {u.email}\n")

        f.write("\n--- Configurations ---\n")
        try:
            configs = Configuracao.query.all()
            if not configs:
                f.write("No configurations found (Table is empty).\n")
            for c in configs:
                f.write(f"Key: {c.chave}, Value: {c.valor}\n")
        except Exception as e:
            f.write(f"Error querying Configuracao: {e}\n")

        f.write("\n--- Test Update ---\n")
        try:
            f.write("Attempting to set SYSTEM_THEME to 'natal'...\n")
            config = Configuracao.query.filter_by(chave='SYSTEM_THEME').first()
            if config:
                config.valor = 'natal'
                f.write("Updated existing config.\n")
            else:
                novo_config = Configuracao(chave='SYSTEM_THEME', valor='natal')
                db.session.add(novo_config)
                f.write("Created new config.\n")
            db.session.commit()
            f.write("Commit successful.\n")
            
            # Verify
            stored = Configuracao.query.filter_by(chave='SYSTEM_THEME').first()
            f.write(f"Verified Value inside DB: {stored.valor}\n")
            
        except Exception as e:
            f.write(f"Error updating config: {e}\n")
