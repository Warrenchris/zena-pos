import unittest
import asyncio
import os
from datetime import datetime, timedelta

from src.routers.forecasting import (
    stock_depletion_forecast,
    StockDepletionRequest,
    ProductForecastItem,
    MAX_FORECAST_WORKERS
)


def make_daily_sales(days_count: int, base_qty: float = 5.0):
    start = datetime(2026, 1, 1)
    return [
        {
            "date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
            "quantity": base_qty + (i % 7) * 0.5
        }
        for i in range(days_count)
    ]


class TestStockDepletionForecasting(unittest.TestCase):
    def setUp(self):
        self.mock_user = {"id": 1, "shop_id": "4", "role": "manager"}

    def test_multi_product_bounded_parallel_forecasting(self):
        """Test 1: Multiple products are forecasted concurrently with unchanged response schema."""
        products = [
            ProductForecastItem(
                product_id=f"P-{i}",
                product_name=f"Product {i}",
                current_stock=50.0 + i * 10.0,
                daily_sales=make_daily_sales(30, base_qty=5.0)
            )
            for i in range(4)
        ]

        req = StockDepletionRequest(
            products=products,
            alert_threshold_days=10
        )

        data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))

        # Contract assertions
        self.assertIn("products", data)
        self.assertIn("alerts", data)
        self.assertIn("total_products_analyzed", data)
        self.assertIn("alert_count", data)
        self.assertIn("threshold_days", data)

        self.assertEqual(data["total_products_analyzed"], 4)
        self.assertEqual(len(data["products"]), 4)
        self.assertEqual(data["threshold_days"], 10)

        # Check product items
        for p in data["products"]:
            self.assertIn("product_id", p)
            self.assertIn("product_name", p)
            self.assertIn("current_stock", p)
            self.assertIn("days_until_depletion", p)
            self.assertIn("alert", p)
            self.assertIn("algorithm", p)
            self.assertEqual(p["algorithm"], "prophet")

    def test_sparse_history_uses_linear_extrapolation(self):
        """Test 2: Products with < 14 sales points use fast linear extrapolation."""
        req = StockDepletionRequest(
            products=[
                ProductForecastItem(
                    product_id="P-SPARSE",
                    product_name="Sparse Product",
                    current_stock=20.0,
                    daily_sales=make_daily_sales(5, base_qty=2.0)  # only 5 days
                )
            ],
            alert_threshold_days=15
        )

        data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))
        self.assertEqual(len(data["products"]), 1)
        item = data["products"][0]
        self.assertEqual(item["algorithm"], "linear_extrapolation")
        self.assertEqual(item["confidence"], "low")
        self.assertIsNotNone(item["days_until_depletion"])

    def test_partial_model_failure_graceful_fallback(self):
        """Test 3: An individual product failure does not fail the whole request."""
        req = StockDepletionRequest(
            products=[
                ProductForecastItem(
                    product_id="P-VALID",
                    product_name="Valid Product",
                    current_stock=50.0,
                    daily_sales=make_daily_sales(25)
                ),
                ProductForecastItem(
                    product_id="P-INVALID",
                    product_name="Invalid Product",
                    current_stock=50.0,
                    daily_sales=[{"date": "not-a-date", "quantity": "invalid"}] * 15
                )
            ],
            alert_threshold_days=7
        )

        data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))
        self.assertEqual(len(data["products"]), 2)

        p_valid = next(p for p in data["products"] if p["product_id"] == "P-VALID")
        p_invalid = next(p for p in data["products"] if p["product_id"] == "P-INVALID")

        # Valid product succeeds without error warning
        self.assertIn(p_valid["algorithm"], ["prophet", "linear_extrapolation"])
        self.assertNotIn("warning", p_valid)
        # Invalid product fell back gracefully to linear extrapolation with a recorded warning
        self.assertEqual(p_invalid["algorithm"], "linear_extrapolation")
        self.assertIn("warning", p_invalid)

    def test_time_budget_fallback_when_exceeded(self):
        """Test 4: When request time budget is exceeded, products fall back gracefully."""
        from unittest.mock import patch
        req = StockDepletionRequest(
            products=[
                ProductForecastItem(
                    product_id="P-SLOW",
                    product_name="Slow Product",
                    current_stock=100.0,
                    daily_sales=make_daily_sales(20)
                )
            ],
            alert_threshold_days=7
        )
        # Force a 0.0s budget to trigger timeout fallback immediately
        with patch("src.routers.forecasting.DEFAULT_DEPLETION_BUDGET_SECONDS", 0.0):
            data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))
            self.assertEqual(len(data["products"]), 1)
            p = data["products"][0]
            self.assertEqual(p["algorithm"], "linear_extrapolation")
            self.assertEqual(p.get("fallback_reason"), "time_budget_exceeded")

    def test_empty_products_list_handled_cleanly(self):
        """Test 5: Empty product list returns clean empty structure."""
        req = StockDepletionRequest(products=[], alert_threshold_days=7)
        data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))
        self.assertEqual(data["products"], [])
        self.assertEqual(data["total_products_analyzed"], 0)
        self.assertEqual(data["alert_count"], 0)

    def test_global_executor_shared_across_requests(self):
        """Test 6: Module-level _DEPLETION_EXECUTOR is shared and bounded."""
        from src.routers.forecasting import _DEPLETION_EXECUTOR
        self.assertLessEqual(_DEPLETION_EXECUTOR._max_workers, 4)
        self.assertGreaterEqual(_DEPLETION_EXECUTOR._max_workers, 1)

    def test_budget_exhaustion_does_not_block_executor(self):
        """Test 7: When budget expires, handler returns immediately without blocking on running futures."""
        import time
        from unittest.mock import patch

        def slow_fit(product, alert_threshold_days, deadline=None):
            time.sleep(2.0)
            return {"product_id": product.product_id, "algorithm": "slow"}

        req = StockDepletionRequest(
            products=[
                ProductForecastItem(
                    product_id="P-STALL",
                    product_name="Stall Product",
                    current_stock=100.0,
                    daily_sales=make_daily_sales(20)
                )
            ],
            alert_threshold_days=7
        )

        t0 = time.time()
        with patch("src.routers.forecasting._fit_single_prophet_product", side_effect=slow_fit):
            with patch("src.routers.forecasting.DEFAULT_DEPLETION_BUDGET_SECONDS", 0.05):
                data = asyncio.run(stock_depletion_forecast(req, user=self.mock_user))

        elapsed = time.time() - t0
        # Handler must return quickly (~0.05-0.5s), NOT block for the full 2.0s!
        self.assertLess(elapsed, 1.2)
        self.assertEqual(len(data["products"]), 1)
        self.assertEqual(data["products"][0]["algorithm"], "linear_extrapolation")
        self.assertEqual(data["products"][0]["fallback_reason"], "time_budget_exceeded")

    def test_concurrent_requests_share_bounded_executor(self):
        """Test 8: Multiple concurrent requests execute safely across shared thread pool."""
        async def run_concurrent():
            req1 = StockDepletionRequest(
                products=[
                    ProductForecastItem(
                        product_id=f"P-C1-{i}",
                        product_name=f"C1 Product {i}",
                        current_stock=50.0,
                        daily_sales=make_daily_sales(5) # sparse -> immediate linear
                    ) for i in range(3)
                ],
                alert_threshold_days=7
            )
            req2 = StockDepletionRequest(
                products=[
                    ProductForecastItem(
                        product_id=f"P-C2-{i}",
                        product_name=f"C2 Product {i}",
                        current_stock=40.0,
                        daily_sales=make_daily_sales(5)
                    ) for i in range(3)
                ],
                alert_threshold_days=7
            )
            return await asyncio.gather(
                stock_depletion_forecast(req1, user=self.mock_user),
                stock_depletion_forecast(req2, user=self.mock_user)
            )

        res1, res2 = asyncio.run(run_concurrent())
        self.assertEqual(len(res1["products"]), 3)
        self.assertEqual(len(res2["products"]), 3)
        self.assertEqual(res1["threshold_days"], 7)
        self.assertEqual(res2["threshold_days"], 7)


if __name__ == '__main__':
    unittest.main()
