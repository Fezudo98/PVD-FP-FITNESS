import re
# pyrefly: ignore [missing-import]
import jwt
from functools import wraps
# pyrefly: ignore [missing-import]
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
            # Sem o claim 'type', um token de cliente (mesma SECRET_KEY, mesmo formato de
            # payload) seria aceito aqui se o id colidisse com o de um usuario admin/vendedor -
            # cliente comum ganhando acesso total de administrador. Ver client_token_required.
            if data.get('type') != 'admin': raise Exception('Token nao e de administrador')
            current_user = Usuario.query.get(data['id'])
            if not current_user: raise Exception('Usuário não encontrado')
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
            if data.get('type') != 'client': raise Exception('Token nao e de cliente')
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
        return text.strip('-')

    nome_slug = slugify(nome)
    cor_slug = slugify(cor if cor else "unica")
    tamanho_clean = normalize('NFKD', str(tamanho) if tamanho else "U").encode('ASCII', 'ignore').decode('ASCII')
    tamanho_slug = re.sub(r'[^\w\s-]', '', tamanho_clean).strip().upper().replace(" ", "")
    if not tamanho_slug:
        tamanho_slug = "U"
    
    return f"{nome_slug}-{cor_slug}-{tamanho_slug}"

import os
import base64


def _logo_base64_tag():
    """Retorna a tag <img> do logo em base64 (auto-contida, sem depender de servir /static
    junto do recibo), ou None se o arquivo não existir."""
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    logo_path = os.path.join(base_dir, 'frontend', 'logo.jpg')
    if not os.path.exists(logo_path):
        return None
    with open(logo_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    return f'<img src="data:image/jpeg;base64,{encoded_string}" alt="FP Moda Fitness" style="max-height:60px;">'


def gerar_recibo_html(venda):
    """Monta o HTML do comprovante de uma venda (PDV ou online), auto-contido (CSS inline,
    logo embutido em base64) para poder ser salvo em arquivo, servido por download ou
    anexado em e-mail sem depender de nenhum recurso externo."""
    itens_html = ""
    subtotal_produtos = 0
    for item in venda.itens:
        subtotal_item = item.quantidade * item.preco_unitario_momento
        subtotal_produtos += subtotal_item
        nome_produto = item.produto.nome if item.produto else 'Produto'
        variacao = " / ".join(filter(None, [item.produto.cor if item.produto else None, str(item.produto.tamanho) if item.produto and item.produto.tamanho else None]))
        variacao_html = f'<div style="color:#888888;font-size:12px;">{variacao}</div>' if variacao else ''
        itens_html += f'''<tr>
            <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;">{nome_produto}{variacao_html}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;text-align:center;">{item.quantidade}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;text-align:right;">R$ {item.preco_unitario_momento:.2f}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;text-align:right;font-weight:600;">R$ {subtotal_item:.2f}</td>
        </tr>'''

    logo_tag = _logo_base64_tag() or '<span style="color:#000000;font-size:20px;font-weight:700;">FP Moda Fitness</span>'

    desconto_html = ''
    if venda.desconto_total and venda.desconto_total > 0:
        cupons_str = ", ".join([c.codigo for c in venda.cupons]) if venda.cupons else ''
        rotulo = f'Desconto ({cupons_str})' if cupons_str else 'Desconto'
        desconto_html = f'<div style="display:flex;justify-content:space-between;margin:4px 0;"><span>{rotulo}</span><span style="color:#c0392b;">- R$ {venda.desconto_total:.2f}</span></div>'

    frete_html = ''
    if venda.taxa_entrega and venda.taxa_entrega > 0:
        frete_html = f'<div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Taxa de Entrega</span><span>R$ {venda.taxa_entrega:.2f}</span></div>'

    pagamentos_html = ""
    for pg in venda.pagamentos:
        rotulo_pg = pg.forma
        if pg.forma == 'Cartão de Crédito' and venda.parcelas and venda.parcelas > 1:
            rotulo_pg = f"{pg.forma} ({venda.parcelas}x)"
        pagamentos_html += f'<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:13px;color:#555555;"><span>{rotulo_pg}</span><span>R$ {pg.valor:.2f}</span></div>'

    is_online = venda.id_vendedor is None
    origem = 'Pedido Online' if is_online else 'Venda no Balcão (PDV)'
    responsavel_label = 'Cliente' if is_online else 'Vendedor(a)'
    responsavel_nome = venda.cliente.nome if venda.cliente else ('Consumidor Final' if not is_online else 'Não identificado')

    entrega_html = ''
    if is_online and venda.tipo_entrega and venda.tipo_entrega != 'Retirada':
        endereco = ", ".join(filter(None, [venda.entrega_rua, venda.entrega_numero, venda.entrega_bairro, venda.entrega_cidade]))
        if endereco:
            entrega_html = f'<p style="margin:4px 0;color:#555555;font-size:13px;"><strong>Entrega:</strong> {endereco}</p>'

    return f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comprovante - Pedido #{venda.id}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#333333;">
<div style="max-width:650px;margin:20px auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #eeeeee;">

    <div style="background:linear-gradient(135deg,#e0b431,#c9a22b);padding:25px 30px;text-align:center;">
        {logo_tag}
        <p style="margin:8px 0 0;color:#3a2f00;font-size:13px;letter-spacing:0.5px;text-transform:uppercase;">Comprovante de {'Pagamento' if is_online else 'Compra'}</p>
    </div>

    <div style="padding:30px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin-bottom:20px;">
            <div>
                <p style="margin:0;color:#888888;font-size:12px;text-transform:uppercase;">Pedido</p>
                <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:#212529;">#{venda.id}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:0;color:#888888;font-size:12px;text-transform:uppercase;">{origem}</p>
                <p style="margin:2px 0 0;font-size:13px;color:#555555;">{venda.data_hora.strftime("%d/%m/%Y %H:%M")}</p>
            </div>
        </div>

        <p style="margin:4px 0;font-size:14px;"><strong>{responsavel_label}:</strong> {responsavel_nome}</p>
        {entrega_html}

        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
            <thead>
                <tr>
                    <th style="text-align:left;padding:8px;border-bottom:2px solid #e0b431;color:#888888;font-size:12px;text-transform:uppercase;">Produto</th>
                    <th style="text-align:center;padding:8px;border-bottom:2px solid #e0b431;color:#888888;font-size:12px;text-transform:uppercase;">Qtd.</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #e0b431;color:#888888;font-size:12px;text-transform:uppercase;">Unit.</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #e0b431;color:#888888;font-size:12px;text-transform:uppercase;">Subtotal</th>
                </tr>
            </thead>
            <tbody>{itens_html}</tbody>
        </table>

        <div style="margin-top:20px;padding-top:15px;border-top:1px solid #eeeeee;">
            <div style="display:flex;justify-content:space-between;margin:4px 0;color:#555555;">
                <span>Subtotal Produtos</span><span>R$ {subtotal_produtos:.2f}</span>
            </div>
            {desconto_html}
            {frete_html}
            <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid #eeeeee;">
                <span style="font-size:16px;font-weight:700;color:#212529;">Total</span>
                <span style="font-size:20px;font-weight:700;color:#c9a22b;">R$ {venda.total_venda:.2f}</span>
            </div>
        </div>

        <div style="margin-top:15px;">{pagamentos_html}</div>
    </div>

    <div style="background:#f8f9fa;padding:20px;text-align:center;color:#888888;font-size:12px;">
        <p style="margin:0;">Este é um comprovante informal, sem valor fiscal.</p>
        <p style="margin:5px 0 0;">FP Moda Fitness &middot; R. Oitenta, 166, Sen. Carlos Jereissati, Pacatuba - CE</p>
    </div>
</div>
</body>
</html>'''


def salvar_recibo_html(venda):
    try:
        base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
        recibos_dir = os.path.join(base_dir, 'recibos')
        os.makedirs(recibos_dir, exist_ok=True)

        html_content = gerar_recibo_html(venda)
        file_name = f"venda_{venda.id}_{venda.data_hora.strftime('%Y-%m-%d_%H-%M-%S')}.html"
        file_path = os.path.join(recibos_dir, file_name)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"Recibo salvo em: {file_path}")
        return file_name  # Return filename for API response usage if needed
    except Exception as e:
        print(f"ERRO ao salvar recibo para a venda {venda.id}: {e}")
        return None
