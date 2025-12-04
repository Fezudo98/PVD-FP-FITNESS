from app import app, db, Produto, ItemVenda, Venda
from sqlalchemy import func

with app.app_context():
    with open('sorting_result.txt', 'w', encoding='utf-8') as f:
        f.write("--- Best Sellers Query ---\n")
        best_sellers_query = db.session.query(
            Produto.nome, 
            func.sum(ItemVenda.quantidade).label('total_sold')
        ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
         .group_by(Produto.nome)\
         .order_by(func.sum(ItemVenda.quantidade).desc())\
         .limit(5).all()
        
        best_seller_names = []
        for r in best_sellers_query:
            f.write(f"Name: {r.nome}, Sales: {r.total_sold}\n")
            best_seller_names.append(r.nome)
        
        f.write("\n--- Main Query (Simulated) ---\n")
        subquery_sales = db.session.query(
            Produto.nome.label('p_nome'),
            func.sum(ItemVenda.quantidade).label('total_sales')
        ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
         .group_by(Produto.nome).subquery()
        
        query = db.session.query(
            Produto.nome,
            subquery_sales.c.total_sales
        ).filter(Produto.online_ativo == True, Produto.quantidade > 0)
        
        query = query.outerjoin(subquery_sales, Produto.nome == subquery_sales.c.p_nome)
        query = query.order_by(subquery_sales.c.total_sales.desc().nullslast(), Produto.nome.asc())
        query = query.group_by(Produto.nome)
        
        results = query.all()
        
        f.write(f"{'Name':<30} | {'Sales':<10} | {'Badge?'}\n")
        f.write("-" * 50 + "\n")
        for r in results:
            badge = "YES" if r.nome in best_seller_names else "NO"
            f.write(f"{r.nome:<30} | {str(r.total_sales):<10} | {badge}\n")
