from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from ..middleware.auth import get_current_user

router = APIRouter()

class FinancialMetrics(BaseModel):
    gross_profit_margin: float
    net_profit_margin: float
    current_ratio: float
    quick_ratio: float
    debt_to_equity: float
    inventory_turnover: float
    cash_conversion_cycle: float

class FinancialData(BaseModel):
    revenue: float
    costs: float
    expenses: float
    assets: float
    liabilities: float
    date: datetime

@router.post("/analyze", response_model=FinancialMetrics)
async def analyze_financials(
    data: FinancialData,
    user: dict = Depends(get_current_user)
):
    """
    Analyze financial data and return key financial metrics
    """
    try:
        metrics = FinancialMetrics(
            gross_profit_margin=(data.revenue - data.costs) / data.revenue,
            net_profit_margin=(data.revenue - data.costs - data.expenses) / data.revenue,
            current_ratio=data.assets / data.liabilities if data.liabilities != 0 else float('inf'),
            quick_ratio=(data.assets * 0.8) / data.liabilities if data.liabilities != 0 else float('inf'),
            debt_to_equity=data.liabilities / (data.assets - data.liabilities) if (data.assets - data.liabilities) != 0 else float('inf'),
            inventory_turnover=data.costs / (data.assets * 0.3),  # Assuming inventory is 30% of assets
            cash_conversion_cycle=45.0  # Placeholder - needs actual calculation based on more data
        )
        return metrics
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))