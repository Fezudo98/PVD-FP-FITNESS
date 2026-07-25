import sqlite3
conn = sqlite3.connect('estoque.db')
c = conn.cursor()
c.execute("SELECT nome, email FROM usuario WHERE role='admin'")
for row in c.fetchall():
    print(f"Nome: {row[0]} | Email/Login: {row[1]}")
