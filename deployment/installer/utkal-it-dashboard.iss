; Inno Setup blueprint for the Utkal IT Dashboard deployment package.

#define AppName "Utkal IT Dashboard"
#define AppVersion "1.2.1"
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
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma
SolidCompression=yes
WizardStyle=modern
OutputDir=output
OutputBaseFilename=utkal-it-dashboard-setup

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "firewallrule"; Description: "Create Windows Firewall rules for the operator and admin web ports"; Flags: checkedonce
Name: "startstack"; Description: "Start dashboard services after install"; Flags: checkedonce
Name: "autostart"; Description: "Register dashboard services to restore automatically on Windows startup"; Flags: checkedonce

[Files]
Source: "{#StageRoot}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\runtime\node\*"; DestDir: "{app}\runtime\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\runtime-tools\*"; DestDir: "{app}\runtime-tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\metadata\service-manifest.json"; DestDir: "{app}\metadata"; Flags: ignoreversion
Source: "support\bootstrap-stack.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "support\configure-firewall.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "support\pm2-resurrect.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "support\register-startup-task.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "support\repair-runtime-permissions.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "support\update-service-manifest.ps1"; DestDir: "{app}\support"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\UAIL\ITDashboard"
Name: "{commonappdata}\UAIL\ITDashboard\sessions"
Name: "{commonappdata}\UAIL\ITDashboard\logs"
Name: "{commonappdata}\UAIL\ITDashboard\config"
Name: "{commonappdata}\UAIL\ITDashboard\admin\reauth"

[Code]
var
  SecretStorePage: TInputQueryWizardPage;
  NutanixPage: TInputQueryWizardPage;
  SolarWindsServersPage: TInputQueryWizardPage;
  SolarWindsNetworksPage: TInputQueryWizardPage;
  SymphonyPage: TInputQueryWizardPage;
  DashboardPortsPage: TInputQueryWizardPage;
  AppLoginPage: TInputQueryWizardPage;
  GeneratedAppAuthSecret: string;

procedure InitializeWizard;
begin
  GeneratedAppAuthSecret := '';

  SecretStorePage := CreateInputQueryPage(
      wpSelectDir,
      'Secret Store',
      'Enter the local secret-store passphrase',
      'This passphrase protects the locally stored collector credentials. Keep it stable across reinstalls on the same server.'
    );
  SecretStorePage.Add('Secret-store passphrase', True);

  NutanixPage :=
    CreateInputQueryPage(
      SecretStorePage.ID,
      'Nutanix Source',
      'Enter the Nutanix collector connection details',
      'These values seed the deployed .env file and the local encrypted collector configuration.'
    );
  NutanixPage.Add('Nutanix host', False);
  NutanixPage.Add('Nutanix port', False);
  NutanixPage.Add('Nutanix username', False);
  NutanixPage.Add('Nutanix password', True);
  NutanixPage.Values[0] := '10.23.50.27';
  NutanixPage.Values[1] := '9440';

  SolarWindsServersPage :=
    CreateInputQueryPage(
      NutanixPage.ID,
      'SolarWinds Servers Source',
      'Enter the SolarWinds servers portal connection details',
      'These values seed the deployed .env file for the SolarWinds 45 collector.'
    );
  SolarWindsServersPage.Add('SolarWinds servers host', False);
  SolarWindsServersPage.Add('SolarWinds servers username', False);
  SolarWindsServersPage.Add('SolarWinds servers password', True);
  SolarWindsServersPage.Values[0] := '10.36.91.45';

  SolarWindsNetworksPage :=
    CreateInputQueryPage(
      SolarWindsServersPage.ID,
      'SolarWinds Networks Source',
      'Enter the SolarWinds networks portal connection details',
      'These values seed the deployed .env file for the SolarWinds 46 collector.'
    );
  SolarWindsNetworksPage.Add('SolarWinds networks host', False);
  SolarWindsNetworksPage.Add('SolarWinds networks username', False);
  SolarWindsNetworksPage.Add('SolarWinds networks password', True);
  SolarWindsNetworksPage.Values[0] := '10.36.91.46';

  SymphonyPage :=
    CreateInputQueryPage(
      SolarWindsNetworksPage.ID,
      'HSD Source',
      'Enter the HSD portal connection details',
      'Use the dedicated HSD dashboard URL and HSD credentials for the Symphony collector.'
    );
  SymphonyPage.Add('HSD dashboard URL', False);
  SymphonyPage.Add('HSD username', False);
  SymphonyPage.Add('HSD password', True);
  SymphonyPage.Values[0] := 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';

  DashboardPortsPage :=
    CreateInputQueryPage(
      SymphonyPage.ID,
      'Dashboard Ports',
      'Choose the operator and admin web ports',
      'Expose only these two web ports to approved internal users. Internal service ports remain loopback-only.'
    );
  DashboardPortsPage.Add('Operator port', False);
  DashboardPortsPage.Add('Admin port', False);
  DashboardPortsPage.Values[0] := '21060';
  DashboardPortsPage.Values[1] := '21061';

  AppLoginPage :=
    CreateInputQueryPage(
      DashboardPortsPage.ID,
      'Dashboard Login IDs',
      'Choose the operator and admin login IDs',
      'These IDs label the fixed admin and operator portals. Users will still enter only the relevant portal password on each URL.'
    );
  AppLoginPage.Add('Operator login ID', False);
  AppLoginPage.Add('Admin login ID', False);
  AppLoginPage.Values[0] := 'operator';
  AppLoginPage.Values[1] := 'admin';
end;

function TrimmedPageValue(Page: TInputQueryWizardPage; Index: Integer): string;
begin
  Result := Trim(Page.Values[Index]);
end;

function IsNumberInRange(const Value: string; MinValue: Integer; MaxValue: Integer): Boolean;
var
  ParsedValue: Integer;
begin
  ParsedValue := StrToIntDef(Value, MinValue - 1);
  Result := (ParsedValue >= MinValue) and (ParsedValue <= MaxValue);
end;

function HexDigit(Value: Integer): string;
begin
  if Value < 10 then
    Result := Chr(Ord('0') + Value)
  else
    Result := Chr(Ord('A') + Value - 10);
end;

function HexByte(Value: Integer): string;
begin
  Result := HexDigit((Value shr 4) and $F) + HexDigit(Value and $F);
end;

function UrlEncode(const Value: string): string;
var
  I: Integer;
  Ch: Char;
begin
  Result := '';
  for I := 1 to Length(Value) do
  begin
    Ch := Value[I];
    if ((Ch >= 'A') and (Ch <= 'Z')) or
       ((Ch >= 'a') and (Ch <= 'z')) or
       ((Ch >= '0') and (Ch <= '9')) or
       (Ch = '-') or (Ch = '_') or (Ch = '.') or (Ch = '~')
    then
      Result := Result + Ch
    else
      Result := Result + '%' + HexByte(Ord(Ch));
  end;
end;

function NormalizeGuidToken(const Value: string): string;
begin
  Result := Lowercase(Value);
  StringChangeEx(Result, '{', '', True);
  StringChangeEx(Result, '}', '', True);
  StringChangeEx(Result, '-', '', True);
end;

function GenerateSecret(PartCount: Integer): string;
var
  I: Integer;
  TypeLib: Variant;
begin
  Result := '';
  TypeLib := CreateOleObject('Scriptlet.TypeLib');
  for I := 1 to PartCount do
    Result := Result + NormalizeGuidToken(TypeLib.Guid);
end;

function GetOrCreateAppAuthSecret(): string;
begin
  if GeneratedAppAuthSecret = '' then
    GeneratedAppAuthSecret := GenerateSecret(8);
  Result := GeneratedAppAuthSecret;
end;

function GetInstallRoot(): string;
begin
  Result := ExpandConstant('{app}');
end;

function GetAppRoot(): string;
begin
  Result := AddBackslash(GetInstallRoot()) + 'app';
end;

function GetRuntimeRoot(): string;
begin
  Result := GetInstallRoot();
end;

function GetPowerShellExe(): string;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

function QuoteForParam(const Value: string): string;
begin
  Result := '"' + Value + '"';
end;

function WriteEnvFile(): string;
var
  EnvPath: string;
  Contents: string;
begin
  EnvPath := AddBackslash(GetAppRoot()) + '.env';
  ForceDirectories(GetAppRoot());

  Contents :=
    'NUTANIX_USER=' + TrimmedPageValue(NutanixPage, 2) + #13#10 +
    'NUTANIX_PASS=' + TrimmedPageValue(NutanixPage, 3) + #13#10 +
    'NUTANIX_HOST=' + TrimmedPageValue(NutanixPage, 0) + #13#10 +
    'NUTANIX_PORT=' + TrimmedPageValue(NutanixPage, 1) + #13#10 +
    'SW_HOST_SERVERS=' + TrimmedPageValue(SolarWindsServersPage, 0) + #13#10 +
    'SW_SERVERS_USER=' + TrimmedPageValue(SolarWindsServersPage, 1) + #13#10 +
    'SW_SERVERS_PASS=' + TrimmedPageValue(SolarWindsServersPage, 2) + #13#10 +
    'SW_HOST_NETWORKS=' + TrimmedPageValue(SolarWindsNetworksPage, 0) + #13#10 +
    'SW_NETWORKS_USER=' + TrimmedPageValue(SolarWindsNetworksPage, 1) + #13#10 +
    'SW_NETWORKS_PASS=' + TrimmedPageValue(SolarWindsNetworksPage, 2) + #13#10 +
    'SYM_URL=' + TrimmedPageValue(SymphonyPage, 0) + #13#10 +
    'SYM_USER=' + TrimmedPageValue(SymphonyPage, 1) + #13#10 +
    'SYM_PASS=' + TrimmedPageValue(SymphonyPage, 2) + #13#10 +
    'ITDASH_RUNTIME_ROOT=' + GetRuntimeRoot() + #13#10 +
    'SECRET_STORE_PASSPHRASE=' + TrimmedPageValue(SecretStorePage, 0) + #13#10 +
    'APP_AUTH_SECRET=' + GetOrCreateAppAuthSecret() + #13#10 +
    'APP_ADMIN_LOGIN_ID=' + Lowercase(TrimmedPageValue(AppLoginPage, 1)) + #13#10 +
    'APP_OPERATOR_LOGIN_ID=' + Lowercase(TrimmedPageValue(AppLoginPage, 0)) + #13#10 +
    'APP_ADMIN_PASSWORD=17172737' + #13#10 +
    'APP_OPERATOR_PASSWORD=17172737' + #13#10 +
    'APP_LOGIN_PASSWORD=17172737' + #13#10 +
    'VIEWER_SESSION_DAYS=365' + #13#10 +
    'ADMIN_SESSION_HOURS=12' + #13#10 +
    'OPERATOR_FRONTDOOR_PORT=' + TrimmedPageValue(DashboardPortsPage, 0) + #13#10 +
    'ADMIN_FRONTDOOR_PORT=' + TrimmedPageValue(DashboardPortsPage, 1) + #13#10;

  if not SaveStringToFile(EnvPath, Contents, False) then
    RaiseException('Failed to write ' + EnvPath);

  Result := EnvPath;
end;

function ExecAndCheck(const FileName: string; const Params: string; const ErrorMessage: string): Integer;
var
  ResultCode: Integer;
begin
  Log('Executing: ' + FileName + ' ' + Params);
  if not Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    RaiseException(ErrorMessage);
  if ResultCode <> 0 then
    RaiseException(ErrorMessage + ' Exit code: ' + IntToStr(ResultCode));
  Result := ResultCode;
end;

procedure RunPowerShellScript(const ScriptPath: string; const ExtraArgs: string; const ErrorMessage: string);
var
  Params: string;
begin
  Params := '-NoProfile -ExecutionPolicy Bypass -File ' + QuoteForParam(ScriptPath);
  if Trim(ExtraArgs) <> '' then
    Params := Params + ' ' + ExtraArgs;
  ExecAndCheck(GetPowerShellExe(), Params, ErrorMessage);
end;

procedure RunPowerShellSupport(const ScriptName: string; const ExtraArgs: string; const ErrorMessage: string);
var
  ScriptPath: string;
begin
  ScriptPath := AddBackslash(GetInstallRoot()) + 'support\' + ScriptName;
  RunPowerShellScript(ScriptPath, ExtraArgs, ErrorMessage);
end;

procedure PerformFirstRunBootstrap();
var
  InstallRoot: string;
  RuntimeRoot: string;
  OperatorPortValue: string;
  AdminPortValue: string;
begin
  InstallRoot := GetInstallRoot();
  RuntimeRoot := GetRuntimeRoot();
  OperatorPortValue := TrimmedPageValue(DashboardPortsPage, 0);
  AdminPortValue := TrimmedPageValue(DashboardPortsPage, 1);

  WriteEnvFile();
  RunPowerShellSupport(
    'update-service-manifest.ps1',
    '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -OperatorPort ' + OperatorPortValue + ' -AdminPort ' + AdminPortValue,
    'Failed to patch the installed service manifest.'
  );

  if WizardIsTaskSelected('firewallrule') then
    RunPowerShellSupport(
      'configure-firewall.ps1',
      '-OperatorPort ' + OperatorPortValue + ' -AdminPort ' + AdminPortValue,
      'Failed to configure the Windows Firewall rule.'
    );

  if WizardIsTaskSelected('startstack') then
    RunPowerShellSupport(
      'bootstrap-stack.ps1',
      '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -RuntimeRoot ' + QuoteForParam(RuntimeRoot),
      'Failed to start dashboard services through PM2.'
    );

  if WizardIsTaskSelected('autostart') then
    RunPowerShellSupport(
      'register-startup-task.ps1',
      '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -RuntimeRoot ' + QuoteForParam(RuntimeRoot),
      'Failed to register the dashboard startup task.'
    );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = SecretStorePage.ID then
  begin
    if TrimmedPageValue(SecretStorePage, 0) = '' then
    begin
      MsgBox('Secret-store passphrase is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = NutanixPage.ID then
  begin
    if TrimmedPageValue(NutanixPage, 0) = '' then
    begin
      MsgBox('Nutanix host is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (not IsNumberInRange(TrimmedPageValue(NutanixPage, 1), 1, 65535)) then
    begin
      MsgBox('Nutanix port must be a valid number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(NutanixPage, 2) = '') then
    begin
      MsgBox('Nutanix username is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(NutanixPage, 3) = '') then
    begin
      MsgBox('Nutanix password is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = SolarWindsServersPage.ID then
  begin
    if TrimmedPageValue(SolarWindsServersPage, 0) = '' then
    begin
      MsgBox('SolarWinds servers host is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SolarWindsServersPage, 1) = '') then
    begin
      MsgBox('SolarWinds servers username is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SolarWindsServersPage, 2) = '') then
    begin
      MsgBox('SolarWinds servers password is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = SolarWindsNetworksPage.ID then
  begin
    if TrimmedPageValue(SolarWindsNetworksPage, 0) = '' then
    begin
      MsgBox('SolarWinds networks host is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SolarWindsNetworksPage, 1) = '') then
    begin
      MsgBox('SolarWinds networks username is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SolarWindsNetworksPage, 2) = '') then
    begin
      MsgBox('SolarWinds networks password is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = SymphonyPage.ID then
  begin
    if TrimmedPageValue(SymphonyPage, 0) = '' then
    begin
      MsgBox('HSD dashboard URL is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SymphonyPage, 1) = '') then
    begin
      MsgBox('HSD username is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(SymphonyPage, 2) = '') then
    begin
      MsgBox('HSD password is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = DashboardPortsPage.ID then
  begin
    if not IsNumberInRange(TrimmedPageValue(DashboardPortsPage, 0), 1, 65535) then
    begin
      MsgBox('Operator port must be a valid number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (not IsNumberInRange(TrimmedPageValue(DashboardPortsPage, 1), 1, 65535)) then
    begin
      MsgBox('Admin port must be a valid number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(DashboardPortsPage, 0) = TrimmedPageValue(DashboardPortsPage, 1)) then
    begin
      MsgBox('Operator port and admin port must be different.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = AppLoginPage.ID then
  begin
    if TrimmedPageValue(AppLoginPage, 0) = '' then
    begin
      MsgBox('Operator login ID is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(AppLoginPage, 1) = '') then
    begin
      MsgBox('Admin login ID is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (CompareText(TrimmedPageValue(AppLoginPage, 0), TrimmedPageValue(AppLoginPage, 1)) = 0) then
    begin
      MsgBox('Operator login ID and admin login ID must be different.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    PerformFirstRunBootstrap();
end;
