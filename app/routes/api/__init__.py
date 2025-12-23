from flask import Blueprint

api_bp = Blueprint('api', __name__)

from . import products, sales, users, marketing, dashboard
