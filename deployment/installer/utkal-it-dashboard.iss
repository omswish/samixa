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
DefaultDirName={autopf}\UAIL\ITDashboard
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
Source: "support\*"; DestDir: "{app}\support"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{commonappdata}\UAIL\itdash"
Name: "{commonappdata}\UAIL\itdash\sessions"
Name: "{commonappdata}\UAIL\itdash\logs"

[Code]
var
  PostgresHostPage: TInputQueryWizardPage;
  PostgresSecretPage: TInputQueryWizardPage;
  PostgresSslPage: TInputOptionWizardPage;
  DashboardPortsPage: TInputQueryWizardPage;
  GeneratedAppAuthSecret: string;

procedure InitializeWizard;
begin
  GeneratedAppAuthSecret := '';

  PostgresHostPage :=
    CreateInputQueryPage(
      wpSelectDir,
      'Postgres Connection',
      'Enter the Postgres connection details',
      'These values should point to the production Postgres instance for this dashboard.'
    );
  PostgresHostPage.Add('Postgres host', False);
  PostgresHostPage.Add('Postgres port', False);
  PostgresHostPage.Add('Database name', False);
  PostgresHostPage.Add('Database user', False);
  PostgresHostPage.Values[0] := 'localhost';
  PostgresHostPage.Values[1] := '5432';
  PostgresHostPage.Values[2] := 'itdash';
  PostgresHostPage.Values[3] := 'itdash_user';

  PostgresSecretPage :=
    CreateInputQueryPage(
      PostgresHostPage.ID,
      'Postgres Security',
      'Enter the Postgres password and secret-store passphrase',
      'The installer will write these values to the application .env file and validate connectivity.'
    );
  PostgresSecretPage.Add('Postgres password', True);
  PostgresSecretPage.Add('Secret-store passphrase', True);

  PostgresSslPage :=
    CreateInputOptionPage(
      PostgresSecretPage.ID,
      'Postgres SSL',
      'Choose whether SSL is required',
      'Enable this only if the target Postgres server expects SSL/TLS.',
      False,
      False
    );
  PostgresSslPage.Add('Require SSL for Postgres connection');
  PostgresSslPage.Values[0] := False;

  DashboardPortsPage :=
    CreateInputQueryPage(
      PostgresSslPage.ID,
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

function GenerateSecret(PartCount: Integer): string;
var
  I: Integer;
begin
  Result := '';
  for I := 1 to (PartCount * 8) do
    Result := Result + HexDigit(Random(16));
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
  Result := ExpandConstant('{commonappdata}\UAIL\itdash');
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
    'POSTGRES_URL=' + BuildPostgresUrl() + #13#10 +
    'POSTGRES_SSL=' + GetPostgresSslValue() + #13#10 +
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

procedure RunPowerShellSupport(const ScriptName: string; const ExtraArgs: string; const ErrorMessage: string);
var
  ScriptPath: string;
  Params: string;
begin
  ScriptPath := AddBackslash(GetInstallRoot()) + 'support\' + ScriptName;
  Params :=
    '-NoProfile -ExecutionPolicy Bypass -File ' + QuoteForParam(ScriptPath) + ' ' + ExtraArgs;
  ExecAndCheck(GetPowerShellExe(), Params, ErrorMessage);
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
    if TrimmedPageValue(PostgresHostPage, 0) = '' then
    begin
      MsgBox('Postgres host is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (not IsNumberInRange(TrimmedPageValue(PostgresHostPage, 1), 1, 65535)) then
    begin
      MsgBox('Postgres port must be a valid number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(PostgresHostPage, 2) = '') then
    begin
      MsgBox('Database name is required.', mbError, MB_OK);
      Result := False;
    end;
    if Result and (TrimmedPageValue(PostgresHostPage, 3) = '') then
    begin
      MsgBox('Database user is required.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PostgresSecretPage.ID then
  begin
    if TrimmedPageValue(PostgresSecretPage, 0) = '' then
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
