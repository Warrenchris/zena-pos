import unittest
import numpy as np
import pandas as pd
import tempfile
import os

from src.models.financial_models import ExpenseAnalysisModel, FinancialForecastModel


class TestExpenseAnalysisModel(unittest.TestCase):
    def setUp(self):
        # Create a realistic historical expense dataset
        dates = pd.date_range(start='2026-01-01', periods=30, freq='D')
        categories = ['utilities', 'rent', 'supplies', 'payroll', 'marketing'] * 6
        amounts = [150.0 + (i % 5) * 50.0 + (i % 3) * 10.0 for i in range(30)]
        self.df = pd.DataFrame({
            'date': dates,
            'category': categories,
            'amount': amounts
        })

    def test_target_absent_from_feature_matrix(self):
        """Verify target 'amount' is strictly EXCLUDED from the feature matrix X."""
        model = ExpenseAnalysisModel()
        X, y = model.prepare_features(self.df, is_training=True)

        # X must NOT contain amount
        self.assertNotIn('amount', model.feature_names_)
        # Feature names should be calendar features + one-hot categories
        expected_prefixes = ('month', 'day', 'day_of_week', 'quarter', 'cat_')
        for feat in model.feature_names_:
            self.assertTrue(feat.startswith(expected_prefixes), f"Unexpected feature: {feat}")
        # Target y must match amount column
        self.assertEqual(len(y), len(self.df))
        np.testing.assert_array_equal(y, self.df['amount'].values)

    def test_feature_schema_consistency_train_and_inference(self):
        """Verify feature columns remain identical between training and subsequent inference."""
        model = ExpenseAnalysisModel()
        X_train, _ = model.prepare_features(self.df, is_training=True)

        # New inference data with a subset of categories plus an unseen category
        new_df = pd.DataFrame({
            'date': pd.date_range(start='2026-02-01', periods=5, freq='D'),
            'category': ['utilities', 'rent', 'unseen_cat', 'supplies', 'rent']
        })

        X_inf, y_inf = model.prepare_features(new_df, is_training=False)

        # y_inf must be None since 'amount' is absent in prediction data
        self.assertIsNone(y_inf)
        # Number of feature columns in inference must exactly equal training columns
        self.assertEqual(X_train.shape[1], X_inf.shape[1])
        self.assertEqual(X_inf.shape[0], 5)

    def test_training_and_baseline_evaluation(self):
        """Verify training evaluates model against a naive category-mean baseline."""
        model = ExpenseAnalysisModel()
        metrics = model.train(self.df)

        # Must report train score, test score, mae, rmse, wape, baseline_mae, baseline_wape
        self.assertIn("train_score", metrics)
        self.assertIn("test_score", metrics)
        self.assertIn("mae", metrics)
        self.assertIn("rmse", metrics)
        self.assertIn("wape", metrics)
        self.assertIn("baseline_mae", metrics)
        self.assertIn("baseline_wape", metrics)

        # None of the error metrics should be None for this 30-sample dataset
        self.assertIsNotNone(metrics["mae"])
        self.assertIsNotNone(metrics["wape"])
        self.assertIsNotNone(metrics["baseline_mae"])
        self.assertGreater(metrics["mae"], 0.0)

    def test_predict_outputs_non_negative_values(self):
        """Verify predict returns valid non-negative floats."""
        model = ExpenseAnalysisModel()
        model.train(self.df)

        test_data = pd.DataFrame({
            'date': ['2026-03-01', '2026-03-02'],
            'category': ['rent', 'marketing']
        })
        preds = model.predict(test_data)
        self.assertEqual(len(preds), 2)
        self.assertTrue(all(p >= 0.0 for p in preds))

    def test_graceful_handling_of_invalid_or_sparse_data(self):
        """Verify small, empty, or malformed datasets fail gracefully with descriptive ValueErrors."""
        model = ExpenseAnalysisModel()

        # Empty DataFrame
        with self.assertRaises(ValueError):
            model.train(pd.DataFrame())

        # Missing required columns
        with self.assertRaises(ValueError):
            model.train(pd.DataFrame({'date': ['2026-01-01'], 'amount': [100]}))

        # Too few samples (< 5)
        sparse_df = pd.DataFrame({
            'date': ['2026-01-01', '2026-01-02'],
            'category': ['rent', 'rent'],
            'amount': [100, 200]
        })
        with self.assertRaises(ValueError):
            model.train(sparse_df)

    def test_model_save_and_load(self):
        """Verify model persistence round-trip."""
        model = ExpenseAnalysisModel()
        model.train(self.df)

        test_df = pd.DataFrame({
            'date': ['2026-03-01'],
            'category': ['supplies']
        })
        pred_original = model.predict(test_df)

        with tempfile.NamedTemporaryFile(suffix='.joblib', delete=False) as tmp:
            tmp_path = tmp.name

        try:
            model.save_model(tmp_path)
            loaded_model = ExpenseAnalysisModel.load_model(tmp_path)
            pred_loaded = loaded_model.predict(test_df)
            np.testing.assert_allclose(pred_original, pred_loaded)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


class TestFinancialForecastModelWape(unittest.TestCase):
    def test_wape_and_baseline_calculation(self):
        """Verify WAPE and baseline_mae are computed in FinancialForecastModel.evaluate."""
        model = FinancialForecastModel()
        # Mock simple predictions
        X_test = np.zeros((5, len(model.prepare_features.__doc__ or ''))).reshape(5, -1)
        y_test = np.array([10.0, 20.0, 0.0, 30.0, 40.0]) # sum = 100.0

        # Create a mock predictor
        class MockModel:
            def predict(self, X):
                return np.array([12.0, 18.0, 5.0, 28.0, 42.0]) # abs diffs: 2, 2, 5, 2, 2 = sum 13

        model.model = MockModel()
        metrics = model.evaluate(X_test, y_test)

        self.assertIn('wape', metrics)
        self.assertIn('baseline_mae', metrics)
        self.assertIn('baseline_wape', metrics)
        # Total absolute error = 13, sum actual = 100 => WAPE = 13.0%
        self.assertEqual(metrics['wape'], 13.0)
        self.assertIsNotNone(metrics['baseline_mae'])


if __name__ == '__main__':
    unittest.main()
