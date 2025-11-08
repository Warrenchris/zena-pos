from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime
from ..middleware.auth import get_current_user

router = APIRouter()

class BusinessData(BaseModel):
    revenue: List[float]
    costs: List[float]
    customer_count: List[int]
    transaction_count: List[int]
    average_transaction_value: List[float]

class BusinessInsight(BaseModel):
    insight_type: str
    description: str
    score: float
    recommendations: List[str]

@router.post("/analyze", response_model=List[BusinessInsight])
async def analyze_business(
    data: BusinessData,
    user: dict = Depends(get_current_user)
):
    """
    Generate business insights using ML techniques
    """
    try:
        # Import heavy dependencies lazily so the app can start without them
        import pandas as pd
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler

        # Prepare data for analysis
        df = pd.DataFrame({
            'revenue': data.revenue,
            'costs': data.costs,
            'customer_count': data.customer_count,
            'transaction_count': data.transaction_count,
            'avg_transaction': data.average_transaction_value
        })

        insights = []

        # Revenue Analysis
        revenue_trend = (df['revenue'].iloc[-1] - df['revenue'].iloc[0]) / df['revenue'].iloc[0]
        if revenue_trend > 0:
            insights.append(BusinessInsight(
                insight_type="Revenue Growth",
                description=f"Positive revenue growth of {revenue_trend:.1%}",
                score=min(revenue_trend, 1.0),
                recommendations=[
                    "Consider expanding to new markets",
                    "Invest in marketing to maintain growth",
                    "Analyze top-performing products/services"
                ]
            ))
        else:
            insights.append(BusinessInsight(
                insight_type="Revenue Decline",
                description=f"Revenue decline of {abs(revenue_trend):.1%}",
                score=max(revenue_trend, -1.0),
                recommendations=[
                    "Review pricing strategy",
                    "Analyze customer churn",
                    "Consider cost optimization"
                ]
            ))

        # Customer Analysis
        customer_retention = df['customer_count'].mean() / df['customer_count'].max()
        insights.append(BusinessInsight(
            insight_type="Customer Retention",
            description=f"Customer retention rate: {customer_retention:.1%}",
            score=customer_retention,
            recommendations=[
                "Implement customer loyalty program",
                "Gather customer feedback",
                "Improve customer service"
            ]
        ))

        return insights

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))