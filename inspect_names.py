from app import app, db, Produto
from sqlalchemy import func

with app.app_context():
    names = db.session.query(Produto.nome, func.count(Produto.id)).group_by(Produto.nome).all()
    print("=== Nomes no Banco de Dados ===")
    for n, count in names:
        print(f"'{n}': {count} items")
