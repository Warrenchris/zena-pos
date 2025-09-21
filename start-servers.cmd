@echo off
start cmd /k "cd backend && npm start"
start cmd /k "cd ai_service && .\.venv\Scripts\activate && cd src && python -m uvicorn main:app --reload --port 8000"