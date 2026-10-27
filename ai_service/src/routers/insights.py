from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime
from ..middleware.auth import get_current_user
from ..services.insights import InsightsService, AnomalyDetectionService

router = APIRouter()


class BusinessData(BaseModel):
    revenue: List[float] = []
    costs: List[float] = []
    customer_count: List[int] = []
    transaction_count: List[int] = []
    average_transaction_value: List[float] = []
    repeat_customer_rate: Optional[float] = None
    retention_rate: Optional[float] = None
    total_customers: Optional[int] = None
    repeat_customers: Optional[int] = None


class BusinessInsight(BaseModel):
    insight_type: str
    description: str
    score: float
    recommendations: List[str]


class CustomerSegmentRequest(BaseModel):
    customers: List[dict]


class AnomalyRequest(BaseModel):
    daily_data: List[dict]
    contamination: float = 0.05


@router.post("/analyze", response_model=List[BusinessInsight])
async def analyze_business(
    data: BusinessData,
    user: dict = Depends(get_current_user)
):
    """
    Generate business insights using ML techniques
    """
    try:
        import pandas as pd

        insights = []

        # 1. Revenue Analysis: Trim pre-launch leading zeros
        active_revenues = [float(r) for r in data.revenue]
        first_rev_idx = next((i for i, r in enumerate(active_revenues) if r > 0), None)
        if first_rev_idx is not None and first_rev_idx > 0:
            active_revenues = active_revenues[first_rev_idx:]

        if not active_revenues or sum(active_revenues) == 0:
            insights.append(BusinessInsight(
                insight_type="Revenue Baseline",
                description="No sales revenue recorded yet for trend analysis.",
                score=0.0,
                recommendations=[
                    "Record POS sales to begin tracking revenue trends",
                    "Ensure catalog products are priced and stocked",
                    "Promote store launch to initial customers"
                ]
            ))
        elif len(active_revenues) == 1:
            insights.append(BusinessInsight(
                insight_type="Revenue Baseline",
                description=f"Initial operating revenue established at KSh {active_revenues[0]:,.2f}.",
                score=1.0,
                recommendations=[
                    "Monitor fast-selling products to avoid stockouts",
                    "Capture customer contact details for repeat engagement",
                    "Maintain marketing momentum during launch period"
                ]
            ))
        else:
            # Multi-month active trend: compare last two periods (MoM), not total-period return
            prev = active_revenues[-2]
            latest = active_revenues[-1]
            revenue_trend = (latest - prev) / prev if prev > 0 else 0.0

            if revenue_trend > 0.02:
                insights.append(BusinessInsight(
                    insight_type="Revenue Growth",
                    description=f"Month-over-month revenue growth of {revenue_trend:.1%}",
                    score=min(revenue_trend, 1.0),
                    recommendations=[
                        "Consider expanding top product lines",
                        "Invest in targeted marketing to sustain momentum",
                        "Analyze best-performing categories"
                    ]
                ))
            elif revenue_trend < -0.02:
                insights.append(BusinessInsight(
                    insight_type="Revenue Decline",
                    description=f"Month-over-month revenue decline of {abs(revenue_trend):.1%}",
                    score=max(revenue_trend, -1.0),
                    recommendations=[
                        "Review pricing and discount strategies",
                        "Analyze customer churn and foot traffic",
                        "Optimize inventory holding costs"
                    ]
                ))
            else:
                insights.append(BusinessInsight(
                    insight_type="Revenue Stability",
                    description=f"Revenue is stable month-over-month ({revenue_trend:+.1%})",
                    score=0.5,
                    recommendations=[
                        "Explore bundle offers to raise average order value",
                        "Test promotional campaigns to drive incremental growth",
                        "Focus on high-margin product upselling"
                    ]
                ))

        # 2. Customer Retention Analysis
        if data.repeat_customer_rate is not None:
            repeat_rate = float(data.repeat_customer_rate)
            total_cust = data.total_customers if data.total_customers is not None else 0
            repeat_cust = data.repeat_customers if data.repeat_customers is not None else 0

            if total_cust == 0:
                insights.append(BusinessInsight(
                    insight_type="Customer Retention",
                    description="No registered customer transactions recorded yet.",
                    score=0.0,
                    recommendations=[
                        "Encourage cashiers to register customers at POS checkout",
                        "Offer instant sign-up discounts to collect shopper contacts",
                        "Introduce customer loyalty tracking"
                    ]
                ))
            else:
                cust_detail = f" ({repeat_cust} of {total_cust} registered customers returned)" if repeat_cust and total_cust else ""
                desc = f"Repeat customer rate: {repeat_rate:.1%}{cust_detail}"
                if repeat_rate >= 0.25:
                    recommendations = [
                        "Maintain strong engagement with recurring shoppers",
                        "Introduce VIP perks or exclusive bundles for top buyers",
                        "Gather feedback from repeat customers to refine product selection"
                    ]
                else:
                    recommendations = [
                        "Implement customer loyalty incentives to drive second visits",
                        "Follow up with first-time buyers via SMS or receipt promos",
                        "Review customer service and checkout experience"
                    ]

                insights.append(BusinessInsight(
                    insight_type="Customer Retention",
                    description=desc,
                    score=min(repeat_rate, 1.0),
                    recommendations=recommendations
                ))
        else:
            # Fallback when repeat customer rate is not provided
            active_counts = [int(c) for c in data.customer_count]
            first_c_idx = next((i for i, c in enumerate(active_counts) if c > 0), None)
            if first_c_idx is not None and first_c_idx > 0:
                active_counts = active_counts[first_c_idx:]

            if not active_counts or sum(active_counts) == 0:
                insights.append(BusinessInsight(
                    insight_type="Customer Retention",
                    description="No customer activity recorded yet.",
                    score=0.0,
                    recommendations=[
                        "Register customers at POS checkout",
                        "Introduce first-purchase rewards"
                    ]
                ))
            elif len(active_counts) == 1:
                insights.append(BusinessInsight(
                    insight_type="Customer Retention",
                    description=f"Initial customer baseline: {active_counts[0]} active shoppers.",
                    score=1.0,
                    recommendations=[
                        "Incentivize first-time shoppers to return with follow-up discounts",
                        "Launch a customer loyalty points program",
                        "Collect customer feedback on product satisfaction"
                    ]
                ))
            else:
                # Compare most recent month against the prior month (not all-time peak)
                prev_count = active_counts[-2]
                retention_rate = active_counts[-1] / prev_count if prev_count > 0 else 0.0
                insights.append(BusinessInsight(
                    insight_type="Customer Retention",
                    description=f"Active customer retention: {retention_rate:.1%}",
                    score=retention_rate,
                    recommendations=[
                        "Implement customer loyalty program",
                        "Gather customer feedback",
                        "Improve customer service"
                    ]
                ))

        # 3. Cost & Operating Expense Health Analysis
        active_costs = [float(c) for c in data.costs]
        if first_rev_idx is not None and first_rev_idx > 0 and len(active_costs) >= first_rev_idx:
            active_costs = active_costs[first_rev_idx:]

        if active_revenues and active_costs and sum(active_revenues) > 0 and sum(active_costs) > 0:
            total_rev = sum(active_revenues)
            total_cost = sum(active_costs)
            cost_ratio = (total_cost / total_rev) if total_rev > 0 else 0
            if cost_ratio > 0.85:
                insights.append(BusinessInsight(
                    insight_type="High Cost Ratio",
                    description=f"Operating costs and expenses represent {cost_ratio:.1%} of revenue.",
                    score=min(cost_ratio, 1.0),
                    recommendations=[
                        "Audit top expense categories to identify reduction targets",
                        "Renegotiate supplier costs or wholesale bulk pricing",
                        "Review store utility and overhead commitments"
                    ]
                ))
            elif cost_ratio < 0.60 and total_rev > 50000:
                insights.append(BusinessInsight(
                    insight_type="Strong Operating Efficiency",
                    description=f"Operating cost ratio is lean at {cost_ratio:.1%} of revenue.",
                    score=0.9,
                    recommendations=[
                        "Maintain current operational cost discipline",
                        "Reinvest healthy cash flows into inventory expansion",
                        "Explore strategic growth channels"
                    ]
                ))

        # 4. Average Transaction Value (Basket Size) Analysis
        active_atv = [float(v) for v in data.average_transaction_value if v > 0]
        if len(active_atv) >= 2:
            atv_prev = active_atv[-2]
            atv_latest = active_atv[-1]
            atv_change = (atv_latest - atv_prev) / atv_prev if atv_prev > 0 else 0
            if atv_change > 0.05:
                insights.append(BusinessInsight(
                    insight_type="Basket Size Expansion",
                    description=f"Average transaction value grew by {atv_change:+.1%} month-over-month (now KSh {atv_latest:,.0f}).",
                    score=min(atv_change, 1.0),
                    recommendations=[
                        "Continue promoting bundled products and cross-sells",
                        "Feature top complementary items near checkout"
                    ]
                ))
            elif atv_change < -0.05:
                insights.append(BusinessInsight(
                    insight_type="Basket Size Contraction",
                    description=f"Average transaction value fell by {abs(atv_change):.1%} month-over-month (now KSh {atv_latest:,.0f}).",
                    score=max(atv_change, -1.0),
                    recommendations=[
                        "Train staff on suggestive selling and upselling techniques",
                        "Introduce minimum-spend promotions (e.g., discounts on purchases over target spend)"
                    ]
                ))

        return insights

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/customer-segments")
async def customer_segments(
    request: CustomerSegmentRequest,
    user: dict = Depends(get_current_user)
):
    if len(request.customers) < 10:
        return {
            "segments": [],
            "total_customers_analyzed": len(request.customers),
            "message": "At least 10 customers required for meaningful segmentation.",
            "algorithm": "KMeans"
        }

    service = InsightsService()
    return service.analyze_customer_segments(request.customers)


@router.post("/anomalies")
async def detect_anomalies(
    request: AnomalyRequest,
    user: dict = Depends(get_current_user)
):
    service = AnomalyDetectionService()
    return service.detect_anomalies(request.daily_data, request.contamination)


class ReturnItem(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    amount: float
    reason_code: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None


class ReturnAnalysisRequest(BaseModel):
    returns: List[ReturnItem]


@router.post("/return-insights")
async def analyze_returns(
    request: ReturnAnalysisRequest,
    user: dict = Depends(get_current_user)
):
    """
    Analyze sales returns to identify high-return products, staff refund anomalies, and return reason distributions.
    """
    try:
        import pandas as pd

        if not request.returns:
            return {
                "high_return_products": [],
                "staff_refund_anomalies": [],
                "reason_distribution": {},
                "insights": ["No returns data recorded for the selected period."]
            }

        df = pd.DataFrame([r.dict() for r in request.returns])

        # High return products by total quantity & amount
        prod_summary = df.groupby(['product_id', 'product_name']).agg(
            total_refunded_qty=('quantity', 'sum'),
            total_refunded_amount=('amount', 'sum'),
            return_count=('quantity', 'count')
        ).reset_index().sort_values(by='total_refunded_amount', ascending=False)

        high_return_products = prod_summary.head(5).to_dict(orient='records')

        # Staff refund volume (safeguarded against null staff_id)
        df['staff_id'] = df['staff_id'].fillna('unassigned')
        df['staff_name'] = df['staff_name'].fillna('Unassigned / Guest')
        staff_summary = df.groupby(['staff_id', 'staff_name'], dropna=False).agg(
            refund_count=('quantity', 'count'),
            total_amount=('amount', 'sum')
        ).reset_index().sort_values(by='total_amount', ascending=False)

        staff_refund_anomalies = staff_summary.to_dict(orient='records')

        # Reason distribution
        reason_dist = df['reason_code'].value_counts().to_dict()

        # Generated AI Insights & Recommendations
        insights_list = []
        if not prod_summary.empty:
            top_prod = prod_summary.iloc[0]
            insights_list.append(
                f"Product '{top_prod['product_name']}' has the highest return volume ({top_prod['total_refunded_qty']} units, {top_prod['total_refunded_amount']:.2f} KSh)."
            )

        if 'DEFECTIVE' in reason_dist and reason_dist['DEFECTIVE'] > 0:
            insights_list.append(f"{reason_dist['DEFECTIVE']} returns were flagged as DEFECTIVE. Inspect supplier batch quality.")

        return {
            "high_return_products": high_return_products,
            "staff_refund_anomalies": staff_refund_anomalies,
            "reason_distribution": reason_dist,
            "insights": insights_list
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
