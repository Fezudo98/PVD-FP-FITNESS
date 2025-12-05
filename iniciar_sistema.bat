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
        ECHO Verifique sua conexao com a internet.
        ECHO O sistema tentara iniciar com a versao atual.
        ECHO.
        pause
    ) else (
        ECHO.
        ECHO --- Atualizacao concluida. Instalando dependencias... ---
        call venv\Scripts\activate.bat
        pip install -r requirements.txt
        flask db upgrade
        ECHO.
    )
) else (
    ECHO --- Sistema ja esta atualizado. ---
)
ECHO.

:: --- ETAPA 2: EXECUTANDO PATCHES DE MANUTENCAO ---
if exist patches\*.py (
    ECHO --- Verificando scripts de manutencao... ---
    call venv\Scripts\activate.bat
    
    for %%f in (patches\*.py) do (
        ECHO Executando patch: %%~nxf
        python "%%f"
        if %errorlevel% equ 0 (
            ECHO Sucesso! Movendo para executados...
            move "%%f" "patches\executed\" > nul
        ) else (
            ECHO !! ERRO AO EXECUTAR PATCH: %%~nxf !!
        )
        ECHO.
    )
)

:: --- ETAPA 3: INICIANDO O SISTEMA ---
ECHO.
ECHO --- Iniciando o servidor... ---
ECHO.
call venv\Scripts\activate.bat
python run.py
pause
