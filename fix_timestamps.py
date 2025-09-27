import sqlite3
from datetime import datetime, timedelta
import os
import sys

# --- Configurações ---
DB_FILE = 'estoque.db'
TIME_OFFSET_HOURS = 3  # Fuso do Ceará (UTC-3)
TABLES_TO_UPDATE = [
    ('venda', 'data_hora'), # Tabela 'venda', coluna 'data_hora'
    ('log', 'timestamp'),   # Tabela 'log', coluna 'timestamp'
]

def print_header(title):
    """Imprime um cabeçalho formatado para melhor visualização."""
    print("\n" + "=" * 60)
    print(title.center(60))
    print("=" * 60)

def fix_timestamps():
    """
    Script de uso único para corrigir os timestamps no banco de dados,
    subtraindo o offset do fuso horário dos registros existentes.
    """
    print_header("FERRAMENTA DE CORREÇÃO DE FUSO HORÁRIO")
    print(f"\nAVISO IMPORTANTE:")
    print(f"Este script irá modificar PERMANENTEMENTE o banco de dados '{DB_FILE}'.")
    print("1. CERTIFIQUE-SE de que você fez um BACKUP (cópia de segurança) deste arquivo.")
    print("2. O SERVIDOR (start_server.bat ou app.py) deve estar DESLIGADO.")

    try:
        confirm = input("\n> Digite 'sim' para confirmar e iniciar a correção: ").lower()
        if confirm != 'sim':
            print("\nCorreção CANCELADA pelo usuário.")
            return
    except KeyboardInterrupt:
        print("\nOperação cancelada.")
        return

    if not os.path.exists(DB_FILE):
        print(f"\nERRO CRÍTICO: O arquivo de banco de dados '{DB_FILE}' não foi encontrado.")
        print("Verifique se você está executando este script na pasta correta do projeto.")
        return

    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        print_header(f"INICIANDO CORREÇÃO EM '{DB_FILE}'")
        
        total_records_updated = 0

        for table, column in TABLES_TO_UPDATE:
            print(f"\n--- Processando tabela: '{table}' ---")
            
            try:
                cursor.execute(f"SELECT id, {column} FROM {table}")
                rows = cursor.fetchall()
            except sqlite3.OperationalError:
                print(f"AVISO: Tabela ou coluna '{table}.{column}' não encontrada. Pulando.")
                continue

            if not rows:
                print("Nenhum registro encontrado para corrigir.")
                continue

            update_count = 0
            for row_id, timestamp_str in rows:
                if not timestamp_str:
                    continue
                
                try:
                    # Tenta converter o timestamp, lidando com formatos com ou sem frações de segundo
                    if '.' in timestamp_str:
                        dt_obj = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S.%f')
                    else:
                        dt_obj = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')

                    # Aplica a correção de 3 horas
                    corrected_dt_obj = dt_obj - timedelta(hours=TIME_OFFSET_HOURS)
                    
                    # Atualiza o registro no banco de dados
                    cursor.execute(f"UPDATE {table} SET {column} = ? WHERE id = ?", (corrected_dt_obj, row_id))
                    update_count += 1

                except (ValueError, TypeError) as e:
                    print(f"  - AVISO: Não foi possível processar o registro ID {row_id} com valor '{timestamp_str}'. Erro: {e}")
            
            print(f"-> {update_count} registros foram corrigidos com sucesso.")
            total_records_updated += update_count

        conn.commit()
        print_header("CORREÇÃO CONCLUÍDA!")
        print(f"Total de {total_records_updated} registros de data/hora foram ajustados.")

    except sqlite3.Error as e:
        print(f"\nERRO DE BANCO DE DADOS: {e}")
        print("As alterações foram revertidas (rollback). Seu banco de dados não foi modificado.")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()
            print("\nConexão com o banco de dados fechada.")

if __name__ == "__main__":
    fix_timestamps()
    print("\nO processo foi finalizado.")
    # Mantém a janela aberta no Windows se executado com duplo clique
    if sys.platform == "win32":
        input("Pressione Enter para fechar esta janela...")