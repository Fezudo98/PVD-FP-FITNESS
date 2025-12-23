from flask import Blueprint, send_from_directory, current_app
import os

resources_bp = Blueprint('resources', __name__)



@resources_bp.route('/frontend/<path:filename>')
def custom_static(filename):
    base_dir = os.path.dirname(current_app.root_path)
    return send_from_directory(os.path.join(base_dir, 'frontend'), filename)

@resources_bp.route('/uploads/<path:filename>')
def uploaded_file(filename):
    base_dir = os.path.dirname(current_app.root_path)
    return send_from_directory(os.path.join(base_dir, 'uploads'), filename)

@resources_bp.route('/barcodes/<path:filename>')
def serve_barcode_image(filename):
    base_dir = os.path.dirname(current_app.root_path)
    return send_from_directory(os.path.join(base_dir, 'barcodes'), filename)

# Catch-all for frontend files served at root (e.g. css/style.css, js/auth.js)
@resources_bp.route('/<path:filename>')
def serve_static_files(filename):
    base_dir = os.path.dirname(current_app.root_path)
    return send_from_directory(os.path.join(base_dir, 'frontend'), filename)
