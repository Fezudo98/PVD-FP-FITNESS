import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///' + os.path.join(basedir, 'estoque.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'chave_super_secreta_mudeme'
    
    # Logistics Config
    LOJA_LAT = -3.884346
    LOJA_LON = -38.605275
    ENTREGA_RAIO_MAX_KM = 30
    ENTREGA_PRECO_POR_KM = 1.00
    ENTREGA_TAXA_MINIMA = 5.00
    GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024 # 16MB Limit
