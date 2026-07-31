from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from ..middleware.auth import get_current_user
from ..models.financial_models import FinancialForecastModel

router = APIRouter()


class TimeSeriesData(BaseModel):
    dates: List[datetime]
    values: List[float]


class ForecastResult(BaseModel):
    dates: List[datetime]
    predictions: List[float]
    lower_bounds: List[float]
    upper_bounds: List[float]


class RFForecastRequest(BaseModel):
    dates: List[str]
    values: List[float]
    periods: int = 30
    shop_id: Optional[str] = None


class ProductForecastItem(BaseModel):
    product_id: str
    product_name: str
    current_stock: float
    daily_sales: List[dict]


class StockDepletionRequest(BaseModel):
    products: List[ProductForecastItem]
    alert_threshold_days: int = 7


def _quality_label(mape: Optional[float]) -> str:
    if mape is None:
        return "fair"
    if mape < 10:
        return "excellent"
    if mape < 20:
        return "good"
    if mape < 35:
        return "fair"
    return "poor"


@router.post("/forecast")
async def create_forecast(
    data: TimeSeriesData,
    periods: int = 30,
    user: dict = Depends(get_current_user)
):
    """
    Create time series forecast using Facebook Prophet.
    Extended with holdout model quality metrics.
    """
    try:
        import pandas as pd
        import numpy as np
        from prophet import Prophet

        ds_col = pd.to_datetime(data.dates)
        if ds_col.tz is not None:
            ds_col = ds_col.tz_localize(None)

        df = pd.DataFrame({
            'ds': ds_col,
            'y': data.values
        }).sort_values('ds').reset_index(drop=True)

        freq = 'D'
        if len(df) >= 2:
            avg_diff = (df['ds'].iloc[-1] - df['ds'].iloc[0]).days / max(1, len(df) - 1)
            if avg_diff >= 25:
                freq = 'MS'
            elif avg_diff >= 6:
                freq = 'W'

        model_quality = None
        split_idx = int(len(df) * 0.8)
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]

        if len(test_df) >= 5:
            eval_model = Prophet(
                daily_seasonality=False,
                weekly_seasonality=True,
                yearly_seasonality=len(train_df) > 180
            )
            eval_model.fit(train_df)
            eval_future = eval_model.make_future_dataframe(periods=len(test_df))
            eval_forecast = eval_model.predict(eval_future)

            eval_preds = eval_forecast.tail(len(test_df))['yhat'].values
            eval_actuals = test_df['y'].values

            mae = float(np.mean(np.abs(eval_actuals - eval_preds)))
            rmse = float(np.sqrt(np.mean((eval_actuals - eval_preds) ** 2)))

            nonzero = eval_actuals != 0
            mape = None
            if nonzero.any():
                mape = float(np.mean(np.abs((eval_actuals[nonzero] - eval_preds[nonzero]) / eval_actuals[nonzero])) * 100)

            model_quality = {
                "mae": round(mae, 2),
                "rmse": round(rmse, 2),
                "mape": round(mape, 2) if mape is not None else None,
                "holdout_size": len(test_df),
                "quality_label": _quality_label(mape),
            }

        model = Prophet(
            yearly_seasonality=len(df) > 365,
            weekly_seasonality=freq == 'D',
            daily_seasonality=False
        )
        model.fit(df)

        future = model.make_future_dataframe(periods=periods, freq=freq)
        forecast = model.predict(future)

        # Revenue predictions must be non-negative (>= 0)
        preds = [max(0.0, float(val)) for val in forecast['yhat'].tolist()[-periods:]]
        lowers = [max(0.0, float(val)) for val in forecast['yhat_lower'].tolist()[-periods:]]
        uppers = [max(0.0, float(val)) for val in forecast['yhat_upper'].tolist()[-periods:]]

        return {
            "dates": forecast['ds'].tolist()[-periods:],
            "predictions": preds,
            "lower_bounds": lowers,
            "upper_bounds": uppers,
            "model_quality": model_quality,
            "training_samples": len(df),
            "algorithm": "prophet"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rf-forecast")
async def random_forest_forecast(
    request: RFForecastRequest,
    user: dict = Depends(get_current_user)
):
    """
    Revenue forecasting using RandomForest with lag/rolling features.
    """
    if len(request.dates) < 30:
        raise HTTPException(
            status_code=422,
            detail=f"RandomForest forecasting requires at least 30 data points. Got {len(request.dates)}."
        )

    try:
        model = FinancialForecastModel()
        metrics = model.fit(request.dates, request.values)
        predictions = model.predict(request.periods)

        return {
            "dates": predictions["dates"],
            "predictions": predictions["values"],
            "model_quality": metrics,
            "algorithm": "RandomForestRegressor",
            "training_samples": len(request.dates),
            "forecast_periods": request.periods,
            "data_warning": None if len(request.dates) >= 60 else "Model accuracy improves with more historical data (60+ points recommended)"
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stock-depletion")
async def stock_depletion_forecast(
    request: StockDepletionRequest,
    user: dict = Depends(get_current_user)
):
    """
    Prophet-based per-product stock depletion forecasting.
    """
    import pandas as pd
    from prophet import Prophet

    results = []

    for product in request.products:
        if len(product.daily_sales) < 14:
            if len(product.daily_sales) > 0:
                avg_daily = sum(float(d.get('quantity', 0)) for d in product.daily_sales) / len(product.daily_sales)
                days = product.current_stock / avg_daily if avg_daily > 0 else 999
            else:
                days = 999

            results.append({
                "product_id": product.product_id,
                "product_name": product.product_name,
                "current_stock": product.current_stock,
                "days_until_depletion": round(days, 1),
                "alert": days <= request.alert_threshold_days,
                "algorithm": "linear_extrapolation",
                "confidence": "low",
                "data_points": len(product.daily_sales)
            })
            continue

        try:
            df = pd.DataFrame(product.daily_sales)
            df = df.rename(columns={'date': 'ds', 'quantity': 'y'})
            df['ds'] = pd.to_datetime(df['ds'])
            df['y'] = pd.to_numeric(df['y'], errors='coerce').fillna(0)

            m = Prophet(
                daily_seasonality=False,
                weekly_seasonality=True,
                yearly_seasonality=len(product.daily_sales) > 180,
                changepoint_prior_scale=0.05,
                interval_width=0.80
            )
            m.fit(df)

            future = m.make_future_dataframe(periods=60)
            forecast = m.predict(future)
            future_forecast = forecast[forecast['ds'] > df['ds'].max()]

            cumulative = 0.0
            days_until_depletion = 60

            for _, row in future_forecast.iterrows():
                daily_demand = max(0, row['yhat'])
                cumulative += daily_demand
                days = (row['ds'] - df['ds'].max()).days
                if cumulative >= product.current_stock:
                    days_until_depletion = days
                    break

            results.append({
                "product_id": product.product_id,
                "product_name": product.product_name,
                "current_stock": product.current_stock,
                "days_until_depletion": days_until_depletion,
                "alert": days_until_depletion <= request.alert_threshold_days,
                "algorithm": "prophet",
                "confidence": "high" if len(product.daily_sales) >= 60 else "medium",
                "data_points": len(product.daily_sales)
            })

        except Exception as e:
            print(f"[StockDepletion] Prophet failed for {product.product_name}: {e}")
            results.append({
                "product_id": product.product_id,
                "product_name": product.product_name,
                "current_stock": product.current_stock,
                "days_until_depletion": None,
                "alert": False,
                "algorithm": "error",
                "error": str(e)
            })

    results.sort(key=lambda x: x['days_until_depletion'] if x['days_until_depletion'] is not None else 999)
    alerts = [r for r in results if r.get('alert')]

    return {
        "products": results,
        "alerts": alerts,
        "total_products_analyzed": len(results),
        "alert_count": len(alerts),
        "threshold_days": request.alert_threshold_days
    }
