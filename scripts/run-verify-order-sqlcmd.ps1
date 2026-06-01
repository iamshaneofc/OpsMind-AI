# Run scripts/verify-order-erp.sql against SQL Server using the same .env vars as the app.
# Prerequisite: SQL Server sqlcmd installed (SQL Server Command Line Tools / SSMS).
#
# Usage (from repo root):
#   .\scripts\run-verify-order-sqlcmd.ps1
# Optional:
#   .\scripts\run-verify-order-sqlcmd.ps1 -Voucher "11.105.260217.24"
#
# .env variables (see src/sql-server/config.ts):
#   USE_SQL_SERVER_DATA=true
#   SQL_SERVER_HOST, SQL_SERVER_PORT (default 1433), SQL_SERVER_USER, SQL_SERVER_PASSWORD, SQL_SERVER_DATABASE
# Aliases: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

param(
  [string] $Voucher = "11.105.260217.24"
)

$ErrorActionPreference = "Stop"
# $PSScriptRoot = ...\scripts ; repo root is parent
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env not found at $envPath"
  exit 1
}

Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1).Trim()
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $val, "Process")
}

function Get-EnvVar([string]$Primary, [string]$Alias) {
  $v = [Environment]::GetEnvironmentVariable($Primary, "Process")
  if ($v) { return $v }
  return [Environment]::GetEnvironmentVariable($Alias, "Process")
}

$server = Get-EnvVar "SQL_SERVER_HOST" "DB_SERVER"
$user = Get-EnvVar "SQL_SERVER_USER" "DB_USER"
$password = Get-EnvVar "SQL_SERVER_PASSWORD" "DB_PASSWORD"
$db = Get-EnvVar "SQL_SERVER_DATABASE" "DB_NAME"
if (-not $db) { $db = "master" }
$port = Get-EnvVar "SQL_SERVER_PORT" "DB_PORT"
if (-not $port) { $port = "1433" }

if (-not $server -or -not $user -or -not $password) {
  Write-Error "Set SQL_SERVER_HOST, SQL_SERVER_USER, SQL_SERVER_PASSWORD (and optionally SQL_SERVER_DATABASE) in .env"
  exit 1
}

$sqlPath = Join-Path $PSScriptRoot "verify-order-erp.sql"
if (-not (Test-Path $sqlPath)) {
  Write-Error "Missing $sqlPath"
  exit 1
}

# Inject voucher into a temp file (script uses DECLARE @voucher)
$sqlText = Get-Content $sqlPath -Raw
$sqlText = $sqlText -replace "DECLARE @voucher NVARCHAR\(200\) = N'[^']*'", "DECLARE @voucher NVARCHAR(200) = N'$Voucher'"
$tmp = [System.IO.Path]::GetTempFileName() + ".sql"
Set-Content -Path $tmp -Value $sqlText -Encoding UTF8

$tcp = "tcp:$server,$port"
Write-Host "sqlcmd -> $tcp database=$db user=$user"
Write-Host "Voucher: $Voucher"
Write-Host ""

# -C trust server certificate (aligns with trustServerCertificate: true in app when used)
# -N encrypts connection (optional; match SQL_SERVER_ENCRYPT in .env if you use encrypt)
$encryptFlag = @()
$enc = (Get-EnvVar "SQL_SERVER_ENCRYPT" "DB_ENCRYPT").ToLowerInvariant()
if ($enc -eq "true" -or $enc -eq "1") {
  $encryptFlag = @("-N")
}

& sqlcmd @("-S", $tcp, "-d", $db, "-U", $user, "-P", $password, "-C") + $encryptFlag + @("-b", "-i", $tmp)
$exit = $LASTEXITCODE
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
exit $exit
