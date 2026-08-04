import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from flask import current_app


def _log(mensagem):
    """Print seguro contra consoles que não suportam UTF-8 (ex: cp1252 no Windows).
    Sem isso, um emoji no assunto do e-mail derruba o próprio log de sucesso/erro,
    fazendo o envio parecer que falhou mesmo quando deu certo."""
    try:
        print(mensagem)
    except UnicodeEncodeError:
        print(mensagem.encode('ascii', errors='replace').decode('ascii'))


def _enviar_email(destinatario, assunto, corpo_html, anexos=None):
    """Envia um e-mail via SMTP. Se as credenciais não estiverem configuradas (MAIL_USERNAME/
    MAIL_PASSWORD) ou não houver destinatário, apenas registra no log e não faz nada — o envio
    de e-mail nunca deve travar ou quebrar o fluxo da loja (checkout, webhook, etc.).

    anexos: lista opcional de tuplas (nome_arquivo, conteudo_str, mime_subtype), ex:
    [('comprovante.html', '<html>...</html>', 'html')]."""
    mail_user = current_app.config.get('MAIL_USERNAME')
    mail_pass = current_app.config.get('MAIL_PASSWORD')
    mail_server = current_app.config.get('MAIL_SERVER')
    mail_port = current_app.config.get('MAIL_PORT')
    remetente = current_app.config.get('MAIL_DEFAULT_SENDER') or mail_user

    if not mail_user or not mail_pass:
        _log(f"[Email] Envio pulado (MAIL_USERNAME/MAIL_PASSWORD não configurados): {assunto} -> {destinatario}")
        return False

    if not destinatario:
        _log(f"[Email] Envio pulado (sem destinatário): {assunto}")
        return False

    try:
        msg = MIMEMultipart('mixed')
        msg['Subject'] = assunto
        msg['From'] = f"FP Moda Fitness <{remetente}>"
        msg['To'] = destinatario

        corpo = MIMEMultipart('alternative')
        corpo.attach(MIMEText(corpo_html, 'html', 'utf-8'))
        msg.attach(corpo)

        for nome_arquivo, conteudo, mime_subtype in (anexos or []):
            anexo = MIMEApplication(conteudo.encode('utf-8'), _subtype=mime_subtype)
            anexo.add_header('Content-Disposition', 'attachment', filename=nome_arquivo)
            msg.attach(anexo)

        with smtplib.SMTP(mail_server, mail_port, timeout=10) as server:
            server.starttls()
            server.login(mail_user, mail_pass)
            server.sendmail(remetente, destinatario, msg.as_string())

        _log(f"[Email] Enviado com sucesso: {assunto} -> {destinatario}")
        return True
    except Exception as e:
        _log(f"[Email] Erro ao enviar e-mail '{assunto}' para {destinatario}: {e}")
        return False


def _template_base(titulo, corpo_html, rodape_link='https://www.lojafpfitness.com.br/store/conta', rodape_texto='Ver meus pedidos'):
    return f'''<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #eeeeee;">
    <div style="background:linear-gradient(135deg,#e0b431,#c9a22b);padding:30px;text-align:center;">
        <h1 style="color:#000000;margin:0;font-size:22px;">FP Moda Fitness</h1>
    </div>
    <div style="padding:30px;color:#333333;line-height:1.5;">
        <h2 style="color:#212529;margin-top:0;">{titulo}</h2>
        {corpo_html}
    </div>
    <div style="background:#f8f9fa;padding:20px;text-align:center;color:#888888;font-size:12px;">
        <p style="margin:0;">FP Moda Fitness &middot; R. Oitenta, 166, Sen. Carlos Jereissati, Pacatuba - CE</p>
        <p style="margin:5px 0 0;"><a href="{rodape_link}" style="color:#c9a22b;">{rodape_texto}</a></p>
    </div>
</div>
</body></html>'''


def _fmt_brl(valor):
    return f'{valor:.2f}'.replace('.', ',')


def _lista_itens_html(venda):
    linhas = []
    for item in venda.itens:
        nome = item.produto.nome if item.produto else 'Produto'
        subtotal = item.quantidade * item.preco_unitario_momento
        linhas.append(f"<p style='margin:4px 0;'>{item.quantidade}x {nome} &mdash; R$ {_fmt_brl(subtotal)}</p>")
    return "".join(linhas)


def enviar_confirmacao_pedido(venda):
    if not venda.cliente or not venda.cliente.email:
        return False

    corpo = f'''
        <p>Olá, {venda.cliente.nome}!</p>
        <p>Recebemos o seu pedido <strong>#{venda.id}</strong> e ele está aguardando a confirmação do pagamento.</p>
        {_lista_itens_html(venda)}
        <p style="font-size:18px;font-weight:bold;color:#c9a22b;">Total: R$ {_fmt_brl(venda.total_venda)}</p>
        <p>Assim que o pagamento for aprovado, você recebe um novo e-mail confirmando. Você também pode acompanhar tudo a qualquer momento em "Minha Conta" no site.</p>
    '''

    html = _template_base(f'Recebemos seu pedido #{venda.id}!', corpo)
    return _enviar_email(venda.cliente.email, f'Recebemos seu pedido #{venda.id} - FP Moda Fitness', html)


def enviar_pagamento_aprovado(venda):
    if not venda.cliente or not venda.cliente.email:
        return False

    total_fmt = f'{venda.total_venda:.2f}'.replace('.', ',')
    corpo = f'''
        <p>Olá, {venda.cliente.nome}!</p>
        <p>O pagamento do seu pedido <strong>#{venda.id}</strong> foi aprovado. 🎉</p>
        <p style="font-size:18px;font-weight:bold;color:#28a745;">Total pago: R$ {total_fmt}</p>
        <p>Já estamos preparando o seu pedido para envio. Você pode acompanhar o status a qualquer momento em "Minha Conta" no site.</p>
        <p>Em anexo, o comprovante do seu pedido.</p>
    '''

    html = _template_base(f'Pagamento aprovado - Pedido #{venda.id}', corpo)

    anexos = []
    try:
        from ..utils import gerar_recibo_html
        anexos.append((f'comprovante_pedido_{venda.id}.html', gerar_recibo_html(venda), 'html'))
    except Exception as e:
        _log(f"[Email] Erro ao gerar comprovante anexo da venda {venda.id}: {e}")

    return _enviar_email(venda.cliente.email, f'Pagamento aprovado - Pedido #{venda.id} - FP Moda Fitness', html, anexos=anexos)


def enviar_pagamento_rejeitado(venda):
    if not venda.cliente or not venda.cliente.email:
        return False

    corpo = f'''
        <p>Olá, {venda.cliente.nome}!</p>
        <p>O pagamento do seu pedido <strong>#{venda.id}</strong> não foi aprovado pelo Mercado Pago. 😕</p>
        {_lista_itens_html(venda)}
        <p style="font-size:18px;font-weight:bold;color:#c9a22b;">Total: R$ {_fmt_brl(venda.total_venda)}</p>
        <p>Isso pode acontecer por diversos motivos e nem sempre indica um problema com o seu cartão. Não se preocupe: nenhum valor foi cobrado e o estoque dos produtos já foi liberado novamente.</p>
        <p><strong>Dica:</strong> tentar novamente pagando com <strong>PIX</strong> costuma ter aprovação mais rápida do que cartão de crédito.</p>
        <a href="https://www.lojafpfitness.com.br/store/produtos" style="display:inline-block;margin-top:10px;padding:12px 24px;background:linear-gradient(135deg,#e0b431,#c9a22b);color:#000000;text-decoration:none;font-weight:bold;border-radius:50px;">Tentar novamente</a>
    '''

    html = _template_base(f'Pagamento não aprovado - Pedido #{venda.id}', corpo)
    return _enviar_email(venda.cliente.email, f'Pagamento não aprovado - Pedido #{venda.id} - FP Moda Fitness', html)


def enviar_pedido_enviado(venda):
    if not venda.cliente or not venda.cliente.email:
        return False

    rastreio_html = ''
    if venda.codigo_rastreio:
        rastreio_html = f"<p>Código de rastreio: <strong>{venda.codigo_rastreio}</strong>{' (' + venda.transportadora + ')' if venda.transportadora else ''}</p>"

    corpo = f'''
        <p>Olá, {venda.cliente.nome}!</p>
        <p>Seu pedido <strong>#{venda.id}</strong> saiu para entrega! 📦</p>
        {rastreio_html}
        <p>Acompanhe tudo em "Minha Conta" no site.</p>
    '''

    html = _template_base(f'Pedido #{venda.id} a caminho!', corpo)
    return _enviar_email(venda.cliente.email, f'Seu pedido #{venda.id} foi enviado! - FP Moda Fitness', html)


def enviar_aviso_novo_pedido_admin(venda):
    """Avisa a lojista por e-mail que um novo pedido online chegou (independente do cliente ter
    e-mail cadastrado ou não). Vai para ADMIN_NOTIFICATION_EMAIL, ou MAIL_USERNAME se não
    houver um endereço específico configurado."""
    destinatario = current_app.config.get('ADMIN_NOTIFICATION_EMAIL') or current_app.config.get('MAIL_USERNAME')
    if not destinatario:
        return False

    cliente_nome = venda.cliente.nome if venda.cliente else 'Cliente não identificado'
    cliente_contato = (venda.cliente.telefone if venda.cliente and venda.cliente.telefone else '') or (venda.cliente.email if venda.cliente else '')

    corpo = f'''
        <p>Novo pedido recebido na loja! 🛍️</p>
        <p><strong>Pedido:</strong> #{venda.id}</p>
        <p><strong>Cliente:</strong> {cliente_nome} {f'({cliente_contato})' if cliente_contato else ''}</p>
        {_lista_itens_html(venda)}
        <p style="font-size:18px;font-weight:bold;color:#c9a22b;">Total: R$ {_fmt_brl(venda.total_venda)}</p>
        <p>Assim que o pagamento for aprovado, você recebe outro aviso por aqui. Acompanhe o pedido no painel administrativo.</p>
    '''

    html = _template_base(
        f'Novo pedido #{venda.id}!', corpo,
        rodape_link='https://www.lojafpfitness.com.br/loja_online.html',
        rodape_texto='Ver no painel administrativo'
    )
    return _enviar_email(destinatario, f'🛍️ Novo pedido #{venda.id} recebido - FP Moda Fitness', html)
