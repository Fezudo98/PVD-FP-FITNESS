import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///' + os.path.join(basedir, 'estoque.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise RuntimeError("CRITICAL: SECRET_KEY is not set in environment variables!")
        
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'https://www.lojafpfitness.com.br,https://lojafpfitness.com.br,http://localhost:5000,http://127.0.0.1:5000').split(',')
    
    # Logistics Config
    LOJA_LAT = -3.884346
    LOJA_LON = -38.605275
    ENTREGA_RAIO_MAX_KM = 30
    ENTREGA_PRECO_POR_KM = 1.00
    ENTREGA_TAXA_MINIMA = 5.00
    GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024 # 16MB Limit

    # Versão vigente dos Termos de Uso e Políticas (formato AAAA-MM-DD).
    # Atualize esta data sempre que o conteúdo de store/policies.html for alterado de forma
    # relevante. Cada venda online guarda a versão aceita no momento da compra (Venda.versao_termos),
    # então pedidos antigos continuam vinculados à versão que estava vigente quando foram feitos.
    TERMOS_VERSAO = "2026-08-01"

    # E-mail transacional (confirmação de pedido, pagamento aprovado, pedido enviado).
    # Se MAIL_USERNAME/MAIL_PASSWORD não estiverem configurados, o envio é pulado silenciosamente
    # (não quebra o checkout nem nenhum outro fluxo) — ver app/services/email_service.py.
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or os.environ.get('MAIL_USERNAME')
