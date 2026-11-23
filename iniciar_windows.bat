@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Execute configurar_windows.bat primeiro.
  pause
  exit /b 1
)
.venv\Scripts\python.exe -c "import groq" >nul 2>nul
if errorlevel 1 (
  echo Instalando cliente oficial da Groq na primeira execucao desta versao...
  .venv\Scripts\python.exe -m pip install groq
  if errorlevel 1 (
    echo Nao foi possivel instalar o cliente Groq. Confira sua conexao e tente novamente.
    pause
    exit /b 1
  )
)
start "Estudio Video" http://127.0.0.1:8787
.venv\Scripts\python.exe server.py
