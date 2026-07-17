@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting administrative privileges...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs" >nul 2>&1
  exit /b %errorlevel%
)

set "SCRIPT_DIR=%~dp0"
set "PROVISION_SCRIPT=%SCRIPT_DIR%installer\support\provision-staged-deployment.ps1"

if not exist "%PROVISION_SCRIPT%" (
  echo Provisioning script not found:
  echo   %PROVISION_SCRIPT%
  exit /b 1
)

echo Running staged deployment provisioner...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROVISION_SCRIPT%" %*
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
  echo Deployment failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo Deployment completed successfully.
exit /b 0
