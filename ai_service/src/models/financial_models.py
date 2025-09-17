import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import joblib
from typing import Tuple, List, Dict

class FinancialForecastModel:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )

    def prepare_features(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare features for the model
        """
        # Create time-based features
        data['month'] = data['date'].dt.month
        data['day_of_week'] = data['date'].dt.dayofweek
        data['quarter'] = data['date'].dt.quarter
        
        # Create lag features
        data['revenue_lag_1'] = data['revenue'].shift(1)
        data['revenue_lag_7'] = data['revenue'].shift(7)
        data['revenue_lag_30'] = data['revenue'].shift(30)
        
        # Create rolling mean features
        data['revenue_rolling_7'] = data['revenue'].rolling(window=7).mean()
        data['revenue_rolling_30'] = data['revenue'].rolling(window=30).mean()
        
        # Drop rows with NaN values
        data = data.dropna()
        
        # Prepare features and target
        features = ['month', 'day_of_week', 'quarter', 
                   'revenue_lag_1', 'revenue_lag_7', 'revenue_lag_30',
                   'revenue_rolling_7', 'revenue_rolling_30']
        
        X = data[features].values
        y = data['revenue'].values
        
        return X, y

    def train(self, data: pd.DataFrame) -> Dict[str, float]:
        """
        Train the model and return performance metrics
        """
        X, y = self.prepare_features(data)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train model
        self.model.fit(X_train_scaled, y_train)
        
        # Calculate metrics
        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test)
        
        return {
            "train_score": train_score,
            "test_score": test_score
        }

    def predict(self, features: np.ndarray) -> np.ndarray:
        """
        Make predictions using the trained model
        """
        features_scaled = self.scaler.transform(features)
        return self.model.predict(features_scaled)

    def save_model(self, path: str) -> None:
        """
        Save the model to disk
        """
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler
        }, path)

    @staticmethod
    def load_model(path: str) -> 'FinancialForecastModel':
        """
        Load the model from disk
        """
        loaded = joblib.load(path)
        instance = FinancialForecastModel()
        instance.model = loaded['model']
        instance.scaler = loaded['scaler']
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
        """
        Prepare features for expense analysis
        """
        # Create category-based features
        category_dummies = pd.get_dummies(data['category'], prefix='category')
        
        # Create time-based features
        data['month'] = data['date'].dt.month
        data['day_of_week'] = data['date'].dt.dayofweek
        data['quarter'] = data['date'].dt.quarter
        
        # Combine features
        features_df = pd.concat([
            data[['amount']],
            category_dummies,
            data[['month', 'day_of_week', 'quarter']]
        ], axis=1)
        
        X = features_df.values
        y = data['amount'].values
        
        return X, y

    def train(self, data: pd.DataFrame) -> Dict[str, float]:
        """
        Train the expense analysis model
        """
        X, y = self.prepare_features(data)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train model
        self.model.fit(X_train_scaled, y_train)
        
        # Calculate metrics
        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test)
        
        return {
            "train_score": train_score,
            "test_score": test_score
        }

    def analyze_expenses(self, data: pd.DataFrame) -> Dict[str, any]:
        """
        Analyze expenses and generate insights
        """
        # Group by category
        category_analysis = data.groupby('category').agg({
            'amount': ['sum', 'mean', 'count']
        }).round(2)
        
        # Calculate trends
        data['month_year'] = data['date'].dt.to_period('M')
        monthly_trends = data.groupby(['month_year', 'category'])['amount'].sum().unstack()
        
        # Generate insights
        insights = {
            "category_analysis": category_analysis.to_dict(),
            "monthly_trends": monthly_trends.to_dict(),
            "top_expenses": data.nlargest(5, 'amount')[['category', 'amount', 'date']].to_dict('records'),
            "unusual_expenses": self._detect_anomalies(data)
        }
        
        return insights

    def _detect_anomalies(self, data: pd.DataFrame) -> List[Dict]:
        """
        Detect unusual expenses using statistical methods
        """
        anomalies = []
        
        for category in data['category'].unique():
            category_data = data[data['category'] == category]['amount']
            mean = category_data.mean()
            std = category_data.std()
            
            # Define anomaly threshold (e.g., 2 standard deviations)
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
                    "deviation_percent": ((expense['amount'] - mean) / mean) * 100
                })
        
        return anomalies

    def save_model(self, path: str) -> None:
        """
        Save the model to disk
        """
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler
        }, path)

    @staticmethod
    def load_model(path: str) -> 'ExpenseAnalysisModel':
        """
        Load the model from disk
        """
        loaded = joblib.load(path)
        instance = ExpenseAnalysisModel()
        instance.model = loaded['model']
        instance.scaler = loaded['scaler']
        return instance