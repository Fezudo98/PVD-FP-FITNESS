#!/bin/bash

# ==============================================================================
# Script de Atualização e Deploy Automático (Sistema FP Fitness)
# ==============================================================================

# Caminho do projeto (ajuste se necessário)
PROJECT_DIR="/var/www/fpfitness"
SERVICE_NAME="fpfitness"

echo "========================================="
echo "🚀 Iniciando o Deploy (Atualização)..."
echo "========================================="

cd $PROJECT_DIR || { echo "❌ Erro: Diretório $PROJECT_DIR não encontrado."; exit 1; }

# 1. Atualizar o código fonte do GitHub
echo "🔄 Baixando atualizações do GitHub..."
git fetch --all

# Se uma tag foi passada como argumento, faz checkout da tag. Senão, puxa a master.
if [ -z "$1" ]; then
    echo "📌 Nenhuma tag especificada. Puxando a branch 'master' mais recente."
    git reset --hard origin/master
    git pull origin master
else
    echo "📌 Tag especificada: $1. Fazendo checkout..."
    git checkout tags/$1
fi

# 2. Ativar Ambiente Virtual
if [ -d "venv" ]; then
    echo "🐍 Ativando Ambiente Virtual Python..."
    source venv/bin/activate
else
    echo "❌ Erro: Ambiente virtual 'venv' não encontrado! Execute: python3 -m venv venv"
    exit 1
fi

# 3. Atualizar Dependências (Pip)
echo "📦 Instalando/Atualizando bibliotecas Python..."
pip install -r requirements.txt

# 4. Migrações de Banco de Dados
echo "🗄️ Aplicando migrações no Banco de Dados..."
export FLASK_APP=run.py
export FLASK_ENV=production
flask db upgrade

# 5. Reiniciar o Servidor Gunicorn via Systemd
echo "🔄 Reiniciando o serviço $SERVICE_NAME..."
sudo systemctl restart $SERVICE_NAME

# Verificar se iniciou corretamente
sleep 2
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    echo "✅ Deploy concluído com SUCESSO! O sistema está ONLINE."
else
    echo "❌ ATENÇÃO: O serviço falhou ao iniciar. Verifique os logs com: sudo journalctl -u $SERVICE_NAME -f"
fi
