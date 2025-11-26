from app import app, db, Produto

def seed_products():
    with app.app_context():
        # Check if products exist
        if Produto.query.filter_by(online_ativo=True).first():
            print("Products already exist.")
            return

        products = [
            Produto(
                sku='LEG001',
                nome='Legging Premium Black',
                categoria='Legging',
                cor='Preto',
                tamanho='M',
                preco_custo=50.0,
                preco_venda=129.90,
                quantidade=100,
                online_ativo=True,
                descricao='Legging de alta compressão e conforto.',
                destaque=True,
                imagem_url='cat-legging.jpg'
            ),
            Produto(
                sku='TOP001',
                nome='Top Fitness Support',
                categoria='Top',
                cor='Rosa',
                tamanho='M',
                preco_custo=30.0,
                preco_venda=89.90,
                quantidade=50,
                online_ativo=True,
                descricao='Top com sustentação reforçada.',
                destaque=True,
                imagem_url='cat-top.jpg'
            ),
            Produto(
                sku='CONJ001',
                nome='Conjunto Power',
                categoria='Conjunto',
                cor='Azul',
                tamanho='G',
                preco_custo=80.0,
                preco_venda=199.90,
                quantidade=20,
                online_ativo=True,
                descricao='Conjunto completo para seu treino.',
                destaque=False
            )
        ]

        db.session.add_all(products)
        db.session.commit()
        print("Seed data added successfully.")

if __name__ == '__main__':
    seed_products()
