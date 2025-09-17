from typing import List, Dict
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from datetime import datetime

class InsightsService:
    def __init__(self):
        self.scaler = StandardScaler()

    def analyze_customer_segments(self, data: pd.DataFrame) -> Dict[str, any]:
        """
        Analyze customer segments using K-means clustering
        """
        try:
            # Prepare data for clustering
            features = ['revenue', 'transaction_count', 'avg_transaction']
            X = self.scaler.fit_transform(data[features])
            
            # Determine optimal number of clusters
            n_clusters = min(len(data), 5)  # Maximum 5 segments
            kmeans = KMeans(n_clusters=n_clusters, random_state=42)
            clusters = kmeans.fit_predict(X)
            
            # Analyze segments
            data['segment'] = clusters
            segment_analysis = data.groupby('segment').agg({
                'revenue': 'mean',
                'transaction_count': 'mean',
                'avg_transaction': 'mean'
            }).round(2)
            
            return {
                "segments": segment_analysis.to_dict('index'),
                "cluster_centers": self.scaler.inverse_transform(kmeans.cluster_centers_).tolist()
            }
        except Exception as e:
            raise ValueError(f"Error analyzing customer segments: {str(e)}")

    def analyze_performance_metrics(self, data: pd.DataFrame) -> Dict[str, any]:
        """
        Analyze key performance metrics and their trends
        """
        try:
            metrics = {
                "revenue": {
                    "total": data['revenue'].sum(),
                    "average": data['revenue'].mean(),
                    "growth": (data['revenue'].iloc[-1] / data['revenue'].iloc[0] - 1) * 100
                },
                "customers": {
                    "total": data['customer_count'].sum(),
                    "average": data['customer_count'].mean(),
                    "retention": data['customer_count'].iloc[-1] / data['customer_count'].max() * 100
                },
                "transactions": {
                    "total": data['transaction_count'].sum(),
                    "average": data['transaction_count'].mean(),
                    "per_customer": data['transaction_count'].mean() / data['customer_count'].mean()
                }
            }
            return metrics
        except Exception as e:
            raise ValueError(f"Error analyzing performance metrics: {str(e)}")

    def generate_business_recommendations(self, metrics: Dict[str, any]) -> List[Dict[str, any]]:
        """
        Generate actionable business recommendations based on metrics
        """
        insights = []
        
        # Revenue insights
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
        
        # Customer insights
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
        
        # Transaction insights
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
        """
        Calculate an overall business health score
        """
        try:
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
        except Exception as e:
            raise ValueError(f"Error calculating business health score: {str(e)}")

insights_service = InsightsService()