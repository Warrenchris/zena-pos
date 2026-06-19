import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib
from typing import Tuple, List, Dict, Optional


class FinancialForecastModel:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self._history_df: Optional[pd.DataFrame] = None

    def prepare_features(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        data = data.copy()
        data['date'] = pd.to_datetime(data['date'])
        data['month'] = data['date'].dt.month
        data['day_of_week'] = data['date'].dt.dayofweek
        data['quarter'] = data['date'].dt.quarter

        data['revenue_lag_1'] = data['revenue'].shift(1)
        data['revenue_lag_7'] = data['revenue'].shift(7)
        data['revenue_lag_30'] = data['revenue'].shift(30)

        data['revenue_rolling_7'] = data['revenue'].rolling(window=7).mean()
        data['revenue_rolling_30'] = data['revenue'].rolling(window=30).mean()

        data = data.dropna()

        features = [
            'month', 'day_of_week', 'quarter',
            'revenue_lag_1', 'revenue_lag_7', 'revenue_lag_30',
            'revenue_rolling_7', 'revenue_rolling_30'
        ]

        X = data[features].values
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
        if len(dates) < 30:
            raise ValueError(
                f"RandomForest forecasting requires at least 30 data points. Got {len(dates)}."
            )

        df = pd.DataFrame({
            'date': pd.to_datetime(dates),
            'revenue': values,
        }).sort_values('date').reset_index(drop=True)
        self._history_df = df.copy()

        X, y = self.prepare_features(df)
        if len(X) < 10:
            raise ValueError("Insufficient data after feature engineering for training.")

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
        if self._history_df is None:
            raise ValueError("Model must be fitted before prediction.")

        df = self._history_df.copy().sort_values('date').reset_index(drop=True)
        predictions: List[float] = []
        dates: List[str] = []

        for _ in range(periods):
            X, _ = self.prepare_features(df)
            if len(X) == 0:
                break

            last_features = X[-1:]
            pred = float(self.model.predict(self.scaler.transform(last_features))[0])
            pred = max(0.0, pred)

            next_date = df['date'].max() + pd.Timedelta(days=1)
            df = pd.concat([
                df,
                pd.DataFrame({'date': [next_date], 'revenue': [pred]})
            ], ignore_index=True)

            predictions.append(pred)
            dates.append(next_date.isoformat())

        return {'dates': dates, 'values': predictions}

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
