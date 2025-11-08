from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import financial_analysis, forecasting, insights

app = FastAPI(
    title="Zana AI Financial Helper",
    description="AI-powered financial analysis and forecasting for African SMEs",
    version="1.0.0"
)

# Health check endpoint (no authentication required)
@app.get("/")
async def root():
    """Root endpoint for health checks"""
    return {"status": "ok", "service": "Zana AI Financial Helper"}

@app.get("/openapi.json")
async def openapi():
    """OpenAPI schema endpoint (no authentication required for health checks)"""
    return app.openapi()

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
    # When running this file directly, point uvicorn at the package module path
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)