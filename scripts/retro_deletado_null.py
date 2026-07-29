import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from config import Config
from app.models import Produto

app = create_app(Config)

def fix_deletado_null():
    with app.app_context():
        # Acha todos os produtos onde a flag deletado é NULL e atualiza para False
        produtos_afetados = Produto.query.filter(Produto.deletado.is_(None)).update({'deletado': False})
        db.session.commit()
        print(f"[Retroatividade] {produtos_afetados} produtos atualizados: 'deletado' de NULL para False.")

if __name__ == '__main__':
    fix_deletado_null()
