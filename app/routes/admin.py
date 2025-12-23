from flask import Blueprint, send_from_directory, redirect, current_app
import os

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/')
def index():
    return redirect('/login')

@admin_bp.route('/login')
def login_page():
    return send_from_directory(os.path.join(current_app.root_path, '..', 'frontend'), 'login.html')

@admin_bp.route('/loja_online.html')
def admin_online_store_page():
    return send_from_directory(os.path.join(current_app.root_path, '..', 'frontend'), 'loja_online.html')
