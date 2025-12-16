import os
import subprocess
import sys

def run_command(command):
    print(f"Executando: {command}")
    try:
        subprocess.check_call(command, shell=True)
        print("Sucesso!")
    except subprocess.CalledProcessError as e:
        print(f"Erro ao executar '{command}': {e}")
        sys.exit(1)

def main():
    print("=== Atualizando para v3.5.0 (Sistema Manual e Ordenação de Fotos) ===")
    
    # 1. Aplicar Migrações de Banco de Dados
    print("\n[1/2] Aplicando migrações de banco de dados (campo 'ordem')...")
    # Garante que estamos no diretório correto
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    run_command("flask db upgrade")
    
    print("\n[2/2] Atualização Concluída!")
    print(" - Tabela ProdutoImagem atualizada com campo 'ordem'.")
    print(" - Manual do Sistema adicionado.")
    print(" -> Reinicie o servidor Flask para aplicar as mudanças.")

if __name__ == "__main__":
    main()
