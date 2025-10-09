Param(
    [string]$BindAddress = '127.0.0.1',
    [int]$BindPort = 8000,
    [switch]$Reload
)

# Move to script directory (reliable even when path contains spaces)
$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location -LiteralPath $scriptDir

# Activate virtualenv if present
$venvActivate = Join-Path -Path $scriptDir -ChildPath '.venv\Scripts\Activate.ps1'
if (Test-Path $venvActivate) {
    Write-Output "Activating virtualenv at: $venvActivate"
    . $venvActivate
}

# Build uvicorn args. Use --app-dir to ensure Python can import the package inside src
$reloadArg = ''
$reloadArg = ''
if ($Reload) { $reloadArg = '--reload' }

$cmd = "python -m uvicorn main:app --app-dir src --host $BindAddress --port $BindPort $reloadArg"
Write-Output "Starting AI service: $cmd"
# Start uvicorn in the current window so logs are visible
Invoke-Expression $cmd
