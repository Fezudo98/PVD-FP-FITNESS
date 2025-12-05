import sys
import os

# Adiciona o diretório atual ao path para importar app.py
sys.path.append(os.getcwd())

from app import app, db, Produto

def enable_products():
    with app.app_context():
        print("--- Verificando visibilidade dos produtos na loja ---")
        produtos = Produto.query.all()
        count_enabled = 0
        count_stock_warning = 0
        
        for p in produtos:
            # Habilita o produto se estiver desabilitado
            if not p.online_ativo:
                p.online_ativo = True
                count_enabled += 1
            
            # Apenas avisa se o estoque for 0 (não altera estoque para não gerar inconsistência)
            if p.quantidade <= 0:
                print(f"ALERTA: Produto '{p.nome}' (SKU: {p.sku}) está habilitado mas com ESTOQUE ZERO. Não aparecerá na loja.")
                count_stock_warning += 1

        if count_enabled > 0:
            db.session.commit()
            print(f"Sucesso: {count_enabled} produtos tiveram a visibilidade 'Online' ativada.")
        else:
            print("Todos os produtos já estavam marcados como 'Online Ativo'.")
            
        if count_stock_warning > 0:
            print(f"Nota: {count_stock_warning} produtos estão sem estoque e podem não aparecer na loja.")

if __name__ == "__main__":
    enable_products()
