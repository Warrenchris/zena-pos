import math
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from src.main import app, warmup_prophet_model
from src.middleware.auth import get_current_user

# Override auth dependency for tests
app.dependency_overrides[get_current_user] = lambda: {
    "id": 1,
    "shop_id": "4",
    "role": "admin"
}

client = TestClient(app)


def test_prophet_forecast_success():
    """Valid daily time series returns 200, predictions, bounds, and training samples."""
    start = datetime(2026, 6, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(30)]
    values = [100.0 + (i % 7) * 15.0 for i in range(30)]

    response = client.post("/api/forecasting/forecast?periods=14", json={
        "dates": dates,
        "values": values
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["predictions"]) == 14
    assert len(data["dates"]) == 14
    assert len(data["lower_bounds"]) == 14
    assert len(data["upper_bounds"]) == 14
    assert all(isinstance(v, (int, float)) and not math.isnan(v) and v >= 0 for v in data["predictions"])
    assert data["algorithm"] == "prophet"
    assert data["training_samples"] == 30


def test_prophet_forecast_holdout_quality():
    """Series with >= 25 observations computes holdout model_quality metrics."""
    start = datetime(2026, 1, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(40)]
    values = [500.0 + (i % 7) * 50.0 for i in range(40)]

    response = client.post("/api/forecasting/forecast?periods=7", json={
        "dates": dates,
        "values": values
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["model_quality"] is not None
    assert "mae" in data["model_quality"]
    assert "quality_label" in data["model_quality"]


import asyncio

def test_startup_warmup_runs_cleanly():
    """Startup warmup executes off the event loop without error."""
    asyncio.run(warmup_prophet_model())


def test_healthcheck_unblocked():
    """Root healthcheck endpoint responds immediately with 200."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
