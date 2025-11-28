from app import app, db, Produto

def fix_names():
    with app.app_context():
        products = Produto.query.all()
        count = 0
        for p in products:
            old_name = p.nome
            new_name = ' '.join(old_name.split()).title()
            
            if old_name != new_name:
                print(f"Renaming ID {p.id}: '{old_name}' -> '{new_name}'")
                p.nome = new_name
                count += 1
        
        if count > 0:
            db.session.commit()
            print(f"Successfully updated {count} product names.")
        else:
            print("No products needed updating.")

if __name__ == '__main__':
    fix_names()
