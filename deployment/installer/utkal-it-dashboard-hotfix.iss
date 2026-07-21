; In-place dashboard hotfix package for auth UI updates, server table refinements,
; and Nutanix server disk telemetry fallback.

#define AppName "Utkal IT Dashboard Hotfix"
#define AppVersion "1.0.0.2"
#define AppPublisher "UAIL IT"
#ifndef StageRoot
#define StageRoot "..\staging\current"
#endif

[Setup]
AppId={{44E2B0D0-7D50-4F2A-8E8E-6B7F3C2E8B1A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={commonappdata}\UAIL\ITDashboard
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma
SolidCompression=yes
WizardStyle=modern
OutputDir=output
OutputBaseFilename=utkal-it-dashboard-hotfix
Uninstallable=no
CreateUninstallRegKey=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#StageRoot}\app\dashboard\*"; DestDir: "{app}\app\dashboard"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\app\collectors\nutanix\dist\*"; DestDir: "{app}\app\collectors\nutanix\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "support\apply-dashboard-hotfix.ps1"; DestDir: "{app}\support"; Flags: ignoreversion

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\support\apply-dashboard-hotfix.ps1"" -InstallRoot ""{app}"""; Flags: runhidden waituntilterminated
