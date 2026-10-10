import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
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

        # Weighted Absolute Percentage Error (WAPE): sum(|actual - pred|) / sum(actual) * 100
        # Correctly handles individual zero days without division-by-zero
        sum_actual = float(np.sum(y_test))
        wape = None
        if sum_actual > 0:
            wape = float(np.sum(np.abs(y_test - predictions)) / sum_actual) * 100

        # Baseline comparison: Historical Mean Baseline
        baseline_pred = np.full_like(y_test, fill_value=np.mean(y_test))
        baseline_mae = float(mean_absolute_error(y_test, baseline_pred))
        baseline_wape = float(np.sum(np.abs(y_test - baseline_pred)) / sum_actual * 100) if sum_actual > 0 else None

        return {
            'mae': round(float(mae), 2),
            'rmse': round(float(rmse), 2),
            'mape': round(float(mape), 2) if mape is not None else None,
            'wape': round(float(wape), 2) if wape is not None else None,
            'baseline_mae': round(float(baseline_mae), 2),
            'baseline_wape': round(float(baseline_wape), 2) if baseline_wape is not None else None,
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
    """
    EXPERIMENTAL / ORPHANED MODEL:
    Not currently wired to any live production router. Retained and corrected
    to eliminate target leakage and ensure consistent feature schemas.
    """
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.encoder = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
        self.categories_: Optional[List[str]] = None
        self.feature_names_: List[str] = []
        self._category_means: Dict[str, float] = {}
        self._global_mean: float = 0.0

    def prepare_features(self, data: pd.DataFrame, is_training: bool = False) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Build predictive features from information available strictly at prediction time.
        TARGET LEAKAGE PREVENTED:
        - Target variable 'amount' is strictly EXCLUDED from the feature matrix X.
        - Features comprise calendar temporal variables and one-hot encoded category.
        """
        if not isinstance(data, pd.DataFrame) or len(data) == 0:
            raise ValueError("Input data must be a non-empty DataFrame.")

        if 'category' not in data.columns or 'date' not in data.columns:
            raise ValueError("Input data must contain 'date' and 'category' columns.")

        df = data.copy()
        df['date'] = pd.to_datetime(df['date'])

        # Temporal calendar features available at prediction time
        calendar_df = pd.DataFrame({
            'month': df['date'].dt.month,
            'day': df['date'].dt.day,
            'day_of_week': df['date'].dt.dayofweek,
            'quarter': df['date'].dt.quarter
        }, index=df.index)

        # Categorical encoding with deterministic schema
        categories_2d = df[['category']].astype(str)
        if is_training:
            cat_features = self.encoder.fit_transform(categories_2d)
            self.categories_ = list(self.encoder.categories_[0])
            cat_feature_names = [f"cat_{c}" for c in self.categories_]
        else:
            if self.categories_ is None:
                # If predict called before train, fit encoder on current data
                cat_features = self.encoder.fit_transform(categories_2d)
                self.categories_ = list(self.encoder.categories_[0])
                cat_feature_names = [f"cat_{c}" for c in self.categories_]
            else:
                cat_features = self.encoder.transform(categories_2d)
                cat_feature_names = [f"cat_{c}" for c in self.categories_]

        cat_df = pd.DataFrame(cat_features, columns=cat_feature_names, index=df.index)

        # Concatenate features — NOTE: 'amount' is NEVER included in features
        features_df = pd.concat([calendar_df, cat_df], axis=1)
        self.feature_names_ = list(features_df.columns)

        X = features_df.values.astype(float)
        y = None
        if 'amount' in df.columns:
            y = pd.to_numeric(df['amount'], errors='coerce').fillna(0.0).values.astype(float)

        return X, y

    def train(self, data: pd.DataFrame) -> Dict[str, Optional[float]]:
        """
        Train the model using chronological train/test split.
        Compares against a naive historical category-mean baseline.
        """
        if not isinstance(data, pd.DataFrame) or len(data) == 0:
            raise ValueError("Cannot train on empty dataset.")

        if 'amount' not in data.columns:
            raise ValueError("Training dataset must contain target column 'amount'.")

        if len(data) < 5:
            raise ValueError("Insufficient data for expense model training (at least 5 samples required).")

        # Sort chronologically to preserve temporal boundaries
        data_sorted = data.copy()
        data_sorted['date'] = pd.to_datetime(data_sorted['date'])
        data_sorted = data_sorted.sort_values('date').reset_index(drop=True)

        X, y = self.prepare_features(data_sorted, is_training=True)

        split_idx = int(len(X) * 0.8)
        if split_idx == len(X):
            split_idx = len(X) - 1

        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        # Record training category means and global mean for baseline comparison
        train_cats = data_sorted['category'].iloc[:split_idx].astype(str)
        self._global_mean = float(np.mean(y_train))
        self._category_means = data_sorted.iloc[:split_idx].groupby('category')['amount'].mean().to_dict()

        X_train_scaled = self.scaler.fit_transform(X_train)
        self.model.fit(X_train_scaled, y_train)

        train_score = float(self.model.score(X_train_scaled, y_train))
        test_score = None
        mae = None
        rmse = None
        wape = None
        baseline_mae = None
        baseline_wape = None

        if len(y_test) > 0:
            X_test_scaled = self.scaler.transform(X_test)
            test_preds = np.maximum(0.0, self.model.predict(X_test_scaled))
            test_score = float(r2_score(y_test, test_preds)) if len(y_test) > 1 and np.var(y_test) > 0 else 0.0
            mae = float(mean_absolute_error(y_test, test_preds))
            rmse = float(np.sqrt(mean_squared_error(y_test, test_preds)))
            sum_actual = float(np.sum(y_test))
            wape = float(np.sum(np.abs(y_test - test_preds)) / sum_actual * 100) if sum_actual > 0 else 0.0

            # Compute category-mean baseline predictions on test set
            test_cats = data_sorted['category'].iloc[split_idx:].astype(str)
            baseline_preds = np.array([self._category_means.get(c, self._global_mean) for c in test_cats])
            baseline_mae = float(mean_absolute_error(y_test, baseline_preds))
            baseline_wape = float(np.sum(np.abs(y_test - baseline_preds)) / sum_actual * 100) if sum_actual > 0 else 0.0

        return {
            "train_score": round(train_score, 4),
            "test_score": round(test_score, 4) if test_score is not None else None,
            "mae": round(mae, 2) if mae is not None else None,
            "rmse": round(rmse, 2) if rmse is not None else None,
            "wape": round(wape, 2) if wape is not None else None,
            "baseline_mae": round(baseline_mae, 2) if baseline_mae is not None else None,
            "baseline_wape": round(baseline_wape, 2) if baseline_wape is not None else None,
        }

    def predict(self, data_or_features) -> np.ndarray:
        """
        Predict expense amounts for given input DataFrame or feature array.
        """
        if isinstance(data_or_features, pd.DataFrame):
            X, _ = self.prepare_features(data_or_features, is_training=False)
        else:
            X = np.asarray(data_or_features)

        features_scaled = self.scaler.transform(X)
        return np.maximum(0.0, self.model.predict(features_scaled))

    def analyze_expenses(self, data: pd.DataFrame) -> Dict[str, any]:
        category_analysis = data.groupby('category').agg({
            'amount': ['sum', 'mean', 'count']
        }).round(2)

        data = data.copy()
        data['date'] = pd.to_datetime(data['date'])
        data['month_year'] = data['date'].dt.to_period('M')
        monthly_trends = data.groupby(['month_year', 'category'])['amount'].sum().unstack().fillna(0)

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
            if pd.isna(std) or std == 0:
                continue
            threshold = mean + 2 * std

            anomalous_expenses = data[
                (data['category'] == category) &
                (data['amount'] > threshold)
            ]

            for _, expense in anomalous_expenses.iterrows():
                anomalies.append({
                    "category": category,
                    "amount": float(expense['amount']),
                    "date": str(expense['date']),
                    "threshold": float(threshold),
                    "deviation_percent": float(((expense['amount'] - mean) / mean) * 100) if mean else 0.0
                })

        return anomalies

    def save_model(self, path: str) -> None:
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler,
            'encoder': self.encoder,
            'categories_': self.categories_,
            'feature_names_': self.feature_names_,
            '_category_means': self._category_means,
            '_global_mean': self._global_mean
        }, path)

    @staticmethod
    def load_model(path: str) -> 'ExpenseAnalysisModel':
        loaded = joblib.load(path)
        instance = ExpenseAnalysisModel()
        instance.model = loaded['model']
        instance.scaler = loaded['scaler']
        instance.encoder = loaded.get('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        instance.categories_ = loaded.get('categories_')
        instance.feature_names_ = loaded.get('feature_names_', [])
        instance._category_means = loaded.get('_category_means', {})
        instance._global_mean = loaded.get('_global_mean', 0.0)
        return instance
