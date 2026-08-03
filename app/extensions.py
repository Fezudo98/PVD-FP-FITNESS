from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
cors = CORS()
# O limite padrão vale para toda rota que não tenha um @limiter.limit(...) próprio (ex: login,
# cadastro, consulta por CPF já têm limites bem mais apertados definidos rota a rota).
# "50 por hora" era baixo demais como teto geral: uma navegação normal pela loja (várias páginas
# de produto, cada uma disparando várias chamadas de API) estourava isso rapidamente.
limiter = Limiter(key_func=get_remote_address, default_limits=["2000 per day", "300 per hour"])
