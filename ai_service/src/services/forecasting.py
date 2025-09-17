from typing import List, Dict, Tuple
import pandas as pd
import numpy as np
from prophet import Prophet
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timedelta

class ForecastingService:
    def __init__(self):
        self.prophet_model = None
        self.scaler = StandardScaler()

    def prepare_data(self, dates: List[datetime], values: List[float]) -> pd.DataFrame:
        """
        Prepare data for Prophet forecasting
        """
        return pd.DataFrame({
            'ds': dates,
            'y': values
        })

    def train_forecast_model(self, data: pd.DataFrame) -> None:
        """
        Train the Prophet forecasting model
        """
        try:
            self.prophet_model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=False,
                changepoint_prior_scale=0.05
            )
            self.prophet_model.fit(data)
        except Exception as e:
            raise ValueError(f"Error training forecast model: {str(e)}")

    def generate_forecast(self, periods: int = 30) -> Tuple[pd.DataFrame, Dict[str, any]]:
        """
        Generate forecasts using the trained model
        """
        if self.prophet_model is None:
            raise ValueError("Model not trained. Please train the model first.")

        try:
            # Create future dataframe for forecasting
            future = self.prophet_model.make_future_dataframe(periods=periods)
            
            # Generate forecast
            forecast = self.prophet_model.predict(future)
            
            # Extract components for analysis
            components = {
                "trend": forecast['trend'].tolist(),
                "yearly": forecast['yearly'].tolist() if 'yearly' in forecast else None,
                "weekly": forecast['weekly'].tolist() if 'weekly' in forecast else None
            }
            
            return forecast, components
        except Exception as e:
            raise ValueError(f"Error generating forecast: {str(e)}")

    def calculate_forecast_metrics(self, actual: pd.Series, predicted: pd.Series) -> Dict[str, float]:
        """
        Calculate forecast accuracy metrics
        """
        try:
            mse = np.mean((actual - predicted) ** 2)
            rmse = np.sqrt(mse)
            mae = np.mean(np.abs(actual - predicted))
            mape = np.mean(np.abs((actual - predicted) / actual)) * 100
            
            return {
                "mse": mse,
                "rmse": rmse,
                "mae": mae,
                "mape": mape
            }
        except Exception as e:
            raise ValueError(f"Error calculating forecast metrics: {str(e)}")

    def analyze_seasonality(self, data: pd.DataFrame) -> Dict[str, any]:
        """
        Analyze seasonal patterns in the data
        """
        try:
            # Add time-based features
            data['month'] = data['ds'].dt.month
            data['day_of_week'] = data['ds'].dt.dayofweek
            
            # Calculate monthly and weekly patterns
            monthly_pattern = data.groupby('month')['y'].mean()
            weekly_pattern = data.groupby('day_of_week')['y'].mean()
            
            return {
                "monthly_pattern": monthly_pattern.to_dict(),
                "weekly_pattern": weekly_pattern.to_dict(),
                "peak_month": monthly_pattern.idxmax(),
                "peak_day": weekly_pattern.idxmax()
            }
        except Exception as e:
            raise ValueError(f"Error analyzing seasonality: {str(e)}")

forecasting_service = ForecastingService()