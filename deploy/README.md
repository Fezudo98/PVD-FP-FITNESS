# Guia de Configuração da VPS (Linux Ubuntu)

Siga este passo a passo uma única vez quando for instalar o sistema na sua VPS. Depois de configurado, **para atualizar o sistema**, basta rodar `bash deploy.sh`.

## Passo 1: Preparando o Terreno
Acesse sua VPS por SSH e instale as ferramentas necessárias:
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv nginx git sqlite3 -y
```

## Passo 2: Clonando o Projeto
```bash
sudo mkdir -p /var/www/fpfitness
sudo chown -R $USER:$USER /var/www/fpfitness
cd /var/www/fpfitness
git clone URL_DO_SEU_REPOSITORIO .
```
> Obs: Certifique-se de configurar a chave SSH ou Token do Github na sua VPS para permitir o clone.

## Passo 3: Criando o Ambiente Python
```bash
cd /var/www/fpfitness
python3 -m venv venv
```

## Passo 4: Variáveis de Ambiente (.env)
Crie o arquivo `.env` dentro de `/var/www/fpfitness`:
```bash
nano .env
```
Cole suas chaves secretas (Mercado Pago, Melhor Envio, JWT_SECRET_KEY). Salve com `CTRL+X`, `Y`, `Enter`.

## Passo 5: Configurando o Gunicorn e Systemd
Vamos usar o arquivo template que preparamos no projeto.
```bash
# Copia o arquivo de serviço para a pasta do sistema
sudo cp deploy/fpfitness.service /etc/systemd/system/

# Ativa o serviço para ligar junto com a VPS
sudo systemctl daemon-reload
sudo systemctl start fpfitness
sudo systemctl enable fpfitness
```

## Passo 6: Configurando o Nginx (Seu Domínio)
```bash
# Copia o arquivo do Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/fpfitness

# Lembre-se de editar o arquivo e colocar o seu domínio real
sudo nano /etc/nginx/sites-available/fpfitness

# Ativa o site
sudo ln -s /etc/nginx/sites-available/fpfitness /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Pronto! 🚀
Agora o seu sistema está rodando em produção.
Toda vez que você enviar um código novo para o GitHub, basta entrar na VPS, rodar `cd /var/www/fpfitness` e dar o comando:
```bash
bash deploy.sh
```
Ele vai puxar o código, atualizar o banco e reiniciar tudo automaticamente em 2 segundos!
