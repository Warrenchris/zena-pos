import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib
from typing import Tuple, List, Dict, Optional


# Constants for Random Forest forecasting requirements
RF_WARMUP_DAYS = 30
RF_MIN_TRAIN_ROWS = 10
RF_MIN_CALENDAR_DAYS = RF_WARMUP_DAYS + RF_MIN_TRAIN_ROWS  # 40 days

FEATURE_COLUMNS = [
    'month', 'day_of_week', 'quarter',
    'revenue_lag_1', 'revenue_lag_7', 'revenue_lag_30',
    'revenue_rolling_7', 'revenue_rolling_30'
]


class FinancialForecastModel:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self._history_df: Optional[pd.DataFrame] = None

    def preprocess_series(self, dates: List[str], values: List[float]) -> pd.DataFrame:
        """
        Normalize sparse event dates into a continuous daily time series.
        Missing calendar days are filled with 0.0 according to POS semantics
        (no sales records on a day represents zero completed sales).
        """
        raw_dates = pd.to_datetime(dates)
        if raw_dates.tz is not None:
            raw_dates = raw_dates.tz_convert('UTC').tz_localize(None)
        raw_dates = raw_dates.normalize()

        df = pd.DataFrame({
            'date': raw_dates,
            'revenue': [float(v) for v in values]
        })

        # Group any duplicate dates on the same calendar day
        df = df.groupby('date', as_index=False)['revenue'].sum()
        df = df.sort_values('date').reset_index(drop=True)

        if len(df) == 0:
            raise ValueError("Dataset cannot be empty.")

        calendar_days = (df['date'].max() - df['date'].min()).days + 1
        if calendar_days < RF_MIN_CALENDAR_DAYS:
            raise ValueError(
                f"Random Forest forecasting requires at least {RF_MIN_CALENDAR_DAYS} calendar days of "
                f"daily history (30-day feature warm-up + 10 training samples). "
                f"Current history spans {calendar_days} calendar days."
            )

        # Reindex to a complete daily calendar from min_date to max_date
        full_calendar = pd.date_range(start=df['date'].min(), end=df['date'].max(), freq='D')
        calendar_df = (
            df.set_index('date')
            .reindex(full_calendar)
            .fillna({'revenue': 0.0})
            .rename_axis('date')
            .reset_index()
        )

        return calendar_df

    def prepare_features(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate temporal calendar, lag, and rolling features.
        
        INVARIANT: data must be a continuous daily time series.
        - revenue_lag_1: revenue 1 calendar day ago (yesterday).
        - revenue_lag_7: revenue 7 calendar days ago (same day of week last week).
        - revenue_lag_30: revenue 30 calendar days ago.
        
        DATA LEAKAGE PREVENTION:
        - Rolling features strictly use shift(1) so features for day t depend only
          on data observed prior to day t.
        """
        data = data.copy()
        data['date'] = pd.to_datetime(data['date'])
        data['month'] = data['date'].dt.month
        data['day_of_week'] = data['date'].dt.dayofweek
        data['quarter'] = data['date'].dt.quarter

        # Lag features
        data['revenue_lag_1'] = data['revenue'].shift(1)
        data['revenue_lag_7'] = data['revenue'].shift(7)
        data['revenue_lag_30'] = data['revenue'].shift(30)

        # Historical rolling features without lookahead leakage
        data['revenue_rolling_7'] = data['revenue'].shift(1).rolling(window=7).mean()
        data['revenue_rolling_30'] = data['revenue'].shift(1).rolling(window=30).mean()

        data = data.dropna()

        X = data[FEATURE_COLUMNS].values
        y = data['revenue'].values

        return X, y

    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, Optional[float]]:
        predictions = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))

        mask = y_test != 0
        mape = None
        if mask.any():
            mape = np.mean(np.abs((y_test[mask] - predictions[mask]) / y_test[mask])) * 100

        return {
            'mae': round(float(mae), 2),
            'rmse': round(float(rmse), 2),
            'mape': round(float(mape), 2) if mape is not None else None,
        }

    def fit(self, dates: List[str], values: List[float]) -> Dict[str, Optional[float]]:
        """
        Fit the Random Forest model on calendarized daily revenue data.
        """
        calendar_df = self.preprocess_series(dates, values)
        self._history_df = calendar_df.copy()

        X, y = self.prepare_features(calendar_df)
        if len(X) < RF_MIN_TRAIN_ROWS:
            raise ValueError(
                f"Insufficient data after feature engineering for training. "
                f"Required at least {RF_MIN_TRAIN_ROWS} rows, got {len(X)}."
            )

        split_idx = int(len(X) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        self.model.fit(X_train_scaled, y_train)

        if len(y_test) > 0:
            return self.evaluate(X_test_scaled, y_test)

        return {'mae': None, 'rmse': None, 'mape': None}

    def predict(self, periods: int) -> Dict[str, List]:
        """
        Generate recursive autoregressive forecasts for the next N calendar days.
        Forecast step 1 corresponds to (latest_historical_date + 1 day).
        Derives prediction intervals from the variance across ensemble decision trees.
        """
        if self._history_df is None:
            raise ValueError("Model must be fitted before prediction.")

        history = self._history_df.copy().sort_values('date').reset_index(drop=True)
        predictions: List[float] = []
        lower_bounds: List[float] = []
        upper_bounds: List[float] = []
        dates: List[str] = []

        for _ in range(periods):
            future_date = history['date'].max() + pd.Timedelta(days=1)

            # Construct feature row for future_date strictly from available history
            feat_row = pd.DataFrame([{
                'month': future_date.month,
                'day_of_week': future_date.dayofweek,
                'quarter': future_date.quarter,
                'revenue_lag_1': history['revenue'].iloc[-1],
                'revenue_lag_7': history['revenue'].iloc[-7],
                'revenue_lag_30': history['revenue'].iloc[-30],
                'revenue_rolling_7': history['revenue'].iloc[-7:].mean(),
                'revenue_rolling_30': history['revenue'].iloc[-30:].mean(),
            }])

            X_future_scaled = self.scaler.transform(feat_row[FEATURE_COLUMNS].values)

            # Predict mean and ensemble dispersion bounds across trees
            pred = float(max(0.0, self.model.predict(X_future_scaled)[0]))
            tree_preds = np.array([tree.predict(X_future_scaled)[0] for tree in self.model.estimators_])
            std = float(tree_preds.std())

            lower = float(max(0.0, pred - 1.96 * std))
            upper = float(max(pred, pred + 1.96 * std))

            predictions.append(pred)
            lower_bounds.append(lower)
            upper_bounds.append(upper)
            dates.append(future_date.strftime('%Y-%m-%dT00:00:00.000Z'))

            # Append prediction to history for next recursive step
            history = pd.concat([
                history,
                pd.DataFrame({'date': [future_date], 'revenue': [pred]})
            ], ignore_index=True)

        return {
            'dates': dates,
            'values': predictions,
            'lower_bounds': lower_bounds,
            'upper_bounds': upper_bounds
        }

    def train(self, data: pd.DataFrame) -> Dict[str, float]:
        """Legacy training interface for backward compatibility."""
        dates = data['date'].astype(str).tolist()
        values = data['revenue'].tolist()
        metrics = self.fit(dates, values)
        return {
            'train_score': 0.0,
            'test_score': 0.0,
            **{k: v for k, v in metrics.items() if v is not None},
        }

    def save_model(self, path: str) -> None:
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler,
            'history_df': self._history_df,
        }, path)

    @staticmethod
    def load_model(path: str) -> 'FinancialForecastModel':
        loaded = joblib.load(path)
        instance = FinancialForecastModel()
        instance.model = loaded['model']
        instance.scaler = loaded['scaler']
        instance._history_df = loaded.get('history_df')
        return instance


class ExpenseAnalysisModel:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )

    def prepare_features(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        category_dummies = pd.get_dummies(data['category'], prefix='category')

        data['month'] = data['date'].dt.month
        data['day_of_week'] = data['date'].dt.dayofweek
        data['quarter'] = data['date'].dt.quarter

        features_df = pd.concat([
            data[['amount']],
            category_dummies,
            data[['month', 'day_of_week', 'quarter']]
        ], axis=1)

        X = features_df.values
        y = data['amount'].values

        return X, y

    def train(self, data: pd.DataFrame) -> Dict[str, float]:
        X, y = self.prepare_features(data)

        split_idx = int(len(X) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        self.model.fit(X_train_scaled, y_train)

        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test) if len(y_test) > 0 else 0.0

        return {
            "train_score": train_score,
            "test_score": test_score
        }

    def predict(self, features: np.ndarray) -> np.ndarray:
        features_scaled = self.scaler.transform(features)
        return self.model.predict(features_scaled)

    def analyze_expenses(self, data: pd.DataFrame) -> Dict[str, any]:
        category_analysis = data.groupby('category').agg({
            'amount': ['sum', 'mean', 'count']
        }).round(2)

        data['month_year'] = data['date'].dt.to_period('M')
        monthly_trends = data.groupby(['month_year', 'category'])['amount'].sum().unstack()

        return {
            "category_analysis": category_analysis.to_dict(),
            "monthly_trends": monthly_trends.to_dict(),
            "top_expenses": data.nlargest(5, 'amount')[['category', 'amount', 'date']].to_dict('records'),
            "unusual_expenses": self._detect_anomalies(data)
        }

    def _detect_anomalies(self, data: pd.DataFrame) -> List[Dict]:
        anomalies = []

        for category in data['category'].unique():
            category_data = data[data['category'] == category]['amount']
            mean = category_data.mean()
            std = category_data.std()
            threshold = mean + 2 * std

            anomalous_expenses = data[
                (data['category'] == category) &
                (data['amount'] > threshold)
            ]

            for _, expense in anomalous_expenses.iterrows():
                anomalies.append({
                    "category": category,
                    "amount": expense['amount'],
                    "date": expense['date'],
                    "threshold": threshold,
                    "deviation_percent": ((expense['amount'] - mean) / mean) * 100 if mean else 0
                })

        return anomalies

    def save_model(self, path: str) -> None:
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler
        }, path)

    @staticmethod
    def load_model(path: str) -> 'ExpenseAnalysisModel':
        loaded = joblib.load(path)
        instance = ExpenseAnalysisModel()
        instance.model = loaded['model']
        instance.scaler = loaded['scaler']
        return instance
