from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .instrument import init_sentry
init_sentry()

from .routers import financial_analysis, forecasting, insights

logger = logging.getLogger(__name__)


async def warmup_prophet_model():
    """
    Warm Prophet at startup off the event loop so the first HTTP request
    does not pay the Stan compilation and C++ binary loading penalty.
    """
    try:
        from starlette.concurrency import run_in_threadpool
        import pandas as pd
        from prophet import Prophet

        def _warm():
            df = pd.DataFrame({
                'ds': pd.date_range(start='2026-01-01', periods=10, freq='D'),
                'y': [10.0 + i for i in range(10)]
            })
            m = Prophet(yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False)
            m.fit(df)
            f = m.make_future_dataframe(periods=2)
            m.predict(f)

        await run_in_threadpool(_warm)
        logger.info("[startup] Prophet model warmed up successfully.")
    except Exception as e:
        logger.warning(f"[startup] Prophet warmup warning: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await warmup_prophet_model()
    yield


app = FastAPI(
    title="Zana AI Financial Helper",
    description="AI-powered financial analysis and forecasting for African SMEs",
    version="1.0.0",
    lifespan=lifespan
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
import os
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routers
app.include_router(financial_analysis.router, prefix="/api/finance", tags=["Financial Analysis"])
app.include_router(forecasting.router, prefix="/api/forecasting", tags=["Forecasting"])
app.include_router(insights.router, prefix="/api/insights", tags=["Business Insights"])

if __name__ == "__main__":
    import uvicorn
    # When running this file directly, point uvicorn at the package module path
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)