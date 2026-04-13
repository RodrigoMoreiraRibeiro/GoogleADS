param(
  [switch]$Watch
)

$workspaceRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFilePath = Join-Path $workspaceRoot '.env'
$tsxPath = Join-Path $workspaceRoot 'node_modules\.bin\tsx.cmd'

if (-not (Test-Path $envFilePath)) {
  throw "Arquivo .env nao encontrado em $envFilePath"
}

if (-not (Test-Path $tsxPath)) {
  throw "tsx nao encontrado em $tsxPath"
}

Get-Content $envFilePath | ForEach-Object {
  if ([string]::IsNullOrWhiteSpace($_)) {
    return
  }

  if ($_.TrimStart().StartsWith('#')) {
    return
  }

  if ($_ -notmatch '=') {
    return
  }

  $name, $value = $_ -split '=', 2
  Set-Item -Path ("Env:" + $name.Trim()) -Value $value
}

Set-Location $workspaceRoot

$arguments = @()

if ($Watch.IsPresent) {
  $arguments += 'watch'
}

$arguments += '--tsconfig'
$arguments += 'apps/api/tsconfig.json'
$arguments += 'apps/api/src/bootstrap/main.ts'

& $tsxPath @arguments
exit $LASTEXITCODE
