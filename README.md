# Zana Phase 1

Cloud-based POS, ERM, CRM, and Financial Helper for African SMEs.

## Modules
- **POS**: Inventory, sales, expenses, reports
- **ERM**: Employee management, RBAC, analytics
- **CRM**: Customer profiles, loyalty, sales history
- **Financial Helper AI**: Insights, forecasting, decision support

## Tech Stack
- Node.js Express (backend)
- PostgreSQL/MySQL
- React.js + Tailwind CSS (frontend)
- Python FastAPI (AI microservice)
- Docker, Nginx, Cloud hosting

## Getting Started
- Backend: `backend/`
- Frontend: `frontend/`
- AI Service: `ai_service/`

See copilot-instructions.md for setup checklist and progress tracking.

## Environment setup (AI integration)

Create `.env` files:

Backend (`backend/.env`):

```
AI_SERVICE_URL=http://localhost:8000
MARKET_ALERTS_ENABLED=false
MARKET_ALERTS_URL=
```

Frontend (`frontend/.env`):

```
VITE_API_URL=http://localhost:3000
VITE_AI_SERVICE_URL=http://localhost:8000
```