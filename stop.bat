@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\windows-launcher.ps1" -Action Stop
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
