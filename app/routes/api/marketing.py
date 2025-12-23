from flask import request, jsonify
from . import api_bp
from ...extensions import db
from ...models import Cupom, Produto
from ...utils import token_required, registrar_log

@api_bp.route('/api/cupons', methods=['GET', 'POST'])
@token_required
def gerenciar_cupons(current_user):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    if request.method == 'GET':
        cupons = db.session.execute(db.select(Cupom)).scalars().all()
        return jsonify([cupom.to_dict() for cupom in cupons])
    if request.method == 'POST':
        dados = request.get_json()
        if Cupom.query.filter_by(codigo=dados['codigo'].upper()).first(): return jsonify({'erro': 'Código já existe.'}), 400
        novo_cupom = Cupom(codigo=dados['codigo'].upper(), tipo_desconto=dados['tipo_desconto'], valor_desconto=float(dados['valor_desconto']), aplicacao=dados.get('aplicacao', 'total'))
        if novo_cupom.aplicacao == 'produto_especifico' and dados.get('produtos_ids'):
            novo_cupom.produtos = Produto.query.filter(Produto.id.in_(dados['produtos_ids'])).all()
        db.session.add(novo_cupom)
        registrar_log(current_user, "Cupom Criado", f"Código: {novo_cupom.codigo}")
        db.session.commit()
        return jsonify(novo_cupom.to_dict()), 201

@api_bp.route('/api/cupons/<int:cupom_id>', methods=['PUT', 'DELETE'])
@token_required
def gerenciar_cupom_especifico(current_user, cupom_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    cupom = Cupom.query.get_or_404(cupom_id)
    if request.method == 'PUT':
        dados = request.get_json()
        if 'ativo' in dados and len(dados) == 1:
            cupom.ativo = dados.get('ativo', cupom.ativo)
            registrar_log(current_user, "Status do Cupom Alterado", f"Código: {cupom.codigo}, Status: {'Ativado' if cupom.ativo else 'Desativado'}")
        else:
            cupom.codigo = dados.get('codigo', cupom.codigo).upper()
            cupom.tipo_desconto = dados.get('tipo_desconto', cupom.tipo_desconto)
            cupom.valor_desconto = float(dados.get('valor_desconto', cupom.valor_desconto))
            cupom.aplicacao = dados.get('aplicacao', cupom.aplicacao)
            cupom.produtos = Produto.query.filter(Produto.id.in_(dados.get('produtos_ids', []))).all() if cupom.aplicacao == 'produto_especifico' else []
            registrar_log(current_user, "Cupom Atualizado", f"Código: {cupom.codigo}")
        db.session.commit()
        return jsonify(cupom.to_dict())
    if request.method == 'DELETE':
        registrar_log(current_user, "Cupom Deletado", f"Código: {cupom.codigo}")
        db.session.delete(cupom)
        db.session.commit()
        return jsonify({'mensagem': 'Cupom deletado!'})

@api_bp.route('/api/cupons/validar/<code>', methods=['GET'])
@token_required
def validar_cupom(current_user, code):
    code = code.upper()
    cupom = Cupom.query.filter_by(codigo=code).first()
    if not cupom: return jsonify({'erro': 'Cupom inválido.'}), 404
    if not cupom.ativo: return jsonify({'erro': 'Cupom não está ativo.'}), 400
    return jsonify(cupom.to_dict())
