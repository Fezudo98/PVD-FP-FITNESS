import sqlite3
import os

db_path = 'estoque.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if column exists in cliente table
cursor.execute("PRAGMA table_info(cliente)")
columns = [info[1] for info in cursor.fetchall()]

if 'endereco_estado' not in columns:
    print("Column 'endereco_estado' missing in 'cliente' table. Adding it...")
    try:
        cursor.execute("ALTER TABLE cliente ADD COLUMN endereco_estado VARCHAR(2)")
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        print(f"Error adding column: {e}")
else:
    print("Column 'endereco_estado' already exists in 'cliente' table.")

conn.close()
