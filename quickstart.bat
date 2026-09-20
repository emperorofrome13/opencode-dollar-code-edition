@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\windows-launcher.ps1" -Action Start %*
if errorlevel 1 (
  echo.
  echo Startup failed. See the message above and logs\launcher.
  pause
  exit /b 1
)
endlocal
