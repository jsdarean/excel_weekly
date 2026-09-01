@echo off
rem Kill any existing process listening on port 3001 to avoid EADDRINUSE
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
cd /d "%~dp0server"
rem Poll until the server responds (max ~60s), then open the page in the default browser
start "" powershell -WindowStyle Hidden -Command "for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/' -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep 1 } }; Start-Process 'http://localhost:3001/'"
npm start
pause
