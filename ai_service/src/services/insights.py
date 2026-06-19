from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest


class InsightsService:
    def __init__(self):
        self.scaler = StandardScaler()

    def _label_segment(self, centroid_values: np.ndarray, feature_names: List[str]) -> str:
        spend = centroid_values[feature_names.index('total_spend')]
        frequency = centroid_values[feature_names.index('purchase_frequency')]
        recency = centroid_values[feature_names.index('days_since_last_purchase')]

        spend_threshold_high = centroid_values[feature_names.index('total_spend')]
        spend_threshold_mid = centroid_values[feature_names.index('total_spend')]
        freq_threshold = centroid_values[feature_names.index('purchase_frequency')]

        # Use median-based thresholds from centroid context
        if spend > spend_threshold_high * 1.2 and frequency > freq_threshold:
            return "Champions"
        if spend > spend_threshold_mid and recency < 30:
            return "Loyal Customers"
        if recency > 90:
            return "At Risk"
        if frequency <= 1:
            return "One-Time Buyers"
        return "Regular Customers"

    def analyze_customer_segments(self, customers: List[dict]) -> Dict[str, Any]:
        if len(customers) < 10:
            return {
                "segments": [],
                "total_customers_analyzed": len(customers),
                "message": "At least 10 customers required for meaningful segmentation.",
                "algorithm": "KMeans"
            }

        df = pd.DataFrame(customers)

        column_map = {
            'customerId': 'customer_id',
            'total_spend': 'total_spend',
            'purchase_frequency': 'purchase_frequency',
            'avg_transaction_value': 'average_transaction_value',
            'days_since_last_purchase': 'days_since_last_purchase',
        }
        df = df.rename(columns={k: v for k, v in column_map.items() if k in df.columns})

        feature_names = [
            'total_spend',
            'purchase_frequency',
            'average_transaction_value',
            'days_since_last_purchase',
        ]

        for col in feature_names:
            if col not in df.columns:
                df[col] = 0
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        spend_median = df['total_spend'].median()
        freq_median = df['purchase_frequency'].median()
        recency_median = df['days_since_last_purchase'].median()

        X = self.scaler.fit_transform(df[feature_names])
        n_clusters = min(5, len(df))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        clusters = kmeans.fit_predict(X)

        df['segment'] = clusters
        centroids = self.scaler.inverse_transform(kmeans.cluster_centers_)

        segments = []
        total_customers = len(df)

        for segment_id in range(n_clusters):
            segment_df = df[df['segment'] == segment_id]
            centroid = centroids[segment_id]

            spend = float(centroid[feature_names.index('total_spend')])
            frequency = float(centroid[feature_names.index('purchase_frequency')])
            recency = float(centroid[feature_names.index('days_since_last_purchase')])

            if spend > spend_median * 1.5 and frequency > freq_median:
                label = "Champions"
            elif spend > spend_median and recency < 30:
                label = "Loyal Customers"
            elif recency > 90:
                label = "At Risk"
            elif frequency <= 1:
                label = "One-Time Buyers"
            else:
                label = "Regular Customers"

            segments.append({
                "segment_id": int(segment_id),
                "label": label,
                "customer_count": int(len(segment_df)),
                "avg_total_spend": round(float(segment_df['total_spend'].mean()), 2),
                "avg_purchase_frequency": round(float(segment_df['purchase_frequency'].mean()), 2),
                "avg_days_since_last_purchase": round(float(segment_df['days_since_last_purchase'].mean()), 1),
                "avg_transaction_value": round(float(segment_df['average_transaction_value'].mean()), 2),
                "percentage_of_customers": round((len(segment_df) / total_customers) * 100, 1),
            })

        segments.sort(key=lambda s: s['avg_total_spend'], reverse=True)

        return {
            "segments": segments,
            "total_customers_analyzed": total_customers,
            "algorithm": "KMeans",
            "n_clusters": n_clusters,
        }

    def analyze_performance_metrics(self, data: pd.DataFrame) -> Dict[str, any]:
        metrics = {
            "revenue": {
                "total": data['revenue'].sum(),
                "average": data['revenue'].mean(),
                "growth": (data['revenue'].iloc[-1] / data['revenue'].iloc[0] - 1) * 100 if len(data) > 1 and data['revenue'].iloc[0] else 0
            },
            "customers": {
                "total": data['customer_count'].sum(),
                "average": data['customer_count'].mean(),
                "retention": data['customer_count'].iloc[-1] / data['customer_count'].max() * 100 if data['customer_count'].max() else 0
            },
            "transactions": {
                "total": data['transaction_count'].sum(),
                "average": data['transaction_count'].mean(),
                "per_customer": data['transaction_count'].mean() / data['customer_count'].mean() if data['customer_count'].mean() else 0
            }
        }
        return metrics

    def generate_business_recommendations(self, metrics: Dict[str, any]) -> List[Dict[str, any]]:
        insights = []

        if metrics["revenue"]["growth"] < 0:
            insights.append({
                "category": "Revenue",
                "type": "warning",
                "description": "Revenue is declining",
                "recommendations": [
                    "Review pricing strategy",
                    "Identify and focus on high-performing products/services",
                    "Consider market expansion or new product development"
                ]
            })

        if metrics["customers"]["retention"] < 70:
            insights.append({
                "category": "Customers",
                "type": "warning",
                "description": "Low customer retention rate",
                "recommendations": [
                    "Implement a customer loyalty program",
                    "Improve customer service",
                    "Gather and act on customer feedback",
                    "Analyze reasons for customer churn"
                ]
            })

        if metrics["transactions"]["per_customer"] < 2:
            insights.append({
                "category": "Transactions",
                "type": "opportunity",
                "description": "Low transactions per customer",
                "recommendations": [
                    "Develop cross-selling strategies",
                    "Create bundle offers",
                    "Implement targeted marketing campaigns",
                    "Consider a customer rewards program"
                ]
            })

        return insights

    def calculate_business_health_score(self, metrics: Dict[str, any]) -> Dict[str, any]:
        scores = {
            "revenue_score": min(metrics["revenue"]["growth"] / 100 + 1, 1) * 0.4,
            "customer_score": min(metrics["customers"]["retention"] / 100, 1) * 0.3,
            "transaction_score": min(metrics["transactions"]["per_customer"] / 5, 1) * 0.3
        }

        overall_score = sum(scores.values()) * 100

        return {
            "overall_score": overall_score,
            "component_scores": scores,
            "health_status": "Excellent" if overall_score >= 80
                          else "Good" if overall_score >= 60
                          else "Fair" if overall_score >= 40
                          else "Poor"
        }


class AnomalyDetectionService:
    """
    Detects anomalous business days using Isolation Forest.
    """

    def detect_anomalies(self, daily_data: List[dict], contamination: float = 0.05) -> dict:
        if len(daily_data) < 14:
            return {
                "anomalies": [],
                "message": "At least 14 days of data required for anomaly detection",
                "algorithm": "IsolationForest"
            }

        df = pd.DataFrame(daily_data)
        df['date'] = pd.to_datetime(df['date'])
        df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce').fillna(0)
        df['transaction_count'] = pd.to_numeric(df['transaction_count'], errors='coerce').fillna(0)
        df['avg_transaction_value'] = pd.to_numeric(df['avg_transaction_value'], errors='coerce').fillna(0)
        df['day_of_week'] = df['date'].dt.dayofweek
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)

        features = ['revenue', 'transaction_count', 'avg_transaction_value', 'day_of_week', 'is_weekend']
        X = df[features].fillna(0).values

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42
        )
        predictions = model.fit_predict(X_scaled)
        scores = model.score_samples(X_scaled)

        anomalies = []
        for i, (pred, score) in enumerate(zip(predictions, scores)):
            if pred == -1:
                row = df.iloc[i]
                anomalies.append({
                    "date": row['date'].strftime('%Y-%m-%d'),
                    "revenue": float(row['revenue']),
                    "transaction_count": int(row['transaction_count']),
                    "avg_transaction_value": float(row['avg_transaction_value']),
                    "anomaly_score": round(float(score), 4),
                    "severity": "high" if score < np.percentile(scores, 5) else "medium"
                })

        anomalies.sort(key=lambda x: x['anomaly_score'])

        return {
            "anomalies": anomalies,
            "total_days_analyzed": len(df),
            "anomalies_detected": len(anomalies),
            "contamination_rate": contamination,
            "algorithm": "IsolationForest",
            "message": f"Analyzed {len(df)} days. Found {len(anomalies)} anomalous days."
        }


insights_service = InsightsService()
