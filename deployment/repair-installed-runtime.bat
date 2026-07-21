@echo off
setlocal

net session >nul 2>&1
if not %errorlevel%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs" >nul 2>&1
  exit /b
)

set "SCRIPT_DIR=%~dp0"
set "REPAIR_SCRIPT=%SCRIPT_DIR%tools\repair-installed-runtime.ps1"

if not exist "%REPAIR_SCRIPT%" (
  echo Repair script not found: %REPAIR_SCRIPT%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%REPAIR_SCRIPT%" %*
set "EXITCODE=%ERRORLEVEL%"

if not %EXITCODE%==0 (
  echo Repair failed with exit code %EXITCODE%.
  exit /b %EXITCODE%
)

echo Repair completed successfully.
exit /b 0
