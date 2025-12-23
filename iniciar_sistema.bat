@echo off
TITLE Sistema FP Moda Fitness - Launcher
ECHO =========================================================
ECHO SISTEMA FP MODA FITNESS
ECHO =========================================================
ECHO.

:: --- ETAPA 1: VERIFICANDO ATUALIZACOES ---
ECHO --- Verificando atualizacoes... ---
git fetch origin
git status -uno | findstr /C:"Your branch is behind" > nul
if %errorlevel% equ 0 (
    ECHO.
    ECHO --- Nova versao encontrada! Atualizando... ---
    git reset --hard origin/master
    if %errorlevel% neq 0 (
        ECHO.
        ECHO !! ERRO AO ATUALIZAR !!
        ECHO O sistema tentara iniciar com a versao atual.
        pause
    ) else (
        ECHO.
        ECHO --- Atualizacao concluida. Instalando dependencias... ---
        call venv\Scripts\activate.bat
        pip install -r requirements.txt
    )
) else (
    ECHO --- Sistema ja esta atualizado. ---
)
ECHO.

:: --- ETAPA 1.5: GARANTINDO BANCO DE DADOS (CRUCIAL) ---
ECHO --- Verificando integridade do Banco de Dados... ---
call venv\Scripts\activate.bat
set FLASK_APP=run.py
:: Tenta criar a migração se houver mudanças locais (opcional, mas bom para dev)
flask db migrate -m "Auto migration on start" > nul 2>&1
:: Aplica qualquer mudança pendente
flask db upgrade
ECHO.

:: --- ETAPA 2: EXECUTANDO PATCHES DE MANUTENCAO ---
if exist patches\*.py (
    ECHO --- Verificando scripts de manutencao... ---
    :: (Mantive sua lógica aqui, está ótima)
    for %%f in (patches\*.py) do (
        ECHO Executando patch: %%~nxf
        python "%%f"
        if %errorlevel% equ 0 (
            move "%%f" "patches\executed\" > nul
        )
    )
)

:: --- ETAPA 3: INICIANDO O SISTEMA ---
ECHO.
ECHO --- Iniciando o servidor... ---
python standardize_inventory.py --auto
python run.py
pause