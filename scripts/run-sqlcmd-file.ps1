param(
  [Parameter(Mandatory=$false)]
  [string] $Input = ".\scripts\check-lane-a-schema.sql"
)

$ErrorActionPreference = "Stop"

# Repo root is one level above /scripts
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"

if (-not (Test-Path $envPath)) {
  throw ".env not found at $envPath"
}

# Load .env into process env (same approach as other scripts)
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
  [Environment]::SetEnvironmentVariable($name, $val, "Process") | Out-Null
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
  throw "Set SQL_SERVER_HOST, SQL_SERVER_USER, SQL_SERVER_PASSWORD in .env"
}

$inputPath = Join-Path $root $Input
if (-not (Test-Path $inputPath)) {
  throw "Input SQL not found: $inputPath"
}

$tcp = "tcp:$server,$port"

$encryptFlag = @()
$enc = (Get-EnvVar "SQL_SERVER_ENCRYPT" "DB_ENCRYPT").ToLowerInvariant()
if ($enc -eq "true" -or $enc -eq "1") {
  $encryptFlag = @("-N")
}

Write-Host "sqlcmd -> $tcp database=$db user=$user"
& sqlcmd @("-S", $tcp, "-d", $db, "-U", $user, "-P", $password, "-C") + $encryptFlag + @("-b", "-i", $inputPath)

