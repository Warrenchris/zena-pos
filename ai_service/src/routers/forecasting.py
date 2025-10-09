from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from datetime import datetime, timedelta

router = APIRouter()

class TimeSeriesData(BaseModel):
    dates: List[datetime]
    values: List[float]

class ForecastResult(BaseModel):
    dates: List[datetime]
    predictions: List[float]
    lower_bounds: List[float]
    upper_bounds: List[float]

@router.post("/forecast", response_model=ForecastResult)
async def create_forecast(data: TimeSeriesData, periods: int = 30):
    """
    Create time series forecast using Facebook Prophet
    """
    try:
        # Import heavy dependencies lazily so the app can start without them
        import pandas as pd
        from prophet import Prophet

        # Prepare data for Prophet
        df = pd.DataFrame({
            'ds': data.dates,
            'y': data.values
        })

        # Initialize and fit Prophet model
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False
        )
        model.fit(df)

        # Make future dataframe for forecasting
        future = model.make_future_dataframe(periods=periods)
        forecast = model.predict(future)

        # Extract results
        return ForecastResult(
            dates=forecast['ds'].tolist()[-periods:],
            predictions=forecast['yhat'].tolist()[-periods:],
            lower_bounds=forecast['yhat_lower'].tolist()[-periods:],
            upper_bounds=forecast['yhat_upper'].tolist()[-periods:]
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))