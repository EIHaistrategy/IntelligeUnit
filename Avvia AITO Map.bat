@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js non trovato. Installa la versione LTS da https://nodejs.org e riprova. & pause & exit /b 1)
if not exist node_modules call npm install --omit=dev
start "" http://localhost:3000/admin
call npm start
pause
