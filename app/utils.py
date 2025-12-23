import re
import jwt
from functools import wraps
from flask import request, jsonify, current_app
from unicodedata import normalize
from datetime import datetime
from .extensions import db
from .models import Log, Usuario, Cliente

def validate_cpf(cpf):
    # Remove chars non-digits
    cpf = ''.join(filter(str.isdigit, cpf))
    
    # Check length
    if len(cpf) != 11: return False
    
    # Check for known invalid sequences
    if cpf == cpf[0] * 11: return False
    
    # Calc 1st digit
    sum_val = sum(int(cpf[i]) * (10 - i) for i in range(9))
    rev = 11 - (sum_val % 11)
    if rev == 10 or rev == 11: rev = 0
    if rev != int(cpf[9]): return False
    
    # Calc 2nd digit
    sum_val = sum(int(cpf[i]) * (11 - i) for i in range(10))
    rev = 11 - (sum_val % 11)
    if rev == 10 or rev == 11: rev = 0
    if rev != int(cpf[10]): return False
    
    return True

def registrar_log(usuario, acao, detalhes=""):
    try:
        user_id = usuario.id if usuario else None
        user_name = usuario.nome if usuario else "Sistema"
        novo_log = Log(id_usuario=user_id, usuario_nome=user_name, acao=acao, detalhes=detalhes)
        db.session.add(novo_log)
    except Exception as e:
        print(f"ERRO CRÍTICO AO REGISTRAR LOG: {e}")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-access-token')
        if not token: return jsonify({'message': 'Token está faltando!'}), 401
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = Usuario.query.get(data['id'])
        except Exception as e:
            return jsonify({'message': 'Token é inválido!'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

def client_token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-client-token')
        if not token: return jsonify({'message': 'Token está faltando!'}), 401
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_client = Cliente.query.get(data['id'])
            if not current_client: raise Exception('Cliente não encontrado')
        except Exception: return jsonify({'message': 'Token é inválido!'}), 401
        return f(current_client, *args, **kwargs)
    return decorated

def generate_standard_sku(nome, cor, tamanho):
    """Gera um SKU padronizado: nome-slug-cor-tamanho"""
    def slugify(text):
        if not text: return ""
        text = normalize('NFKD', text).encode('ASCII', 'ignore').decode('ASCII')
        text = text.lower().strip()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[-\s]+', '-', text)
        return text

    nome_slug = slugify(nome)
    cor_slug = slugify(cor if cor else "unica")
    tamanho_slug = (tamanho if tamanho else "U").upper().replace(" ", "")
    
    return f"{nome_slug}-{cor_slug}-{tamanho_slug}"

import os
import base64

def salvar_recibo_html(venda):
    try:
        # Adjust base_dir relative to app package
        base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
        recibos_dir = os.path.join(base_dir, 'recibos')
        os.makedirs(recibos_dir, exist_ok=True)
        itens_html = ""
        subtotal_produtos = 0
        for item in venda.itens:
            # Re-fetch item to ensure relationship loaded if needed? Usually lazy loading works.
            # But item.produto might need eager load or session active.
            subtotal_item = item.quantidade * item.preco_unitario_momento
            subtotal_produtos += subtotal_item
            itens_html += f'<tr><td>{item.produto.nome}</td><td style="text-align: center;">{item.quantidade}</td><td style="text-align: right;">R$ {item.preco_unitario_momento:.2f}</td><td style="text-align: right;">R$ {subtotal_item:.2f}</td></tr>'
        
        logo_path = os.path.join(base_dir, 'frontend', 'logo.jpg')
        logo_tag = '<h3>FP Moda Fitness</h3>'
        if os.path.exists(logo_path):
            with open(logo_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            logo_tag = f'<img src="data:image/jpeg;base64,{encoded_string}" alt="Logo">'
        
        desconto_html = ''
        if venda.desconto_total > 0:
            cupons_str = ", ".join([c.codigo for c in venda.cupons])
            desconto_html = f'<p><strong>Descontos Aplicados ({cupons_str}):</strong> - R$ {venda.desconto_total:.2f}</p>'

        pagamentos_html = ""
        for pg in venda.pagamentos:
            if pg.forma == 'Cartão de Crédito' and venda.parcelas and venda.parcelas > 1:
                pagamentos_html += f"<p><strong>Pagamento:</strong> {pg.forma} ({venda.parcelas}x) - R$ {pg.valor:.2f}</p>"
            else:
                 pagamentos_html += f"<p><strong>Pagamento:</strong> {pg.forma} - R$ {pg.valor:.2f}</p>"

        html_content = f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Recibo Venda #{venda.id}</title><style>body{{font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #000;}}.receipt-container{{max-width: 800px; margin: 20px auto; border: 1px solid #ccc; padding: 30px; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);}}.header{{text-align: center; margin-bottom: 25px;}} .header img{{max-width: 150px;}}table{{width: 100%; border-collapse: collapse; margin-top: 20px;}}th, td{{padding: 12px; border-bottom: 1px solid #ddd; text-align: left;}}th{{background-color: #f2f2f2;}}.totals{{text-align: right; margin-top: 25px; padding-right: 10px;}}.totals p{{margin: 5px 0;}} .totals h3{{margin: 10px 0;}}.footer{{text-align: center; margin-top: 35px; font-size: 0.9em; color: #777;}}hr{{border: 0; border-top: 1px solid #eee; margin: 20px 0;}}</style></head><body><div class="receipt-container"><div class="header">{logo_tag}</div><p><strong>Venda ID:</strong> {venda.id}</p><p><strong>Data:</strong> {venda.data_hora.strftime("%d/%m/%Y %H:%M:%S")}</p><p><strong>Cliente:</strong> {venda.cliente.nome if venda.cliente else "Consumidor Final"}</p><p><strong>Vendedor(a):</strong> {venda.vendedor.nome if venda.vendedor else "Online"}</p><hr><table><thead><tr><th style="text-align: left;">Produto</th><th style="text-align: center;">Qtd.</th><th style="text-align: right;">Preço Unit.</th><th style="text-align: right;">Subtotal</th></tr></thead><tbody>{itens_html}</tbody></table><div class="totals"><p><strong>Subtotal Produtos:</strong> R$ {subtotal_produtos:.2f}</p>{desconto_html}<p><strong>Taxa de Entrega:</strong> R$ {venda.taxa_entrega:.2f}</p><h3><strong>Total Geral:</strong> R$ {venda.total_venda:.2f}</h3>{pagamentos_html}</div><hr><div class="footer"><p>Obrigado pela preferência!</p></div></div></body></html>'
        file_name = f"venda_{venda.id}_{venda.data_hora.strftime('%Y-%m-%d_%H-%M-%S')}.html"
        file_path = os.path.join(recibos_dir, file_name)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"Recibo salvo em: {file_path}")
        return file_name # Return filename for API response usage if needed
    except Exception as e:
        print(f"ERRO ao salvar recibo para a venda {venda.id}: {e}")
        return None
