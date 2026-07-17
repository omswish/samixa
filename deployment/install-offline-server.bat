@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting administrative privileges...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs" >nul 2>&1
  exit /b %errorlevel%
)

set "SCRIPT_DIR=%~dp0"
set "INSTALL_SCRIPT=%SCRIPT_DIR%install-offline-server.ps1"

if not exist "%INSTALL_SCRIPT%" (
  echo Offline install script not found:
  echo   %INSTALL_SCRIPT%
  exit /b 1
)

echo Running offline server installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%" %*
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
  echo Offline server installation failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo Offline server installation completed successfully.
exit /b 0
