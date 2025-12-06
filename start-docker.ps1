# Check if Docker is running
$dockerRunning = Get-Process docker -ErrorAction SilentlyContinue
if (-not $dockerRunning) {
    Write-Host "Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit
}

Write-Host "Starting Zana POS Docker Containers..." -ForegroundColor Cyan

# Run docker-compose
docker-compose up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nContainers started successfully!" -ForegroundColor Green
    Write-Host "`nService URLs:" -ForegroundColor Yellow
    Write-Host "Frontend:  http://localhost:5173"
    Write-Host "Backend:   http://localhost:3000"
    Write-Host "AI Service: http://localhost:8000"
    Write-Host "MySQL:     localhost:3307"
    
    Write-Host "`nContainer Status:" -ForegroundColor Cyan
    docker-compose ps
} else {
    Write-Host "`nFailed to start containers. Please check the error messages above." -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
