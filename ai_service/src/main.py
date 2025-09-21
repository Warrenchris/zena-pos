from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import financial_analysis, forecasting, insights

app = FastAPI(
    title="Zana AI Financial Helper",
    description="AI-powered financial analysis and forecasting for African SMEs",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Include routers
app.include_router(financial_analysis.router, prefix="/api/finance", tags=["Financial Analysis"])
app.include_router(forecasting.router, prefix="/api/forecasting", tags=["Forecasting"])
app.include_router(insights.router, prefix="/api/insights", tags=["Business Insights"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)