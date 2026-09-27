import React from 'react';
import LandingNavbar from './LandingNavbar';
import LandingHero from './LandingHero';
import LandingTrustStrip from './LandingTrustStrip';
import LandingFeatureOverview from './LandingFeatureOverview';
import LandingFeatureStory from './LandingFeatureStory';
import LandingBusinessTypes from './LandingBusinessTypes';
import LandingSpeedSection from './LandingSpeedSection';
import LandingDarkShowcase from './LandingDarkShowcase';
import LandingHowItWorks from './LandingHowItWorks';
import LandingPricing from './LandingPricing';
import LandingFAQ from './LandingFAQ';
import LandingFinalCTA from './LandingFinalCTA';
import LandingFooter from './LandingFooter';
import ProductScreenshot from './shared/ProductScreenshot';

/**
 * LandingPage — Main orchestrator for the Zana POS public landing page.
 *
 * Narrative flow:
 * Problem → Possibility → Product → Proof → Capability → Confidence → Action
 */

/* ── Real Application Screenshots for Feature Stories ── */
function SalesMockup() {
  const floatingMetrics = [
    { label: 'Instant M-Pesa', value: 'STK push automated', top: '10%', right: '-4%' },
    { label: 'Fast Checkout', value: 'Ready for barcode & till', bottom: '12%', left: '-4%' },
  ];

  return (
    <ProductScreenshot
      src="/screenshots/pos-terminal.png"
      alt="Zana POS Point of Sale Terminal with active cart, barcode scanner, and M-Pesa integration"
      floatingMetrics={floatingMetrics}
    />
  );
}

function InventoryMockup() {
  const floatingMetrics = [
    { label: 'Live Stock Tracking', value: 'Multi-category catalog', top: '10%', right: '-4%' },
    { label: 'Low Stock Safeguard', value: 'Automated reorder ready', bottom: '12%', left: '-4%' },
  ];

  return (
    <ProductScreenshot
      src="/screenshots/inventory.png"
      alt="Zana POS Inventory and Products catalog with real-time stock levels and low-stock alerts"
      floatingMetrics={floatingMetrics}
    />
  );
}

function ReportsMockup() {
  const floatingMetrics = [
    { label: 'Audit Trail', value: '100% Tax & receipt verified', top: '10%', right: '-4%' },
    { label: 'Export Formats', value: 'PDF & Excel ready', bottom: '12%', left: '-4%' },
  ];

  return (
    <ProductScreenshot
      src="/screenshots/analytics.png"
      alt="Zana POS Invoices, Sales History and Business Analytics reporting ledger"
      floatingMetrics={floatingMetrics}
    />
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-app text-text-primary font-sans antialiased selection:bg-primary/10 selection:text-primary">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-floating focus:outline-none"
      >
        Skip to main content
      </a>

      <LandingNavbar />

      <main id="main-content">
        {/* Hero: Problem → Possibility */}
        <LandingHero />

        {/* Trust: Social proof & verifiable platform metrics */}
        <LandingTrustStrip />

        {/* Features: Product capabilities overview */}
        <LandingFeatureOverview />

        {/* Sales Story: Editorial product section */}
        <LandingFeatureStory
          id="sales"
          eyebrow="Point of Sale"
          heading="Sell faster."
          description="Your checkout should never slow your business down. Zana POS makes selling fast, straightforward, and reliable with barcode scanning and instant M-Pesa STK push."
          features={[
            'Fast product search and USB/Bluetooth barcode scanning',
            'Instant Safaricom M-Pesa STK Push direct to customer phone',
            'Automatic receipt generation on thermal ESC/POS printers',
            'Split payments between Cash, M-Pesa, and Cards',
            'Seamless offline sales caching when internet flickers',
          ]}
          visual={<SalesMockup />}
          className="bg-surface"
        />

        {/* Inventory Story: Alternating layout */}
        <LandingFeatureStory
          id="inventory"
          eyebrow="Inventory & Stock"
          heading="Know what's on your shelves."
          description="Real-time visibility into every product across every branch. Prevent stockouts, track batch expirations, and transfer stock with total confidence."
          features={[
            'Live stock counts synchronized across all store branches',
            'Automated low-stock notifications and supplier purchase orders',
            'Inter-branch stock transfers and warehouse reconciliations',
            'Barcode & QR label generation for quick shelf labeling',
            'Expiry date monitoring and loss reduction tracking',
          ]}
          visual={<InventoryMockup />}
          reversed
          className="bg-app"
        />

        {/* Intelligence Story */}
        <LandingFeatureStory
          id="intelligence"
          eyebrow="AI Insights & Analytics"
          heading={<>Stop guessing.<br />Start knowing.</>}
          description="Turn everyday sales records into predictive intelligence. Leverage built-in AI models to forecast sales demand, optimize profit margins, and cut dead stock."
          features={[
            'AI-powered demand forecasting and restock recommendations',
            'Gross margin profitability analysis by category and branch',
            'Daily, weekly, and monthly consolidated financial summaries',
            'Customer ledger, debt tracking, and credit limits',
            'One-click export to Excel, CSV, and official audit PDF',
          ]}
          visual={<ReportsMockup />}
          className="bg-surface"
        />

        {/* Business Types */}
        <LandingBusinessTypes />

        {/* Speed */}
        <LandingSpeedSection />

        {/* Dark Showcase */}
        <LandingDarkShowcase />

        {/* How It Works */}
        <LandingHowItWorks />

        {/* Pricing */}
        <LandingPricing />

        {/* FAQ */}
        <LandingFAQ />

        {/* Final CTA */}
        <LandingFinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
