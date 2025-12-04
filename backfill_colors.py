from app import app, db, Produto

color_map = {
    'preto': '#000000',
    'branco': '#FFFFFF',
    'cinza': '#808080',
    'azul': '#0000FF',
    'vermelho': '#FF0000',
    'verde': '#008000',
    'amarelo': '#FFFF00',
    'rosa': '#FFC0CB',
    'roxo': '#800080',
    'laranja': '#FFA500',
    'bege': '#F5F5DC',
    'marrom': '#A52A2A',
    'vinho': '#800000',
    'marinho': '#000080',
    'ciano': '#00FFFF',
    'magenta': '#FF00FF',
    'lilas': '#C8A2C8',
    'coral': '#FF7F50',
    'turquesa': '#40E0D0',
    'dourado': '#FFD700',
    'prata': '#C0C0C0',
    'goiaba': '#E0555D' # Approximate guava color
}

with app.app_context():
    products = Produto.query.all()
    count = 0
    for p in products:
        if p.cor:
            cor_lower = p.cor.lower().strip()
            if cor_lower in color_map:
                p.cor_hex = color_map[cor_lower]
                count += 1
            else:
                # Try partial match or leave empty
                pass
    
    db.session.commit()
    print(f"Updated {count} products with hex colors.")
