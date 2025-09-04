@echo off
TITLE Atualizador do Sistema FP Moda Fitness

ECHO =========================================================
ECHO ATUALIZADOR DO SISTEMA FP MODA FITNESS
ECHO =========================================================
ECHO.
ECHO ATENCAO: Certifique-se de que o servidor principal (a outra
ECHO          janela preta) esteja FECHADO antes de continuar.
ECHO.
pause

ECHO.
ECHO --- Conectando ao servidor e baixando atualizacoes... ---
ECHO.

:: Puxa as atualizações do repositório
git pull

:: Verifica se o 'git pull' deu erro
if %errorlevel% neq 0 (
    ECHO.
    ECHO =========================================================
    ECHO !! ERRO AO ATUALIZAR !!
    ECHO =========================================================
    ECHO Nao foi possivel baixar as atualizacoes.
    ECHO Verifique sua conexao com a internet e tente novamente.
    ECHO Se o erro persistir, entre em contato com o suporte.
    ECHO.
    pause
    exit
)

ECHO.
ECHO --- Atualizacoes baixadas. Verificando dependencias... ---
ECHO.

:: Reinstala as bibliotecas para garantir que qualquer nova seja adicionada
python -m venv venv >nul 2>&1
call venv\Scripts\activate.bat
pip install -r requirements.txt

ECHO.
ECHO =========================================================
ECHO  SISTEMA ATUALIZADO COM SUCESSO!
ECHO =========================================================
ECHO.
ECHO Voce ja pode fechar esta janela e iniciar o sistema
ECHO normalmente usando o arquivo 'start_server.bat'.
ECHO.
pause