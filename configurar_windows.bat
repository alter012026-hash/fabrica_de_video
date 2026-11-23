@echo off
cd /d "%~dp0"
echo Configurando Estudio Video e a voz neural em portugues...
where py >nul 2>nul
if %errorlevel%==0 (set PY=py) else (set PY=python)
%PY% -m venv .venv
if errorlevel 1 goto erro
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto erro
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto erro
.venv\Scripts\python.exe -m piper.download_voices pt_BR-faber-medium --data-dir models
if errorlevel 1 goto erro
echo.
echo Configuracao concluida. Agora execute iniciar_windows.bat.
pause
exit /b 0
:erro
echo.
echo A configuracao falhou. Confira o Python 3.10+ e sua conexao com a internet.
pause
exit /b 1
