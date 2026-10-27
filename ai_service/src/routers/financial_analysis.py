from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from ..middleware.auth import get_current_user

# TODO Phase 3: wire this service up once complete

router = APIRouter()

class FinancialMetrics(BaseModel):
    gross_profit_margin: float
    net_profit_margin: float
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    quick_ratio_note: Optional[str] = None
    debt_to_equity: Optional[float] = None
    inventory_turnover: Optional[float] = None
    inventory_turnover_note: Optional[str] = None
    cash_conversion_cycle: Optional[float] = None
    cash_conversion_cycle_note: Optional[str] = None
    operating_expense_ratio: Optional[float] = None
    operating_expense_ratio_note: Optional[str] = None
    return_on_assets: Optional[float] = None
    return_on_equity: Optional[float] = None
    data_quality_warnings: List[str] = []

class FinancialData(BaseModel):
    revenue: float = Field(ge=0)
    costs: float = Field(ge=0)
    expenses: float = Field(ge=0)
    assets: float = Field(ge=0)
    liabilities: float = Field(ge=0)
    inventory_value: Optional[float] = None
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
        revenue = data.revenue
        costs = data.costs
        expenses = data.expenses
        assets = data.assets
        liabilities = data.liabilities

        # Division-by-zero guards
        if revenue == 0:
            return JSONResponse(
                status_code=400,
                content={"error": "Revenue cannot be zero for ratio analysis", "code": "ZERO_REVENUE"}
            )

        # Calculate profitability margins (multiplied by 100 for percentage)
        gross_profit_margin = ((revenue - costs) / revenue) * 100
        net_profit_margin = ((revenue - costs - expenses) / revenue) * 100

        # Calculate operating expense ratio
        operating_expense_ratio = None
        operating_expense_ratio_note = None
        if revenue > 0:
            operating_expense_ratio = round((expenses / revenue) * 100, 2)
            operating_expense_ratio_note = f"Operating expenses account for {operating_expense_ratio:.1f}% of net revenue"

        # Calculate current ratio
        current_ratio = None
        if liabilities > 0:
            current_ratio = assets / liabilities

        # Calculate debt to equity and ROE
        equity = assets - liabilities
        debt_to_equity = None
        if equity > 0:
            debt_to_equity = liabilities / equity

        # Calculate Return on Assets (ROA) & Return on Equity (ROE)
        return_on_assets = None
        if assets > 0:
            return_on_assets = round(((revenue - costs - expenses) / assets) * 100, 2)

        return_on_equity = None
        if equity > 0:
            return_on_equity = round(((revenue - costs - expenses) / equity) * 100, 2)

        # Prepare uncomputable metrics notes & warnings
        quick_ratio = None
        quick_ratio_note = "Requires current assets breakdown (cash + receivables). Not enough data provided."

        inventory_turnover = None
        inventory_turnover_note = None
        if data.inventory_value is not None and data.inventory_value > 0:
            inventory_turnover = round(costs / data.inventory_value, 2)
            inventory_turnover_note = f"Turnover ratio based on KSh {data.inventory_value:,.0f} current stock valuation"
        elif costs > 0:
            inventory_turnover_note = "Requires direct inventory value. Not enough data provided."

        cash_conversion_cycle = None
        cash_conversion_cycle_note = "Requires days payable outstanding and days sales outstanding. Not enough data provided."

        data_quality_warnings = []

        # Only warn about quick_ratio if assets/liabilities aren't provided (not on every call)
        if assets == 0 and liabilities == 0:
            data_quality_warnings.append(f"quick_ratio: {quick_ratio_note}")

        if cash_conversion_cycle is None:
            data_quality_warnings.append(f"cash_conversion_cycle: {cash_conversion_cycle_note}")

        if inventory_turnover_note and inventory_turnover is None:
            data_quality_warnings.append(f"inventory_turnover: {inventory_turnover_note}")

        if liabilities == 0:
            data_quality_warnings.append("current_ratio: Cannot compute because liabilities are zero.")

        if equity <= 0:
            data_quality_warnings.append("debt_to_equity: Cannot compute because equity (assets - liabilities) is zero or negative.")

        metrics = FinancialMetrics(
            gross_profit_margin=gross_profit_margin,
            net_profit_margin=net_profit_margin,
            current_ratio=current_ratio,
            quick_ratio=quick_ratio,
            quick_ratio_note=quick_ratio_note,
            debt_to_equity=debt_to_equity,
            inventory_turnover=inventory_turnover,
            inventory_turnover_note=inventory_turnover_note,
            cash_conversion_cycle=cash_conversion_cycle,
            cash_conversion_cycle_note=cash_conversion_cycle_note,
            operating_expense_ratio=operating_expense_ratio,
            operating_expense_ratio_note=operating_expense_ratio_note,
            return_on_assets=return_on_assets,
            return_on_equity=return_on_equity,
            data_quality_warnings=data_quality_warnings
        )
        return metrics
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
