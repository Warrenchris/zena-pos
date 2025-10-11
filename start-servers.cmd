@echo off
REM Start Backend Server
start cmd /k "cd backend && npm install && npm run dev"

REM Start Frontend Dev Server
start cmd /k "cd frontend && npm install && npm run dev"

REM Start AI Service
start cmd /k "cd ai_service && .\.venv\Scripts\activate && cd src && python -m uvicorn main:app --reload --port 8000"