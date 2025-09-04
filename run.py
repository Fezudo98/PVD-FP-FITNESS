import os
import subprocess
import sys

# --- Configurações ---
VENV_DIR = "venv"
REQUIREMENTS_FILE = "requirements.txt"

# --- Importa as funções de backup ---
try:
    from backup_manager import create_backup, cleanup_old_backups
    backup_module_found = True
except ImportError:
    backup_module_found = False

def print_header(title):
    """Imprime um cabeçalho formatado."""
    print("=" * 60)
    print(title.center(60))
    print("=" * 60)
    print()

def get_venv_python():
    """Retorna o caminho para o executável Python dentro do venv."""
    if sys.platform == "win32":
        return os.path.join(VENV_DIR, "Scripts", "python.exe")
    else:  # Para macOS/Linux
        return os.path.join(VENV_DIR, "bin", "python")

def setup_environment():
    """Verifica se o venv existe e instala as dependências. Retorna True se tudo ocorrer bem."""
    print_header("VERIFICANDO AMBIENTE DO SISTEMA")
    
    # 1. Cria o ambiente virtual se ele não existir
    if not os.path.exists(VENV_DIR):
        print(f"Pasta '{VENV_DIR}' não encontrada. Criando ambiente virtual...")
        try:
            subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
            print("Ambiente virtual criado com sucesso.")
        except subprocess.CalledProcessError:
            print("ERRO FATAL: Falha ao criar o ambiente virtual.")
            return False
    
    venv_python_path = get_venv_python()

    # 2. Instala as dependências usando o pip do ambiente virtual
    print(f"Instalando/verificando dependências do '{REQUIREMENTS_FILE}'...")
    try:
        # Usamos o Python do venv para garantir que o pip correto seja usado
        subprocess.run(
            [venv_python_path, "-m", "pip", "install", "-r", REQUIREMENTS_FILE],
            check=True,
            capture_output=True, # Esconde a longa saída do pip
            text=True
        )
        print("Dependências instaladas com sucesso.")
        print()
        return True
    except FileNotFoundError:
        print(f"ERRO FATAL: O arquivo '{REQUIREMENTS_FILE}' não foi encontrado.")
        return False
    except subprocess.CalledProcessError as e:
        print("ERRO FATAL: Falha ao instalar as dependências via pip.")
        print("Verifique seu arquivo 'requirements.txt' e a conexão com a internet.")
        print("Detalhes do erro:", e.stderr) # Mostra o erro do pip
        return False

def main():
    """Função principal que orquestra tudo."""
    # Passo 1: Configurar o ambiente (venv e pip install)
    if not setup_environment():
        return  # Para a execução se a configuração falhar
    
    # Passo 2: Executar a rotina de backup
    if backup_module_found:
        print_header("ROTINA DE BACKUP")
        create_backup()
        cleanup_old_backups()
        print("--- FIM DA ROTINA DE BACKUP ---")
        print()
    else:
        print("[AVISO] O arquivo 'backup_manager.py' não foi encontrado. Pulando etapa de backup.\n")
    
    # Passo 3: Exibir instruções e iniciar o servidor
    print_header("SERVIDOR PRONTO PARA INICIAR")
    print("-> Para usar o sistema, abra seu navegador e acesse: http://localhost:5000")
    print()
    print("+-----------------------------------------------------+")
    print("|   !!! IMPORTANTE: NAO FECHE ESTA JANELA PRETA !!!   |")
    print("|   O sistema para de funcionar se ela for fechada.   |")
    print("+-----------------------------------------------------+")
    print()
    
    # Passo 4: Iniciar o servidor Flask (app.py) usando o Python do venv
    print("Iniciando o servidor Flask (app.py)...")
    venv_python_path = get_venv_python()
    try:
        subprocess.run([venv_python_path, "app.py"], check=True)
    except FileNotFoundError:
        print("ERRO FATAL: O arquivo 'app.py' não foi encontrado.")
    except subprocess.CalledProcessError as e:
        print(f"O servidor foi encerrado com um erro: {e}")
    except KeyboardInterrupt:
        print("\nServidor encerrado pelo usuário.")

if __name__ == "__main__":
    main()
    print("\nO servidor foi finalizado. Pressione Enter para fechar esta janela.")
    input()