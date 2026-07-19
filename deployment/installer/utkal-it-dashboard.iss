; Inno Setup blueprint for the Utkal IT Dashboard deployment package.

#define AppName "Utkal IT Dashboard"
#define AppVersion "0.1.0"
#define AppPublisher "UAIL IT"
#define StageRoot "..\staging\current"

[Setup]
AppId={{44E2B0D0-7D50-4F2A-8E8E-6B7F3C2E8B1A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={commonappdata}\UAIL\ITDashboard
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
ArchitecturesInstallIn64BitMode=x64
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
Name: "autostart"; Description: "Register dashboard services to start automatically on boot"; Flags: checkedonce

[Files]
Source: "{#StageRoot}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\runtime\node\*"; DestDir: "{app}\runtime\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\runtime-tools\*"; DestDir: "{app}\runtime-tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\metadata\*"; DestDir: "{app}\metadata"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageRoot}\postgres\runtime\*"; DestDir: "{app}\postgres\runtime"; Flags: skipifsourcedoesntexist ignoreversion recursesubdirs createallsubdirs
Source: "support\*"; DestDir: "{app}\support"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\postgres\support\install-postgres-offline.ps1"; DestDir: "{app}\support"; Flags: skipifsourcedoesntexist ignoreversion

[Dirs]
Name: "{commonappdata}\UAIL\ITDashboard"
Name: "{commonappdata}\UAIL\ITDashboard\sessions"
Name: "{commonappdata}\UAIL\ITDashboard\logs"
Name: "{commonappdata}\UAIL\ITDashboard\config"
Name: "{commonappdata}\UAIL\ITDashboard\admin\reauth"

[Code]
var
  PostgresModePage: TInputOptionWizardPage;
  PostgresHostPage: TInputQueryWizardPage;
  PostgresSecretPage: TInputQueryWizardPage;
  PostgresSslPage: TInputOptionWizardPage;
  NutanixPage: TInputQueryWizardPage;
  SolarWindsServersPage: TInputQueryWizardPage;
  SolarWindsNetworksPage: TInputQueryWizardPage;
  SymphonyPage: TInputQueryWizardPage;
  DashboardPortsPage: TInputQueryWizardPage;
  GeneratedAppAuthSecret: string;

procedure InitializeWizard;
begin
  GeneratedAppAuthSecret := '';

  PostgresModePage :=
    CreateInputOptionPage(
      wpSelectDir,
      'Database Setup',
      'Choose how PostgreSQL will be provided',
      'Leave this unchecked for the simpler SQLite-first deployment. Enable it only when you explicitly want bundled PostgreSQL.',
      False,
      False
    );
  PostgresModePage.Add('Install bundled PostgreSQL locally on this server');
  PostgresModePage.Values[0] := False;

  PostgresHostPage :=
    CreateInputQueryPage(
      PostgresModePage.ID,
      'Postgres Connection',
      'Enter the Postgres connection details',
      'These values are optional when using the SQLite-first deployment. For bundled local PostgreSQL, keep host as localhost and user as postgres.'
    );
  PostgresHostPage.Add('Postgres host', False);
  PostgresHostPage.Add('Postgres port', False);
  PostgresHostPage.Add('Database name', False);
  PostgresHostPage.Add('Database user', False);
  PostgresHostPage.Values[0] := '';
  PostgresHostPage.Values[1] := '5432';
  PostgresHostPage.Values[2] := '';
  PostgresHostPage.Values[3] := '';

  PostgresSecretPage :=
    CreateInputQueryPage(
      PostgresHostPage.ID,
      'Secret Store',
      'Enter the local secret-store passphrase',
      'The passphrase is required for encrypted collector credentials. Postgres password is required only when bundled PostgreSQL is enabled.'
    );
  PostgresSecretPage.Add('Postgres password', True);
  PostgresSecretPage.Add('Secret-store passphrase', True);

  PostgresSslPage :=
    CreateInputOptionPage(
      PostgresSecretPage.ID,
      'Postgres SSL',
      'Choose whether SSL is required',
      'Leave this disabled for the bundled local PostgreSQL install.',
      False,
      False
    );
  PostgresSslPage.Add('Require SSL for Postgres connection');
  PostgresSslPage.Values[0] := False;

  NutanixPage :=
    CreateInputQueryPage(
      PostgresSslPage.ID,
      'Nutanix Source',
      'Enter the Nutanix collector connection details',
      'These values seed the deployed .env file and the Postgres-backed collector configuration.'
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

function ShouldInstallBundledPostgres(): Boolean;
begin
  Result := PostgresModePage.Values[0];
end;

function IsLocalhostValue(const Value: string): Boolean;
var
  Normalized: string;
begin
  Normalized := Lowercase(Trim(Value));
  Result :=
    (Normalized = 'localhost') or
    (Normalized = '127.0.0.1') or
    (Normalized = '::1') or
    (Normalized = '.');
end;

function BuildPostgresUrl(): string;
begin
  Result :=
    'postgresql://' +
    UrlEncode(TrimmedPageValue(PostgresHostPage, 3)) + ':' +
    UrlEncode(TrimmedPageValue(PostgresSecretPage, 0)) + '@' +
    TrimmedPageValue(PostgresHostPage, 0) + ':' +
    TrimmedPageValue(PostgresHostPage, 1) + '/' +
    UrlEncode(TrimmedPageValue(PostgresHostPage, 2));
end;

function GetPostgresSslValue(): string;
begin
  if PostgresSslPage.Values[0] then
    Result := 'true'
  else
    Result := 'false';
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
  PostgresUrlLine: string;
  PostgresSslLine: string;
begin
  EnvPath := AddBackslash(GetAppRoot()) + '.env';
  ForceDirectories(GetAppRoot());

  if (TrimmedPageValue(PostgresHostPage, 0) <> '') and (TrimmedPageValue(PostgresHostPage, 2) <> '') and (TrimmedPageValue(PostgresHostPage, 3) <> '') and (TrimmedPageValue(PostgresSecretPage, 0) <> '') then
  begin
    PostgresUrlLine := 'POSTGRES_URL=' + BuildPostgresUrl() + #13#10;
    PostgresSslLine := 'POSTGRES_SSL=' + GetPostgresSslValue() + #13#10;
  end
  else
  begin
    PostgresUrlLine := '';
    PostgresSslLine := '';
  end;

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
    'SECRET_STORE_PASSPHRASE=' + TrimmedPageValue(PostgresSecretPage, 1) + #13#10 +
    PostgresUrlLine +
    PostgresSslLine +
    'POSTGRES_SECRET_PASSPHRASE=' + TrimmedPageValue(PostgresSecretPage, 1) + #13#10 +
    'APP_AUTH_SECRET=' + GetOrCreateAppAuthSecret() + #13#10 +
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

procedure RunBundledPostgresInstall();
var
  ScriptPath: string;
  InstallRoot: string;
  Params: string;
begin
  InstallRoot := GetInstallRoot();
  ScriptPath := AddBackslash(InstallRoot) + 'support\install-postgres-offline.ps1';
  Params :=
    '-BundleRoot ' + QuoteForParam(InstallRoot) + ' ' +
    '-PostgresInstallRoot ' + QuoteForParam('C:\Program Files\UAIL\PostgreSQL\18') + ' ' +
    '-PostgresDataRoot ' + QuoteForParam('C:\ProgramData\UAIL\postgresql-18\data') + ' ' +
    '-PostgresServiceName ' + QuoteForParam('UAILPostgreSQL18') + ' ' +
    '-PostgresPort ' + TrimmedPageValue(PostgresHostPage, 1) + ' ' +
    '-PostgresSuperuser ' + QuoteForParam(TrimmedPageValue(PostgresHostPage, 3)) + ' ' +
    '-PostgresPassword ' + QuoteForParam(TrimmedPageValue(PostgresSecretPage, 0)) + ' ' +
    '-DatabaseName ' + QuoteForParam(TrimmedPageValue(PostgresHostPage, 2));
  RunPowerShellScript(
    ScriptPath,
    Params,
    'Failed to install bundled PostgreSQL.'
  );
end;

procedure RunNodeSupportValidation();
var
  NodeExe: string;
  ScriptPath: string;
  Params: string;
begin
  NodeExe := AddBackslash(GetInstallRoot()) + 'runtime\node\node.exe';
  ScriptPath := AddBackslash(GetInstallRoot()) + 'support\validate-postgres.js';
  Params := QuoteForParam(ScriptPath) + ' ' + QuoteForParam(GetAppRoot());
  ExecAndCheck(NodeExe, Params, 'Postgres connection validation failed. Check host, port, database, user, password, and SSL settings.');
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

  if ShouldInstallBundledPostgres() then
    RunBundledPostgresInstall();

  WriteEnvFile();
  RunPowerShellSupport(
    'update-service-manifest.ps1',
    '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -OperatorPort ' + OperatorPortValue + ' -AdminPort ' + AdminPortValue,
    'Failed to patch the installed service manifest.'
  );

  RunNodeSupportValidation();

  if IsTaskSelected('firewallrule') then
    RunPowerShellSupport(
      'configure-firewall.ps1',
      '-OperatorPort ' + OperatorPortValue + ' -AdminPort ' + AdminPortValue,
      'Failed to configure the Windows Firewall rule.'
    );

  if IsTaskSelected('startstack') then
    RunPowerShellSupport(
      'bootstrap-stack.ps1',
      '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -RuntimeRoot ' + QuoteForParam(RuntimeRoot),
      'Failed to start dashboard services through PM2.'
    );

  if IsTaskSelected('autostart') then
    RunPowerShellSupport(
      'register-startup-task.ps1',
      '-InstallRoot ' + QuoteForParam(InstallRoot) + ' -RuntimeRoot ' + QuoteForParam(RuntimeRoot),
      'Failed to register the dashboard startup task.'
    );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = PostgresHostPage.ID then
  begin
    if ShouldInstallBundledPostgres() and (TrimmedPageValue(PostgresHostPage, 0) = '') then
    begin
      MsgBox('Postgres host is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(PostgresHostPage, 0) <> '') and (not IsNumberInRange(TrimmedPageValue(PostgresHostPage, 1), 1, 65535)) then
    begin
      MsgBox('Postgres port must be a valid number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
    if Result and ShouldInstallBundledPostgres() and (TrimmedPageValue(PostgresHostPage, 2) = '') then
    begin
      MsgBox('Database name is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and ShouldInstallBundledPostgres() and (TrimmedPageValue(PostgresHostPage, 3) = '') then
    begin
      MsgBox('Database user is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and ShouldInstallBundledPostgres() and (not IsLocalhostValue(TrimmedPageValue(PostgresHostPage, 0))) then
    begin
      MsgBox('Bundled PostgreSQL install requires the Postgres host to remain localhost.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PostgresSecretPage.ID then
  begin
    if ShouldInstallBundledPostgres() and (TrimmedPageValue(PostgresSecretPage, 0) = '') then
    begin
      MsgBox('Postgres password is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(PostgresSecretPage, 1) = '') then
    begin
      MsgBox('Secret-store passphrase is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PostgresSslPage.ID then
  begin
    if ShouldInstallBundledPostgres() and PostgresSslPage.Values[0] then
    begin
      MsgBox('Leave Postgres SSL disabled when using the bundled local PostgreSQL install.', mbError, MB_OK);
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
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    PerformFirstRunBootstrap();
end;
