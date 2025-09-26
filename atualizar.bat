@echo off
TITLE Atualizador do Sistema FP Moda Fitness
ECHO =========================================================
ECHO ATUALIZADOR DO SISTEMA FP MODA FITNESS
ECHO =========================================================
ECHO.
ECHO ATENCAO: Certifique-se de que o servidor (a janela preta)
ECHO esteja FECHADO antes de continuar.
ECHO.
pause
ECHO.
:: --- ETAPA 1: ATUALIZANDO OS ARQUIVOS DO SISTEMA ---
ECHO --- Conectando ao servidor e baixando a versao mais recente... ---
ECHO.
git fetch origin
git reset --hard origin/master
if %errorlevel% neq 0 (
ECHO.
ECHO =========================================================
ECHO !! ERRO AO ATUALIZAR OS ARQUIVOS !!
ECHO =========================================================
ECHO Nao foi possivel baixar as atualizacoes. Verifique sua
ECHO conexao com a internet e tente novamente.
ECHO.
pause
exit
)
ECHO.
ECHO --- Arquivos atualizados com sucesso. ---
ECHO.
:: --- ETAPA 2: ATIVANDO O AMBIENTE E ATUALIZANDO DEPENDENCIAS E BANCO DE DADOS ---
ECHO --- Ativando ambiente virtual... ---
call venv\Scripts\activate.bat
ECHO --- Verificando dependencias do sistema... ---
pip install -r requirements.txt
ECHO --- ATUALIZANDO O BANCO DE DADOS (ETAPA IMPORTANTE!)... ---
flask db upgrade
if %errorlevel% neq 0 (
ECHO.
ECHO =========================================================
ECHO !! ERRO AO ATUALIZAR O BANCO DE DADOS !!
ECHO =========================================================
ECHO Ocorreu uma falha critica ao atualizar a base de dados.
ECHO Entre em contato com o suporte tecnico imediatamente.
ECHO.
pause
exit
)
ECHO.
ECHO --- Banco de dados atualizado com sucesso. ---
ECHO.
:: --- ETAPA 3: FINALIZACAO ---
ECHO =========================================================
ECHO SISTEMA ATUALIZADO COM SUCESSO!
ECHO =========================================================
ECHO.
ECHO Voce ja pode fechar esta janela e iniciar o sistema
ECHO normalmente usando o arquivo 'start_server.bat'.
ECHO.
pause