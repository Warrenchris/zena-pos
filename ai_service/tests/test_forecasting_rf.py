import math
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from src.main import app
from src.middleware.auth import get_current_user
from src.models.financial_models import FinancialForecastModel, RF_MIN_CALENDAR_DAYS

# Override auth dependency for tests
app.dependency_overrides[get_current_user] = lambda: {
    "id": 1,
    "shop_id": "4",
    "role": "admin"
}

client = TestClient(app)

INCIDENT_PAYLOAD = {
    "dates": [
        "2026-06-10T00:00:00.000Z",
        "2026-06-11T00:00:00.000Z",
        "2026-06-12T00:00:00.000Z",
        "2026-06-13T00:00:00.000Z",
        "2026-06-14T00:00:00.000Z",
        "2026-06-15T00:00:00.000Z",
        "2026-06-16T00:00:00.000Z",
        "2026-06-17T00:00:00.000Z",
        "2026-06-18T00:00:00.000Z",
        "2026-06-19T00:00:00.000Z",
        "2026-06-20T00:00:00.000Z",
        "2026-06-21T00:00:00.000Z",
        "2026-06-22T00:00:00.000Z",
        "2026-06-23T00:00:00.000Z",
        "2026-06-24T00:00:00.000Z",
        "2026-06-25T00:00:00.000Z",
        "2026-06-26T00:00:00.000Z",
        "2026-06-27T00:00:00.000Z",
        "2026-06-28T00:00:00.000Z",
        "2026-06-29T00:00:00.000Z",
        "2026-07-09T00:00:00.000Z",
        "2026-07-31T00:00:00.000Z",
        "2026-08-01T00:00:00.000Z",
        "2026-08-02T00:00:00.000Z",
        "2026-08-03T00:00:00.000Z",
        "2026-08-11T00:00:00.000Z",
        "2026-08-17T00:00:00.000Z",
        "2026-08-18T00:00:00.000Z",
        "2026-08-26T00:00:00.000Z",
        "2026-08-27T00:00:00.000Z",
        "2026-08-31T00:00:00.000Z",
        "2026-09-01T00:00:00.000Z",
        "2026-09-03T00:00:00.000Z",
        "2026-09-05T00:00:00.000Z",
        "2026-09-08T00:00:00.000Z"
    ],
    "values": [
        510.4, 400.2, 1693.6, 431.4, 522, 2818.8, 933.8, 168.2, 1330.4, 510.4,
        2850, 1125.2, 1403.6, 2420.8, 1322.4, 75.4, 487.2, 510.4, 1235.4, 133.4,
        60010, 89765, 3690, 61275, 3100, 1185, 655, 530, 4725, 329310,
        16284.25, 3890, 390, 840, 325660
    ],
    "periods": 14
}


def test_1_valid_continuous_daily_data():
    """Test 1 — Valid continuous daily data returns HTTP 200 and valid predictions."""
    start = datetime(2026, 6, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(50)]
    values = [100.0 + (i % 7) * 15.0 for i in range(50)]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["predictions"]) == 14
    assert len(data["dates"]) == 14
    assert all(isinstance(v, (int, float)) and not math.isnan(v) and v >= 0 for v in data["predictions"])


def test_2_sparse_dates_calendarization():
    """Test 2 — Sparse dates are calendarized to continuous daily data with 0.0 filling and return 200."""
    # 25 dates spanning 60 calendar days (with gaps)
    base = datetime(2026, 5, 1)
    # create 25 dates with multi-day gaps
    offsets = [0, 1, 2, 5, 6, 8, 12, 15, 16, 20, 22, 25, 28, 30, 33, 35, 38, 42, 45, 48, 50, 52, 55, 58, 60]
    dates = [(base + timedelta(days=o)).strftime("%Y-%m-%dT00:00:00.000Z") for o in offsets]
    values = [500.0 + i * 20.0 for i in range(len(offsets))]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["predictions"]) == 14
    assert data["training_samples"] == 61  # 61 calendar days


def test_3_duplicate_dates():
    """Test 3 — Duplicate dates in payload trigger validation error 422."""
    dates = ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z"]
    values = [100.0, 200.0, 250.0, 300.0, 400.0]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "VALIDATION_ERROR"
    assert data["field"] == "dates"
    assert "Duplicate date detected" in data["message"]


def test_4_length_mismatch():
    """Test 4 — Length mismatch between dates and values triggers 422 with field=values."""
    dates = ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z", "2026-06-05T00:00:00.000Z"]
    values = [100.0, 200.0, 300.0, 400.0]  # 4 values vs 5 dates

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "VALIDATION_ERROR"
    assert data["field"] == "values"
    assert "same number of observations" in data["message"]


def test_5_invalid_date():
    """Test 5 — Malformed date string triggers 422 with field=dates."""
    dates = ["2026-06-01T00:00:00.000Z", "not-a-valid-date", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z", "2026-06-05T00:00:00.000Z"]
    values = [100.0, 200.0, 300.0, 400.0, 500.0]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "VALIDATION_ERROR"
    assert data["field"] == "dates"
    assert "Invalid date format" in data["message"]


def test_6_nan_and_infinity():
    """Test 6 — NaN or Infinity in values triggers 422 with field=values."""
    # Test NaN
    response_nan = client.post("/api/forecasting/rf-forecast", json={
        "dates": ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z", "2026-06-05T00:00:00.000Z"],
        "values": [100.0, float("nan"), 300.0, 400.0, 500.0],
        "periods": 14
    })
    assert response_nan.status_code == 422
    assert response_nan.json()["field"] == "values"

    # Test Infinity
    response_inf = client.post("/api/forecasting/rf-forecast", json={
        "dates": ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z", "2026-06-05T00:00:00.000Z"],
        "values": [100.0, float("inf"), 300.0, 400.0, 500.0],
        "periods": 14
    })
    assert response_inf.status_code == 422
    assert response_inf.json()["field"] == "values"


def test_7_negative_revenue():
    """Test negative revenue values are rejected with 422."""
    dates = ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z", "2026-06-05T00:00:00.000Z"]
    values = [100.0, -50.0, 300.0, 400.0, 500.0]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 422
    data = response.json()
    assert data["field"] == "values"
    assert "non-negative" in data["message"]


def test_8_large_legitimate_revenue_values():
    """Test 7 — Large but legitimate revenue values are accepted without distortion."""
    start = datetime(2026, 6, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(45)]
    values = [500.0] * 45
    # Insert high supermarket wholesale values
    values[10] = 60010.0
    values[20] = 89765.0
    values[30] = 329310.0
    values[40] = 325660.0

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["predictions"]) == 14
    assert all(v >= 0.0 for v in data["predictions"])


def test_9_forecast_horizon_and_date_alignment():
    """Test 8 — periods=14 produces 14 periods beginning immediately on (last_historical_date + 1 day)."""
    start = datetime(2026, 6, 1)
    last_date = start + timedelta(days=44)  # 2026-07-15
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(45)]
    values = [1000.0 + (i % 7) * 50.0 for i in range(45)]

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["predictions"]) == 14
    assert len(data["dates"]) == 14
    assert len(data["lower_bounds"]) == 14
    assert len(data["upper_bounds"]) == 14

    # First predicted date must be exactly last_date + 1 day (2026-07-16)
    expected_first_date = (last_date + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00.000Z")
    assert data["dates"][0] == expected_first_date

    # Verify bounds invariant: lower <= prediction <= upper for all points
    for p, low, upp in zip(data["predictions"], data["lower_bounds"], data["upper_bounds"]):
        assert low >= 0.0
        assert low <= p <= upp


def test_10_insufficient_history():
    """Test 9 — History shorter than RF_MIN_CALENDAR_DAYS (40 days) triggers 422 with field=history."""
    # Only 10 days of history
    start = datetime(2026, 6, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(10)]
    values = [500.0] * 10

    response = client.post("/api/forecasting/rf-forecast", json={
        "dates": dates,
        "values": values,
        "periods": 14
    })
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "VALIDATION_ERROR"
    assert data["field"] == "history"
    assert "40 calendar days" in data["message"]


def test_11_production_incident_regression():
    """
    Test 10 — Production Incident Regression Test:
    Using the exact 35 dates spanning 91 calendar days with periods=14.
    Must return HTTP 200, 14 predictions, finite, non-NaN, starting on 2026-09-09.
    """
    response = client.post("/api/forecasting/rf-forecast", json=INCIDENT_PAYLOAD)
    assert response.status_code == 200, response.text
    data = response.json()

    assert len(data["predictions"]) == 14
    assert len(data["dates"]) == 14
    assert data["training_samples"] == 91
    assert data["observed_samples"] == 35
    assert data["forecast_periods"] == 14

    # Dates start on 2026-09-09 (day after latest observed date 2026-09-08)
    assert data["dates"][0] == "2026-09-09T00:00:00.000Z"
    assert data["dates"][-1] == "2026-09-22T00:00:00.000Z"

    # All predictions numeric, finite, non-negative
    for val in data["predictions"]:
        assert isinstance(val, (int, float))
        assert not math.isnan(val)
        assert not math.isinf(val)
        assert val >= 0.0

    # Bounds must satisfy lower <= pred <= upper
    for p, low, upp in zip(data["predictions"], data["lower_bounds"], data["upper_bounds"]):
        assert 0.0 <= low <= p <= upp


def test_12_prophet_standard_forecast_still_works():
    """Verify standard Prophet forecasting endpoint continues to return 200."""
    start = datetime(2026, 6, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%dT00:00:00.000Z") for i in range(40)]
    values = [500.0 + (i % 5) * 100.0 for i in range(40)]

    response = client.post("/api/forecasting/forecast?periods=14", json={
        "dates": dates,
        "values": values
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["predictions"]) == 14
    assert data["algorithm"] == "prophet"
