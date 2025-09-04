import os
import shutil
from datetime import datetime, timedelta

# --- Configurações ---
DB_FILE = 'estoque.db'
BACKUP_DIR = 'backups'
DAYS_TO_KEEP = 7 # Quantos dias de backup devem ser mantidos

def create_backup():
    """Cria um backup do banco de dados com data e hora no nome."""
    if not os.path.exists(DB_FILE):
        print(f"O arquivo '{DB_FILE}' não foi encontrado. Nenhum backup foi criado.")
        return

    # Garante que a pasta de backup exista
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    # Gera o nome do arquivo de backup
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"estoque_{timestamp}.db"
    backup_filepath = os.path.join(BACKUP_DIR, backup_filename)

    try:
        shutil.copy2(DB_FILE, backup_filepath)
        print(f"Backup criado com sucesso: {backup_filepath}")
    except Exception as e:
        print(f"ERRO: Falha ao criar o backup. Detalhes: {e}")

def cleanup_old_backups():
    """Remove backups mais antigos que o limite definido em DAYS_TO_KEEP."""
    if not os.path.exists(BACKUP_DIR):
        return

    print(f"Limpando backups com mais de {DAYS_TO_KEEP} dias...")
    cutoff_date = datetime.now() - timedelta(days=DAYS_TO_KEEP)
    
    deleted_count = 0
    for filename in os.listdir(BACKUP_DIR):
        if filename.startswith('estoque_') and filename.endswith('.db'):
            filepath = os.path.join(BACKUP_DIR, filename)
            file_mod_time = datetime.fromtimestamp(os.path.getmtime(filepath))
            
            if file_mod_time < cutoff_date:
                try:
                    os.remove(filepath)
                    print(f"  - Deletado backup antigo: {filename}")
                    deleted_count += 1
                except Exception as e:
                    print(f"ERRO: Falha ao deletar {filename}. Detalhes: {e}")
    
    if deleted_count == 0:
        print("Nenhum backup antigo para limpar.")
    else:
        print(f"Limpeza concluída. {deleted_count} backups antigos foram removidos.")


if __name__ == "__main__":
    print("--- INICIANDO ROTINA DE BACKUP ---")
    create_backup()
    cleanup_old_backups()
    print("--- FIM DA ROTINA DE BACKUP ---")