from flask import request, jsonify, current_app
from . import api_bp
from ...extensions import db
from ...models import Cupom, Produto, PromocaoAutomatica, Cliente
from ...utils import token_required, registrar_log
from ...services.email_service import enviar_comunicado_marketing
import threading
import time

GATILHOS_VALIDOS = ('primeira_compra', 'primeira_avaliacao', 'aniversario')

# Ritmo de envio do comunicado em massa: provedores de SMTP (Gmail etc.) costumam bloquear ou
# colocar em quarentena temporariamente contas que abrem muitas conexoes/logins em sequencia
# muito rapida. Uma pausa curta entre cada e-mail, mais uma pausa maior a cada lote, mantem o
# envio dentro de um ritmo seguro sem exigir infraestrutura de fila.
PAUSA_ENTRE_EMAILS_SEGUNDOS = 1.5
TAMANHO_LOTE = 20
PAUSA_ENTRE_LOTES_SEGUNDOS = 10

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


def _validar_dados_promocao(dados, promocao_atual_id=None):
    """Retorna uma mensagem de erro (string) se os dados forem inválidos, ou None se estiverem ok."""
    gatilho = dados.get('gatilho')
    if gatilho not in GATILHOS_VALIDOS:
        return f"Gatilho inválido. Use um de: {', '.join(GATILHOS_VALIDOS)}."

    existente = PromocaoAutomatica.query.filter_by(gatilho=gatilho).first()
    if existente and existente.id != promocao_atual_id:
        return f"Já existe uma promoção automática para o gatilho '{gatilho}'. Edite a existente em vez de criar outra."

    if gatilho == 'primeira_compra' and not dados.get('codigo_cupom'):
        return "Código do cupom é obrigatório para o gatilho 'primeira_compra'."

    if gatilho == 'primeira_avaliacao' and not dados.get('prefixo_codigo'):
        return "Prefixo do código é obrigatório para o gatilho 'primeira_avaliacao'."

    return None


@api_bp.route('/api/promocoes-automaticas', methods=['GET', 'POST'])
@token_required
def gerenciar_promocoes_automaticas(current_user):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403

    if request.method == 'GET':
        promocoes = PromocaoAutomatica.query.order_by(PromocaoAutomatica.id).all()
        return jsonify([p.to_dict() for p in promocoes])

    dados = request.get_json() or {}
    erro = _validar_dados_promocao(dados)
    if erro:
        return jsonify({'erro': erro}), 400

    nova_promocao = PromocaoAutomatica(
        nome=dados.get('nome') or dados['gatilho'],
        gatilho=dados['gatilho'],
        codigo_cupom=(dados.get('codigo_cupom') or '').upper() or None,
        prefixo_codigo=(dados.get('prefixo_codigo') or '').upper() or None,
        tipo_desconto=dados.get('tipo_desconto', 'percentual'),
        valor_desconto=float(dados['valor_desconto']),
        ativo=bool(dados.get('ativo', True))
    )
    db.session.add(nova_promocao)
    registrar_log(current_user, "Promoção Automática Criada", f"Gatilho: {nova_promocao.gatilho}, Nome: {nova_promocao.nome}")
    db.session.commit()
    return jsonify(nova_promocao.to_dict()), 201


@api_bp.route('/api/promocoes-automaticas/<int:promocao_id>', methods=['PUT', 'DELETE'])
@token_required
def gerenciar_promocao_automatica_especifica(current_user, promocao_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    promocao = PromocaoAutomatica.query.get_or_404(promocao_id)

    if request.method == 'PUT':
        dados = request.get_json() or {}

        if 'ativo' in dados and len(dados) == 1:
            promocao.ativo = bool(dados['ativo'])
            registrar_log(current_user, "Status da Promoção Automática Alterado", f"{promocao.nome}: {'Ativada' if promocao.ativo else 'Desativada'}")
        else:
            dados_completos = {**promocao.to_dict(), **dados}
            erro = _validar_dados_promocao(dados_completos, promocao_atual_id=promocao.id)
            if erro:
                return jsonify({'erro': erro}), 400

            promocao.nome = dados_completos.get('nome') or promocao.nome
            promocao.gatilho = dados_completos['gatilho']
            promocao.codigo_cupom = (dados_completos.get('codigo_cupom') or '').upper() or None
            promocao.prefixo_codigo = (dados_completos.get('prefixo_codigo') or '').upper() or None
            promocao.tipo_desconto = dados_completos.get('tipo_desconto', 'percentual')
            promocao.valor_desconto = float(dados_completos['valor_desconto'])
            promocao.ativo = bool(dados_completos.get('ativo', True))
            registrar_log(current_user, "Promoção Automática Atualizada", f"Nome: {promocao.nome}")

        db.session.commit()
        return jsonify(promocao.to_dict())

    if request.method == 'DELETE':
        registrar_log(current_user, "Promoção Automática Deletada", f"Nome: {promocao.nome}, Gatilho: {promocao.gatilho}")
        db.session.delete(promocao)
        db.session.commit()
        return jsonify({'mensagem': 'Promoção automática removida!'})


def _destinatarios_comunicado():
    """Lista (email, nome) de todos os clientes com e-mail cadastrado, sem duplicar por
    e-mail (case-insensitive)."""
    clientes = Cliente.query.filter(Cliente.email.isnot(None), Cliente.email != '').all()
    vistos = set()
    destinatarios = []
    for c in clientes:
        email_norm = c.email.strip().lower()
        if email_norm not in vistos:
            vistos.add(email_norm)
            destinatarios.append((c.email, c.nome))
    return destinatarios


@api_bp.route('/api/marketing/comunicado/destinatarios', methods=['GET'])
@token_required
def contar_destinatarios_comunicado(current_user):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    return jsonify({'total': len(_destinatarios_comunicado())})


@api_bp.route('/api/marketing/comunicado', methods=['POST'])
@token_required
def enviar_comunicado(current_user):
    """Envia um comunicado por e-mail (ex: mensagem de data comemorativa, aviso) para todos
    os clientes com e-mail cadastrado. Envio acontece em background (pode levar minutos com
    muitos destinatários) - a resposta confirma só que o disparo comecou."""
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403

    dados = request.get_json(silent=True) or {}
    assunto = (dados.get('assunto') or '').strip()
    mensagem = (dados.get('mensagem') or '').strip()

    if not assunto or not mensagem:
        return jsonify({'erro': 'Assunto e mensagem são obrigatórios.'}), 400

    destinatarios = _destinatarios_comunicado()
    if not destinatarios:
        return jsonify({'erro': 'Nenhum cliente com e-mail cadastrado.'}), 400

    total = len(destinatarios)
    admin_nome = current_user.nome
    registrar_log(current_user, "Comunicado em Massa Iniciado", f"Assunto: '{assunto}' - {total} destinatário(s).")
    db.session.commit()

    def enviar_em_background(app, destinatarios, assunto, mensagem, admin_nome):
        with app.app_context():
            from ...utils import registrar_log as _registrar_log
            sucesso = 0
            falha = 0
            for i, (email, nome) in enumerate(destinatarios):
                try:
                    ok = enviar_comunicado_marketing(email, nome, assunto, mensagem)
                except Exception as e:
                    print(f"Erro ao enviar comunicado para {email}: {e}")
                    ok = False
                if ok:
                    sucesso += 1
                else:
                    falha += 1

                # Pausa entre cada e-mail e uma pausa maior a cada lote - mantem o ritmo de
                # envio seguro pro provedor de SMTP. Nao pausa depois do ultimo destinatario.
                if i < len(destinatarios) - 1:
                    if (i + 1) % TAMANHO_LOTE == 0:
                        time.sleep(PAUSA_ENTRE_LOTES_SEGUNDOS)
                    else:
                        time.sleep(PAUSA_ENTRE_EMAILS_SEGUNDOS)

            _registrar_log(None, "Comunicado em Massa Concluído", f"Assunto: '{assunto}' - Enviados: {sucesso}, Falhas: {falha} (disparado por {admin_nome}).")
            db.session.commit()

    thread = threading.Thread(
        target=enviar_em_background,
        args=(current_app._get_current_object(), destinatarios, assunto, mensagem, admin_nome)
    )
    thread.start()

    # Estimativa de duração com o ritmo throttled (pausa entre e-mails + pausa maior a cada
    # lote), pra lojista não achar que travou numa lista grande.
    num_pausas_lote = (total - 1) // TAMANHO_LOTE
    duracao_estimada_seg = (total - 1 - num_pausas_lote) * PAUSA_ENTRE_EMAILS_SEGUNDOS + num_pausas_lote * PAUSA_ENTRE_LOTES_SEGUNDOS
    duracao_min = max(1, round(duracao_estimada_seg / 60))

    return jsonify({'mensagem': f'Envio iniciado para {total} cliente(s). Deve levar cerca de {duracao_min} minuto(s) (envio gradual, pra não ser bloqueado pelo provedor de e-mail) - acompanhe pelo Log de Atividades.'}), 202
