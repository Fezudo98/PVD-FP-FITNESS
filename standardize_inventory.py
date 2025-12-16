import sys
import os
import re
from unicodedata import normalize
from app import app, db, Produto

def slugify(text):
    """Gera um slug limpo a partir do texto."""
    if not text:
        return ""
    text = normalize('NFKD', text).encode('ASCII', 'ignore').decode('ASCII')
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text

def standardize_products():
    print("=== INICIANDO PADRONIZAÇÃO DE ESTOQUE ===")
    
    with app.app_context():
        produtos = Produto.query.all()
        changes_count = 0
        
        for p in produtos:
            original_sku = p.sku
            original_nome = p.nome
            
            # 1. Padronizar Nome (Title Case, Trim)
            new_nome = " ".join(p.nome.split()).title()
            
            # 2. Padronizar Atributos (Safe Access)
            cor = p.cor if p.cor else "UNICA"
            tamanho = p.tamanho if p.tamanho else "U"
            
            # 3. Gerar Novo SKU
            # Padrão: nome-slug-cor-tamanho
            # Ex: legging-max-lupo-verde-g
            nome_slug = slugify(new_nome)
            cor_slug = slugify(cor)
            tamanho_slug = tamanho.upper().replace(" ", "")
            
            new_sku = f"{nome_slug}-{cor_slug}-{tamanho_slug}"
            
            # Verificar mudanças
            changed = False
            msg = f"Produto ID {p.id}:"
            
            if original_nome != new_nome:
                p.nome = new_nome
                msg += f"\n  - Nome: '{original_nome}' -> '{new_nome}'"
                changed = True
                
            if original_sku != new_sku:
                # Check collision
                existing = Produto.query.filter_by(sku=new_sku).first()
                if existing and existing.id != p.id:
                    print(f"  [ALERTA] Colisão de SKU evitada para ID {p.id}. SKU '{new_sku}' já existe em ID {existing.id}. Mantendo original.")
                else:
                    p.sku = new_sku
                    msg += f"\n  - SKU: '{original_sku}' -> '{new_sku}'"
                    changed = True
            
            if changed:
                print(msg)
                changes_count += 1
        
        if changes_count > 0:
            print(f"\nTotal de produtos alterados: {changes_count}")
            
            # Check for auto mode
            if "--auto" in sys.argv:
                print("Modo automático ativado. Aplicando alterações...")
                try:
                    db.session.commit()
                    print("Alterações salvas com sucesso!")
                except Exception as e:
                    db.session.rollback()
                    print(f"Erro ao salvar: {e}")
            else:
                user_input = input("Deseja aplicar estas alterações no banco de dados? (S/N): ")
                if user_input.lower() == 's':
                    try:
                        db.session.commit()
                        print("Alterações salvas com sucesso!")
                    except Exception as e:
                        db.session.rollback()
                        print(f"Erro ao salvar: {e}")
                else:
                    print("Operação cancelada. Nenhuma alteração feita.")
        else:
            print("\nNenhuma alteração necessária. O estoque já está padronizado.")

if __name__ == "__main__":
    standardize_products()
