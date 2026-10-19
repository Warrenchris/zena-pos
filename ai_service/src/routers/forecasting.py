from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
import time
import math
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
from ..middleware.auth import get_current_user
from ..models.financial_models import FinancialForecastModel

logger = logging.getLogger(__name__)

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
    dates: List[Any]
    values: List[Any]
    periods: Optional[Any] = 30
    shop_id: Optional[str] = None


def validation_error(message: str, field: str, detail: Optional[str] = None) -> JSONResponse:
    logger.warning("[rf-forecast] Validation failed: %s (field=%s)", message, field)
    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "message": message,
            "field": field,
            "detail": detail or message
        }
    )


class ProductForecastItem(BaseModel):
    product_id: str
    product_name: str
    current_stock: float
    daily_sales: List[dict]
    lookback_days: Optional[int] = None
    reference_date: Optional[str] = None


class StockDepletionRequest(BaseModel):
    products: List[ProductForecastItem]
    alert_threshold_days: int = 7
    lookback_days: Optional[int] = None
    reference_date: Optional[str] = None


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


from starlette.concurrency import run_in_threadpool


def _fit_prophet_sync(dates: List[Any], values: List[float], periods: int = 30) -> dict:
    import pandas as pd
    import numpy as np
    from prophet import Prophet

    ds_col = pd.to_datetime(dates)
    if ds_col.tz is not None:
        ds_col = ds_col.tz_localize(None)

    df = pd.DataFrame({
        'ds': ds_col,
        'y': values
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


@router.post("/forecast")
async def create_forecast(
    data: TimeSeriesData,
    periods: int = 30,
    user: dict = Depends(get_current_user)
):
    """
    Create time series forecast using Facebook Prophet.
    Extended with holdout model quality metrics.
    Offloaded to threadpool to prevent blocking the asyncio event loop.
    """
    try:
        return await run_in_threadpool(_fit_prophet_sync, data.dates, data.values, periods)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rf-forecast")
async def random_forest_forecast(
    request: RFForecastRequest,
    user: dict = Depends(get_current_user)
):
    """
    Revenue forecasting using RandomForest with lag and rolling features.
    Sparse sales dates are calendarized to a continuous daily time series.
    """
    start_time = time.time()

    # 1. Horizon / Periods validation
    if (
        request.periods is None
        or isinstance(request.periods, bool)
        or not isinstance(request.periods, int)
        or request.periods < 1
        or request.periods > 365
    ):
        return validation_error(
            "Forecast periods must be an integer between 1 and 365.",
            field="periods",
            detail=f"periods={request.periods}"
        )

    # 2. Dataset presence validation
    if request.dates is None or len(request.dates) == 0:
        return validation_error(
            "The dates array is required and cannot be empty.",
            field="dates"
        )
    if request.values is None or len(request.values) == 0:
        return validation_error(
            "The values array is required and cannot be empty.",
            field="values"
        )

    # 3. Length match validation
    if len(request.dates) != len(request.values):
        return validation_error(
            "Dates and revenue values must contain the same number of observations.",
            field="values",
            detail=f"dates_length={len(request.dates)}, values_length={len(request.values)}"
        )

    # 4. Non-trivial activity floor check
    if len(request.dates) < 5:
        return validation_error(
            "Random Forest forecasting requires at least 5 observed daily sales records.",
            field="dates",
            detail=f"observed_observations={len(request.dates)}"
        )

    # 5. Revenue values validation (numeric, finite, non-NaN, non-Infinity, non-negative)
    clean_values = []
    for idx, val in enumerate(request.values):
        if val is None or isinstance(val, bool) or not isinstance(val, (int, float)):
            return validation_error(
                f"Revenue value at index {idx} must be a numeric value.",
                field="values",
                detail=f"index={idx}, value={val}"
            )
        if math.isnan(val) or math.isinf(val):
            return validation_error(
                "Revenue values cannot contain NaN or Infinity.",
                field="values",
                detail=f"index={idx}, value={val}"
            )
        if val < 0:
            return validation_error(
                "Revenue values must be non-negative numbers.",
                field="values",
                detail=f"index={idx}, value={val}"
            )
        clean_values.append(float(val))

    # 6. Dates parsing and validation
    parsed_dates = []
    for idx, d_str in enumerate(request.dates):
        if not isinstance(d_str, str) or not d_str.strip():
            return validation_error(
                f"Invalid date format at index {idx}: '{d_str}'.",
                field="dates",
                detail=f"index={idx}, date={d_str}"
            )
        try:
            dt = pd.to_datetime(d_str)
            if dt.tz is not None:
                dt = dt.tz_convert('UTC').tz_localize(None)
            dt = dt.normalize()
            parsed_dates.append(dt)
        except Exception:
            return validation_error(
                f"Invalid date format: '{d_str}'. Dates must be ISO formatted strings.",
                field="dates",
                detail=f"index={idx}, raw_value={d_str}"
            )

    # 7. Check chronological ordering & duplicate dates
    for i in range(1, len(parsed_dates)):
        prev_dt = parsed_dates[i - 1]
        curr_dt = parsed_dates[i]
        if curr_dt == prev_dt:
            return validation_error(
                f"Duplicate date detected: '{request.dates[i]}'. Each calendar day must appear at most once.",
                field="dates",
                detail=f"duplicate_date={request.dates[i]}"
            )
        if curr_dt < prev_dt:
            return validation_error(
                "Dates must be in chronological order.",
                field="dates",
                detail=f"index={i}, previous={request.dates[i-1]}, current={request.dates[i]}"
            )

    # 8. Model execution with safe exception handling
    try:
        model = FinancialForecastModel()
        metrics = model.fit(request.dates, clean_values)
        predictions = model.predict(request.periods)
    except ValueError as e:
        err_msg = str(e)
        field = "history" if ("calendar days" in err_msg or "history" in err_msg or "training" in err_msg) else "model"
        return validation_error(
            err_msg,
            field=field,
            detail=err_msg
        )
    except Exception as e:
        logger.error("[rf-forecast] Model execution failed: %s", e, exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "error": "MODEL_ERROR",
                "message": "An error occurred during Random Forest forecasting.",
                "detail": str(e)
            }
        )

    duration_ms = round((time.time() - start_time) * 1000, 2)
    calendar_days = (parsed_dates[-1] - parsed_dates[0]).days + 1
    training_rows = calendar_days - 30

    # Observability log with safe metadata
    logger.info(
        "[rf-forecast] Success: shop_id=%s observed_observations=%d calendar_days=%d training_rows=%d periods=%d execution_time_ms=%.2f",
        request.shop_id or "unknown",
        len(request.dates),
        calendar_days,
        training_rows,
        request.periods,
        duration_ms
    )

    return {
        "dates": predictions["dates"],
        "predictions": predictions["values"],
        "lower_bounds": predictions.get("lower_bounds", []),
        "upper_bounds": predictions.get("upper_bounds", []),
        "model_quality": metrics,
        "algorithm": "RandomForestRegressor",
        "training_samples": calendar_days,
        "observed_samples": len(request.dates),
        "forecast_periods": request.periods,
        "data_warning": None if calendar_days >= 60 else "Model accuracy improves with more historical data (60+ calendar days recommended)"
    }


MAX_FORECAST_WORKERS = min(4, os.cpu_count() or 2)
DEFAULT_DEPLETION_BUDGET_SECONDS = float(os.getenv("STOCK_DEPLETION_TIMEOUT_SECONDS", "30.0"))

# Shared, globally bounded thread pool executor across all incoming requests
_DEPLETION_EXECUTOR = ThreadPoolExecutor(
    max_workers=MAX_FORECAST_WORKERS,
    thread_name_prefix="stock-depletion"
)


def _safe_float(val, default: float = 0.0) -> float:
    try:
        f = float(val)
        return default if math.isnan(f) else f
    except (ValueError, TypeError):
        return default


def _parse_and_calendarize_sales(
    daily_sales: List[dict],
    lookback_days: Optional[int] = None,
    reference_date: Optional[str] = None
):
    """
    Parse sparse daily_sales observations, aggregate duplicate dates, prevent
    future-data leakage beyond the reference/anchor date, and calendarize over
    the continuous daily observation window by filling zero-sales days with 0.0.

    Lookback & anchor semantics:
    1. If reference_date is provided, anchor_dt is normalized reference_date and
       any observations after anchor_dt are excluded to avoid future-data leakage.
    2. Otherwise, if the latest observed sale date falls within the active lookback
       window relative to today UTC (default 90 days), anchor_dt is today UTC so
       trailing zero-sales days after a stale last-sale date are included.
       If the latest observed date is older than the lookback window (e.g., a
       deterministic historical test fixture), anchor_dt defaults to max_dt.
    3. When lookback_days is specified, the observation window spans at least
       lookback_days ending at anchor_dt; otherwise it spans (anchor_dt - min_dt) + 1.
    """
    if not daily_sales:
        eff_window = max(1, int(lookback_days)) if (lookback_days and int(lookback_days) > 0) else 0
        return pd.DataFrame(columns=["ds", "y"]), eff_window, None

    records = []
    for d in daily_sales:
        if not isinstance(d, dict):
            raise ValueError("Each daily_sales entry must be a dict")
        raw_date = d.get("date")
        if raw_date is None or (isinstance(raw_date, str) and not raw_date.strip()):
            raise ValueError("Missing date in daily_sales entry")
        dt = pd.to_datetime(raw_date, errors="raise")
        if getattr(dt, "tzinfo", None) is not None or getattr(dt, "tz", None) is not None:
            dt = pd.Timestamp(dt).tz_convert("UTC").tz_localize(None)
        else:
            dt = pd.Timestamp(dt)
        dt = dt.normalize()

        raw_qty = d.get("quantity", 0)
        try:
            qty = float(raw_qty)
            if math.isnan(qty) or math.isinf(qty):
                raise ValueError(f"Non-finite quantity: {raw_qty}")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid quantity in daily_sales: {raw_qty}") from exc

        records.append({"ds": dt, "y": max(0.0, qty)})

    df = pd.DataFrame(records)
    grouped = df.groupby("ds", as_index=False)["y"].sum().sort_values("ds").reset_index(drop=True)

    today_dt = pd.Timestamp.utcnow().tz_localize(None).normalize()
    max_window = int(lookback_days) if (lookback_days is not None and int(lookback_days) > 0) else 90

    if reference_date is not None and str(reference_date).strip():
        ref_dt = pd.to_datetime(reference_date, errors="raise")
        if getattr(ref_dt, "tzinfo", None) is not None or getattr(ref_dt, "tz", None) is not None:
            ref_dt = pd.Timestamp(ref_dt).tz_convert("UTC").tz_localize(None)
        else:
            ref_dt = pd.Timestamp(ref_dt)
        anchor_dt = ref_dt.normalize()
        grouped = grouped[grouped["ds"] <= anchor_dt].reset_index(drop=True)
    else:
        # Exclude accidental future-dated rows relative to today when today_dt >= min_dt
        if grouped["ds"].min() <= today_dt and grouped["ds"].max() > today_dt:
            grouped = grouped[grouped["ds"] <= today_dt].reset_index(drop=True)

        if grouped.empty:
            eff_window = max(1, int(lookback_days)) if (lookback_days and int(lookback_days) > 0) else 1
            return pd.DataFrame(columns=["ds", "y"]), eff_window, today_dt

        max_dt = grouped["ds"].max()
        days_since_last = (today_dt - max_dt).days
        if 0 < days_since_last <= max_window:
            anchor_dt = today_dt
        else:
            anchor_dt = max_dt

    if grouped.empty:
        eff_window = max(1, int(lookback_days)) if (lookback_days and int(lookback_days) > 0) else 1
        full_idx = pd.date_range(
            start=anchor_dt - pd.Timedelta(days=eff_window - 1),
            end=anchor_dt,
            freq="D"
        )
        cal_df = pd.DataFrame({"ds": full_idx, "y": 0.0})
        return cal_df, eff_window, anchor_dt

    min_dt = grouped["ds"].min()
    span_days = max(1, int((anchor_dt - min_dt).days) + 1)

    if lookback_days is not None and int(lookback_days) > 0:
        window_days = max(int(lookback_days), span_days)
        start_dt = min(min_dt, anchor_dt - pd.Timedelta(days=window_days - 1))
    else:
        window_days = span_days
        start_dt = min_dt

    full_index = pd.date_range(start=start_dt, end=anchor_dt, freq="D")
    cal_df = (
        grouped.set_index("ds")
        .reindex(full_index, fill_value=0.0)
        .rename_axis("ds")
        .reset_index()
    )
    return cal_df, len(cal_df), anchor_dt


def _linear_depletion(product: ProductForecastItem, alert_threshold_days: int, algorithm: str = "linear_extrapolation") -> dict:
    current_stock = _safe_float(product.current_stock, 0.0)
    if current_stock <= 0:
        return {
            "product_id": product.product_id,
            "product_name": product.product_name,
            "current_stock": product.current_stock,
            "days_until_depletion": 0.0,
            "alert": 0 <= alert_threshold_days,
            "algorithm": algorithm,
            "confidence": "low",
            "data_points": len(product.daily_sales)
        }

    if len(product.daily_sales) > 0:
        try:
            cal_df, window_days, _ = _parse_and_calendarize_sales(
                product.daily_sales,
                lookback_days=getattr(product, "lookback_days", None),
                reference_date=getattr(product, "reference_date", None)
            )
            total_qty = float(cal_df["y"].sum()) if not cal_df.empty else 0.0
            denom = max(1, window_days)
            avg_daily = total_qty / denom if denom > 0 else 0.0
        except Exception:
            valid_quantities = [max(0.0, _safe_float(d.get('quantity', 0))) for d in product.daily_sales if isinstance(d, dict)]
            fallback_window = getattr(product, "lookback_days", None)
            denom = max(1, int(fallback_window) if (fallback_window and int(fallback_window) > 0) else len(product.daily_sales))
            avg_daily = sum(valid_quantities) / denom if denom > 0 else 0.0

        days = current_stock / avg_daily if avg_daily > 0 else 999
    else:
        days = 999

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "current_stock": product.current_stock,
        "days_until_depletion": round(days, 1),
        "alert": days <= alert_threshold_days,
        "algorithm": algorithm,
        "confidence": "low",
        "data_points": len(product.daily_sales)
    }


def _fit_single_prophet_product(product: ProductForecastItem, alert_threshold_days: int, deadline: float = None) -> dict:
    if deadline and time.time() > deadline:
        res = _linear_depletion(product, alert_threshold_days)
        res["fallback_reason"] = "time_budget_exceeded"
        return res

    try:
        import pandas as pd
        from prophet import Prophet

        cal_df, window_days, anchor_dt = _parse_and_calendarize_sales(
            product.daily_sales,
            lookback_days=getattr(product, "lookback_days", None),
            reference_date=getattr(product, "reference_date", None)
        )

        if cal_df is None or len(cal_df) < 2 or anchor_dt is None:
            raise ValueError("Insufficient valid daily sales observations for Prophet")

        current_stock = _safe_float(product.current_stock, 0.0)
        if current_stock <= 0:
            return {
                "product_id": product.product_id,
                "product_name": product.product_name,
                "current_stock": product.current_stock,
                "days_until_depletion": 0,
                "alert": 0 <= alert_threshold_days,
                "algorithm": "prophet",
                "confidence": "high" if len(product.daily_sales) >= 60 else "medium",
                "data_points": len(product.daily_sales)
            }

        m = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=len(cal_df) > 180,
            changepoint_prior_scale=0.05,
            interval_width=0.80
        )
        m.fit(cal_df[['ds', 'y']])

        future = m.make_future_dataframe(periods=60)
        forecast = m.predict(future)
        future_forecast = forecast[forecast['ds'] > anchor_dt]

        cumulative = 0.0
        days_until_depletion = 60

        for _, row in future_forecast.iterrows():
            daily_demand = max(0.0, float(row['yhat']))
            cumulative += daily_demand
            days = (row['ds'] - anchor_dt).days
            if cumulative >= current_stock:
                days_until_depletion = days
                break

        return {
            "product_id": product.product_id,
            "product_name": product.product_name,
            "current_stock": product.current_stock,
            "days_until_depletion": days_until_depletion,
            "alert": days_until_depletion <= alert_threshold_days,
            "algorithm": "prophet",
            "confidence": "high" if len(product.daily_sales) >= 60 else "medium",
            "data_points": len(product.daily_sales)
        }
    except Exception as e:
        logger.warning("[StockDepletion] Prophet failed for %s: %s; falling back to linear extrapolation", product.product_name, e)
        res = _linear_depletion(product, alert_threshold_days, algorithm="linear_extrapolation")
        res["warning"] = f"Prophet fitting error: {e}"
        return res


@router.post("/stock-depletion")
async def stock_depletion_forecast(
    request: StockDepletionRequest,
    user: dict = Depends(get_current_user)
):
    """
    Bounded parallel Prophet-based per-product stock depletion forecasting.
    Includes request-level time budgeting and graceful linear fallback.
    """
    start_time = time.time()
    results = []
    prophet_candidates = []

    # 1. Propagate request-level lookback_days / reference_date and route sparse products (< 14 daily sales)
    for product in request.products:
        if product.lookback_days is None and request.lookback_days is not None:
            product.lookback_days = request.lookback_days
        if product.reference_date is None and request.reference_date is not None:
            product.reference_date = request.reference_date

        if len(product.daily_sales) < 14:
            results.append(_linear_depletion(product, request.alert_threshold_days))
        else:
            prophet_candidates.append(product)

    # 2. Bounded parallel Prophet fitting for eligible products via shared executor
    if prophet_candidates:
        budget_seconds = DEFAULT_DEPLETION_BUDGET_SECONDS
        deadline = start_time + budget_seconds

        future_to_product = {
            _DEPLETION_EXECUTOR.submit(_fit_single_prophet_product, p, request.alert_threshold_days, deadline): p
            for p in prophet_candidates
        }

        completed_futures = set()
        remaining_budget = max(0.01, deadline - time.time())

        try:
            for future in as_completed(future_to_product.keys(), timeout=remaining_budget):
                completed_futures.add(future)
                product = future_to_product[future]
                try:
                    res = future.result()
                    results.append(res)
                except Exception as e:
                    logger.warning("[StockDepletion] Error forecasting %s: %s", product.product_name, e)
                    fallback_res = _linear_depletion(product, request.alert_threshold_days)
                    fallback_res["warning"] = str(e)
                    results.append(fallback_res)
        except Exception as e:
            logger.warning(
                "[StockDepletion] Request time budget (%.1fs) exceeded or interrupted: %s. Falling back to linear extrapolation",
                budget_seconds,
                e
            )

        # Any futures not completed within deadline are cancelled and get linear fallback immediately
        for future, product in future_to_product.items():
            if future not in completed_futures:
                future.cancel()
                fallback_res = _linear_depletion(product, request.alert_threshold_days)
                fallback_res["fallback_reason"] = "time_budget_exceeded"
                results.append(fallback_res)

    results.sort(key=lambda x: x['days_until_depletion'] if x['days_until_depletion'] is not None else 999)
    alerts = [r for r in results if r.get('alert')]

    return {
        "products": results,
        "alerts": alerts,
        "total_products_analyzed": len(results),
        "alert_count": len(alerts),
        "threshold_days": request.alert_threshold_days
    }
