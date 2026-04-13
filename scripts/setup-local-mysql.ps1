param(
  [string]$MysqlExePath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
  [string]$RootUser = "root",
  [string]$DatabaseName = "google_ads_saas",
  [string]$AppUser = "googleads_dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-PlainText {
  param(
    [Parameter(Mandatory = $true)]
    [Security.SecureString]$SecureValue
  )

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)

  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Invoke-MysqlCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MysqlExePath,
    [Parameter(Mandatory = $true)]
    [string]$RootUser,
    [Parameter(Mandatory = $true)]
    [string]$RootPassword,
    [Parameter(Mandatory = $true)]
    [string]$Sql
  )

  & $MysqlExePath --protocol=TCP --host=127.0.0.1 --port=3306 --user=$RootUser --password=$RootPassword --execute=$Sql
}

function Update-EnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvPath,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl
  )

  $content = Get-Content $EnvPath -Raw
  $updated = $content `
    -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=$DatabaseUrl" `
    -replace '(?m)^DATABASE_MIGRATION_URL=.*$', "DATABASE_MIGRATION_URL=$DatabaseUrl"

  Set-Content -Path $EnvPath -Value $updated -Encoding UTF8
}

if (-not (Test-Path $MysqlExePath)) {
  throw "Nao encontrei mysql.exe em '$MysqlExePath'."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$schemaPath = Join-Path $projectRoot "database\schema-inicial.sql"
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path $schemaPath)) {
  throw "Nao encontrei o schema em '$schemaPath'."
}

if (-not (Test-Path $envPath)) {
  throw "Nao encontrei o arquivo .env em '$envPath'."
}

Write-Host "Configurando MySQL local para o projeto..." -ForegroundColor Cyan
Write-Host "Banco: $DatabaseName" -ForegroundColor DarkCyan
Write-Host "Usuario da aplicacao: $AppUser" -ForegroundColor DarkCyan

$rootPassword = ConvertTo-PlainText (Read-Host "Senha do usuario root do MySQL" -AsSecureString)

if ([string]::IsNullOrWhiteSpace($rootPassword)) {
  throw "A senha do root nao pode ficar vazia."
}

$appPasswordSecure = Read-Host "Senha que deseja usar para o usuario '$AppUser'" -AsSecureString
$appPassword = ConvertTo-PlainText $appPasswordSecure

if ([string]::IsNullOrWhiteSpace($appPassword) -or $appPassword.Length -lt 12) {
  throw "A senha do usuario da aplicacao deve ter pelo menos 12 caracteres."
}

$escapedAppPasswordForSql = $appPassword.Replace("'", "''")
$escapedAppUser = $AppUser.Replace("'", "''")

$bootstrapSql = @"
CREATE DATABASE IF NOT EXISTS $DatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$escapedAppUser'@'localhost' IDENTIFIED BY '$escapedAppPasswordForSql';
ALTER USER '$escapedAppUser'@'localhost' IDENTIFIED BY '$escapedAppPasswordForSql';
GRANT ALL PRIVILEGES ON $DatabaseName.* TO '$escapedAppUser'@'localhost';
FLUSH PRIVILEGES;
"@

Invoke-MysqlCommand `
  -MysqlExePath $MysqlExePath `
  -RootUser $RootUser `
  -RootPassword $rootPassword `
  -Sql $bootstrapSql

& $MysqlExePath --protocol=TCP --host=127.0.0.1 --port=3306 --user=$RootUser --password=$rootPassword $DatabaseName `
  --default-character-set=utf8mb4 `
  --execute="SOURCE $schemaPath"

$encodedPassword = [Uri]::EscapeDataString($appPassword)
$databaseUrl = "mysql://${AppUser}:$encodedPassword@localhost:3306/$DatabaseName"
Update-EnvFile -EnvPath $envPath -DatabaseUrl $databaseUrl

Write-Host "" 
Write-Host "Banco configurado com sucesso." -ForegroundColor Green
Write-Host "Schema aplicado em '$DatabaseName'." -ForegroundColor Green
Write-Host "O arquivo .env foi atualizado com o usuario da aplicacao." -ForegroundColor Green
Write-Host ""
Write-Host "Proximos comandos para teste local:" -ForegroundColor Cyan
Write-Host "  npm.cmd run dev:web"
Write-Host "  npm.cmd run dev:api:plain"
