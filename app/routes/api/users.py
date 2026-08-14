from flask import request, jsonify
from . import api_bp
from ...extensions import db
from ...models import Usuario, Cliente, Venda
from ...utils import token_required, registrar_log

@api_bp.route('/api/usuarios', methods=['GET'])
@token_required
def get_all_users(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    users = db.session.execute(db.select(Usuario)).scalars().all()
    return jsonify([user.to_dict() for user in users])

@api_bp.route('/api/usuarios/<int:user_id>', methods=['PUT', 'DELETE'])
@token_required
def manage_specific_user(current_user, user_id):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    user = Usuario.query.get_or_404(user_id)
    if request.method == 'PUT':
        dados = request.get_json()
        novo_role = dados.get('role', user.role)
        if novo_role not in ('admin', 'vendedor'):
            return jsonify({'erro': 'Cargo inválido. Use "admin" ou "vendedor".'}), 400
        # Impede o admin de rebaixar a si mesmo se for o único admin restante - sem essa
        # checagem, é possível travar o acesso administrativo do sistema por engano.
        if user.id == current_user.id and user.role == 'admin' and novo_role != 'admin':
            outros_admins = Usuario.query.filter(Usuario.role == 'admin', Usuario.id != user.id).first()
            if not outros_admins:
                return jsonify({'erro': 'Você é o único admin do sistema - não é possível remover seu próprio cargo de admin.'}), 400
        user.nome = dados.get('nome', user.nome)
        user.email = dados.get('email', user.email)
        user.role = novo_role
        registrar_log(current_user, "Usuário Atualizado", f"ID: {user_id}, Cargo: {user.role}")
        db.session.commit()
        return jsonify(user.to_dict())
    if request.method == 'DELETE':
        if current_user.id == user_id: return jsonify({'erro': 'Você não pode deletar a si mesmo.'}), 400
        registrar_log(current_user, "Usuário Deletado", f"ID: {user_id}, Nome: {user.nome}")
        db.session.delete(user)
        db.session.commit()
        return jsonify({'mensagem': 'Usuário deletado!'})

@api_bp.route('/api/clientes', methods=['GET', 'POST'])
@token_required
def gerenciar_clientes(current_user):
    if request.method == 'POST':
        dados = request.get_json()
        if dados.get('cpf') and Cliente.query.filter_by(cpf=dados['cpf']).first():
            return jsonify({'erro': 'CPF já cadastrado.'}), 400
        novo_cliente = Cliente(nome=dados['nome'], telefone=dados.get('telefone'), cpf=dados.get('cpf'))
        db.session.add(novo_cliente)
        db.session.commit()
        return jsonify(novo_cliente.to_dict()), 201
    else:
        clientes = db.session.execute(db.select(Cliente)).scalars().all()
        return jsonify([cliente.to_dict() for cliente in clientes])

@api_bp.route('/api/clientes/<int:cliente_id>', methods=['PUT', 'DELETE'])
@token_required
def gerenciar_cliente_especifico(current_user, cliente_id):
    cliente = Cliente.query.get_or_404(cliente_id)
    if request.method == 'PUT':
        dados = request.get_json()
        cliente.nome = dados.get('nome', cliente.nome)
        cliente.telefone = dados.get('telefone', cliente.telefone)
        cliente.cpf = dados.get('cpf', cliente.cpf)
        db.session.commit()
        return jsonify(cliente.to_dict())
    elif request.method == 'DELETE':
        if current_user.role != 'admin':
            return jsonify({'message': 'Acesso negado.'}), 403

        tem_vendas = Venda.query.filter_by(id_cliente=cliente.id).first() is not None

        if tem_vendas:
            # LGPD (direito ao esquecimento) tem limite: obrigações legais/fiscais exigem manter
            # o histórico de vendas. Por isso não apagamos o registro, apenas anonimizamos os
            # dados pessoais, preservando o vínculo com as vendas já realizadas.
            cliente.nome = 'Cliente Removido (LGPD)'
            cliente.telefone = None
            cliente.cpf = None
            cliente.email = f'removido-{cliente.id}@anonimizado.local'
            cliente.senha_hash = None
            cliente.foto_perfil = None
            cliente.endereco_rua = None
            cliente.endereco_numero = None
            cliente.endereco_bairro = None
            cliente.endereco_cidade = None
            cliente.endereco_estado = None
            cliente.endereco_cep = None
            cliente.endereco_complemento = None
            registrar_log(current_user, "Cliente Anonimizado (LGPD)", f"ID: {cliente_id} - Histórico de vendas preservado por obrigação legal.")
            db.session.commit()
            return jsonify({'mensagem': 'Dados pessoais do cliente removidos. Histórico de vendas preservado por obrigação legal.'})

        nome_removido = cliente.nome
        registrar_log(current_user, "Cliente Excluído", f"ID: {cliente_id}, Nome: {nome_removido}")
        db.session.delete(cliente)
        db.session.commit()
        return jsonify({'mensagem': 'Cliente deletado!'})
