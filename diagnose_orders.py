from app import app, db, Venda
import sys

print("Starting diagnosis...")
with app.app_context():
    try:
        print("Querying online orders...")
        vendas = Venda.query.filter(Venda.id_vendedor == None).order_by(Venda.data_hora.desc()).all()
        print(f"Found {len(vendas)} online orders.")
        
        for v in vendas:
            print(f"Order #{v.id}")
            print(f"  Client: {v.cliente.nome if v.cliente else 'None'}")
            print(f"  Total: {v.total_venda}")
            print(f"  Status: {v.status}")
            try:
                print(f"  Estado: {v.entrega_estado}")
            except AttributeError:
                print("  ERROR: entrega_estado attribute missing!")
            
            try:
                print(f"  Itens Count: {len(v.itens)}")
                # Simulate the dict creation
                item_dict = {
                    'id': v.id,
                    'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'),
                    'cliente': v.cliente.nome if v.cliente else 'Cliente Removido',
                    'total': v.total_venda,
                    'status': v.status,
                    'itens_count': len(v.itens)
                }
                print(f"  Serialized: {item_dict}")
            except Exception as e:
                print(f"  ERROR during serialization: {e}")
                import traceback
                traceback.print_exc()
                
        print("Diagnosis complete.")
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
