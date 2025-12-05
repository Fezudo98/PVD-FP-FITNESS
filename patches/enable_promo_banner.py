import sys
import os

# Adiciona o diretório atual ao path para importar app.py
sys.path.append(os.getcwd())

from app import app, db, Configuracao

def enable_promo():
    with app.app_context():
        print("--- Verificando configuração do banner de promoção ---")
        
        # Configs to check/create
        configs = {
            'promo_primeira_compra_ativo': 'True',
            'promo_primeira_compra_percent': '20'
        }
        
        changed = False
        
        for key, default_val in configs.items():
            config = Configuracao.query.filter_by(chave=key).first()
            if not config:
                print(f"Criando configuração '{key}' com valor '{default_val}'...")
                new_config = Configuracao(chave=key, valor=default_val)
                db.session.add(new_config)
                changed = True
            elif config.valor != default_val and key == 'promo_primeira_compra_ativo':
                 # Force enable if it exists but is False (assuming user wants it fixed finding)
                 # Actually, let's just make sure it's True since the user complained it's missing.
                 if config.valor != 'True':
                     print(f"Atualizando '{key}' de '{config.valor}' para 'True'...")
                     config.valor = 'True'
                     changed = True
            elif config.valor == 'True':
                print(f"Configuração '{key}' já está ativa.")

        if changed:
            db.session.commit()
            print("Configurações de promoção atualizadas com sucesso!")
        else:
            print("Nenhuma alteração necessária.")

if __name__ == "__main__":
    enable_promo()
