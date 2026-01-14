@echo off
echo ===============================================
echo Cleaning background Scale & Tunnel processes...
echo ===============================================
taskkill /f /im ngrok.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo [*] Launching Ngrok...
start "Ngrok" ngrok http 4000

echo [*] Launching Main Application...
npm start