import sqlite3
import os

db_path = 'estoque.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if column exists
cursor.execute("PRAGMA table_info(venda)")
columns = [info[1] for info in cursor.fetchall()]

if 'entrega_estado' not in columns:
    print("Column 'entrega_estado' missing. Adding it...")
    try:
        cursor.execute("ALTER TABLE venda ADD COLUMN entrega_estado VARCHAR(2)")
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        print(f"Error adding column: {e}")
else:
    print("Column 'entrega_estado' already exists.")

conn.close()
