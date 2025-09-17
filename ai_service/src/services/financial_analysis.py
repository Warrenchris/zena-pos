from typing import List, Dict, Optional
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timedelta

class FinancialAnalysisService:
    def __init__(self):
        self.scaler = StandardScaler()

    def calculate_financial_ratios(self, 
        revenue: float,
        costs: float,
        expenses: float,
        assets: float,
        liabilities: float
    ) -> Dict[str, float]:
        """
        Calculate key financial ratios for business analysis
        """
        try:
            gross_profit = revenue - costs
            net_profit = gross_profit - expenses
            equity = assets - liabilities

            ratios = {
                "gross_profit_margin": (gross_profit / revenue) if revenue > 0 else 0,
                "net_profit_margin": (net_profit / revenue) if revenue > 0 else 0,
                "current_ratio": (assets / liabilities) if liabilities > 0 else float('inf'),
                "debt_to_equity": (liabilities / equity) if equity > 0 else float('inf'),
                "return_on_assets": (net_profit / assets) if assets > 0 else 0,
                "return_on_equity": (net_profit / equity) if equity > 0 else 0
            }
            
            return ratios
        except Exception as e:
            raise ValueError(f"Error calculating financial ratios: {str(e)}")

    def analyze_trends(self, historical_data: pd.DataFrame) -> Dict[str, any]:
        """
        Analyze financial trends and patterns
        """
        try:
            # Calculate period-over-period changes
            changes = historical_data.pct_change()
            
            # Calculate moving averages
            ma_30 = historical_data.rolling(window=30).mean()
            ma_90 = historical_data.rolling(window=90).mean()
            
            # Detect trends
            trends = {
                "short_term": (ma_30.iloc[-1] > ma_30.iloc[-2]).to_dict(),
                "long_term": (ma_90.iloc[-1] > ma_90.iloc[-2]).to_dict(),
                "volatility": historical_data.std().to_dict(),
                "growth_rate": ((historical_data.iloc[-1] / historical_data.iloc[0]) - 1).to_dict()
            }
            
            return trends
        except Exception as e:
            raise ValueError(f"Error analyzing trends: {str(e)}")

    def generate_recommendations(self, metrics: Dict[str, float]) -> List[str]:
        """
        Generate business recommendations based on financial metrics
        """
        recommendations = []
        
        # Profitability recommendations
        if metrics["gross_profit_margin"] < 0.2:
            recommendations.append("Consider reviewing pricing strategy or reducing costs to improve gross profit margin")
        
        if metrics["net_profit_margin"] < 0.1:
            recommendations.append("Focus on reducing operating expenses to improve net profit margin")
        
        # Liquidity recommendations
        if metrics["current_ratio"] < 1.5:
            recommendations.append("Monitor cash flow closely and consider strategies to improve working capital")
        
        # Leverage recommendations
        if metrics["debt_to_equity"] > 2:
            recommendations.append("High leverage detected. Consider debt reduction or equity financing options")
        
        # Return recommendations
        if metrics["return_on_assets"] < 0.05:
            recommendations.append("Look for opportunities to improve asset utilization or dispose of underperforming assets")
        
        return recommendations

financial_service = FinancialAnalysisService()