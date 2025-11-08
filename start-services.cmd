@echo off
echo Starting Zana POS services...

REM Generate JWT keys if they don't exist
if not exist backend\jwt_private_key.pem (
    echo Generating JWT keys...
    cd backend
    node scripts/generate-jwt-keys.js
    cd ..
    echo Copying public key to AI service...
    copy backend\jwt_public_key.pem ai_service\
)

REM Start all services
echo Starting Docker services...
docker-compose up --build -d

REM Show logs
echo.
echo Services are starting up. Showing logs...
echo Press Ctrl+C to stop viewing logs (services will keep running)
echo.
timeout /t 2 >nul
docker-compose logs -f