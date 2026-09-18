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

/* ── Realistic Mockup Panels for Feature Stories ── */
function SalesMockup() {
  return (
    <ProductScreenshot>
      <div className="flex h-[320px] md:h-[360px] w-full bg-surface overflow-hidden text-xs">
        {/* POS-style checkout panel */}
        <div className="flex-1 flex flex-col p-4 md:p-5">
          {/* Search bar */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border-default bg-surface-2 mb-3">
            <div className="flex items-center gap-2 text-text-muted">
              <span className="w-3.5 h-3.5 rounded-full border border-text-muted flex items-center justify-center text-[10px]">
                ⌕
              </span>
              <span className="text-caption">Scan barcode or search...</span>
            </div>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-medium">
              F2 Scan
            </span>
          </div>

          {/* Product rows */}
          <div className="flex-1 space-y-2 overflow-hidden">
            {[
              { name: 'Brookside Fresh Milk 500ml', qty: 'x2', price: 'KES 130', time: 'Fast pick' },
              { name: 'Unga Jogoo Maize Flour 2kg', qty: 'x1', price: 'KES 195', time: 'In stock' },
              { name: 'Golden Cooking Oil 2L', qty: 'x1', price: 'KES 620', time: 'In stock' },
              { name: 'Dawaat Basmati Rice 2kg', qty: 'x1', price: 'KES 380', time: 'Promo -5%' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-border-default/60 bg-surface-2/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded bg-primary/10 text-primary font-bold flex items-center justify-center text-[11px]">
                    {item.qty}
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary text-[12px]">{item.name}</div>
                    <div className="text-[10px] text-text-muted">{item.time}</div>
                  </div>
                </div>
                <div className="font-bold text-text-primary text-[12px]">{item.price}</div>
              </div>
            ))}
          </div>

          {/* Total & Instant M-Pesa Bar */}
          <div className="pt-3 mt-auto border-t border-border-default flex items-center justify-between">
            <div>
              <span className="text-caption text-text-muted">Total (4 Items)</span>
              <div className="text-h3 font-extrabold text-text-primary">KES 1,325</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1">
                <span>✓ M-Pesa STK Sent</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right quick numpad / tender summary */}
        <div className="hidden sm:flex flex-col w-40 border-l border-border-default bg-surface-2 p-4 justify-between">
          <div>
            <div className="text-caption font-bold text-text-primary uppercase tracking-wider mb-2">Tender</div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between py-1 border-b border-border-default">
                <span className="text-text-muted">Subtotal</span>
                <span className="font-medium">KES 1,325</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-default">
                <span className="text-text-muted">VAT (16%)</span>
                <span className="font-medium">Included</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-text-primary">
                <span>Change</span>
                <span>KES 0.00</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2 rounded-lg bg-surface border border-border-default text-center">
            <span className="text-[10px] text-text-muted block">Receipt Mode</span>
            <span className="font-bold text-primary text-[11px]">Thermal ESC/POS</span>
          </div>
        </div>
      </div>
    </ProductScreenshot>
  );
}

function InventoryMockup() {
  return (
    <ProductScreenshot>
      <div className="flex flex-col h-[320px] md:h-[360px] w-full bg-surface overflow-hidden p-4 md:p-5 text-xs">
        {/* Header with tabs */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-small font-bold text-text-primary">Live Inventory Matrix</span>
            <span className="text-[11px] text-text-muted block">Multi-location stock balancing</span>
          </div>
          <div className="flex gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold text-[11px]">
              Central Store
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-text-secondary text-[11px]">
              Branch #2
            </span>
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-5 gap-2 px-3 py-2 bg-surface-2 rounded-lg font-bold text-text-muted text-[11px] mb-1">
          <div className="col-span-2">Product Name</div>
          <div>In Stock</div>
          <div>Alert Min</div>
          <div className="text-right">Action</div>
        </div>

        {/* Table rows */}
        <div className="flex-1 space-y-1 overflow-hidden">
          {[
            { name: 'Unga Jogoo Maize 2kg', stock: '148 pkts', alert: '20 pkts', status: 'Optimal', color: 'text-emerald-600 bg-emerald-500/10' },
            { name: 'Brookside Milk 500ml', stock: '34 crates', alert: '10 crates', status: 'Optimal', color: 'text-emerald-600 bg-emerald-500/10' },
            { name: 'Top Fry Oil 3L', stock: '6 bottles', alert: '15 bottles', status: 'Low Stock', color: 'text-amber-600 bg-amber-500/10' },
            { name: 'White Cap Lager 500ml', stock: '0 crates', alert: '5 crates', status: 'Out of Stock', color: 'text-red-600 bg-red-500/10' },
            { name: 'Dawaat Basmati 5kg', stock: '52 pkts', alert: '12 pkts', status: 'Optimal', color: 'text-emerald-600 bg-emerald-500/10' },
          ].map((item, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 px-3 py-2 border-b border-border-default/60 items-center text-[12px]">
              <div className="col-span-2 font-semibold text-text-primary truncate">{item.name}</div>
              <div className="font-medium text-text-secondary">{item.stock}</div>
              <div className="text-text-muted">{item.alert}</div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.color}`}>
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 mt-auto border-t border-border-default flex items-center justify-between text-caption text-text-muted">
          <span>Automated PO triggers when min reached</span>
          <span className="text-primary font-medium hover:underline cursor-pointer">Transfer to Branch #2 →</span>
        </div>
      </div>
    </ProductScreenshot>
  );
}

function ReportsMockup() {
  return (
    <ProductScreenshot>
      <div className="flex flex-col h-[320px] md:h-[360px] w-full bg-surface overflow-hidden p-4 md:p-5 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-small font-bold text-text-primary">AI Demand &amp; Margin Forecast</span>
            <span className="text-[11px] text-text-muted block">Next 7 days projected inventory demand</span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold text-[11px] flex items-center gap-1">
            ✦ AI Engine Active
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-surface-2 border border-border-default">
            <span className="text-[10px] text-text-muted block uppercase tracking-wider font-semibold">Predicted Sales</span>
            <span className="text-small font-extrabold text-text-primary">KES 840,000</span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">↑ 14% vs last week</span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-2 border border-border-default">
            <span className="text-[10px] text-text-muted block uppercase tracking-wider font-semibold">Est. Gross Margin</span>
            <span className="text-small font-extrabold text-text-primary">31.8%</span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">+2.1% optimized</span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-2 border border-border-default">
            <span className="text-[10px] text-text-muted block uppercase tracking-wider font-semibold">Reorder Alerts</span>
            <span className="text-small font-extrabold text-amber-600">3 Priority</span>
            <span className="text-[10px] text-text-muted block mt-0.5">Automated PO ready</span>
          </div>
        </div>

        {/* Chart area */}
        <div className="flex-1 rounded-xl border border-border-default p-3 bg-surface-2/30 relative flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
            <span>Forecast Curve vs Actual Sales</span>
            <span className="text-emerald-600 font-semibold">96.4% Accuracy</span>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <svg viewBox="0 0 300 70" className="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M0 55 Q35 45 70 50 T140 25 T210 30 T280 12 T300 15"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2.5"
              />
              <path
                d="M0 55 Q35 45 70 50 T140 25 T210 30 T280 12 T300 15 V70 H0 Z"
                fill="var(--color-primary)"
                opacity="0.08"
              />
            </svg>
          </div>

          <div className="flex justify-between text-[10px] text-text-muted pt-1 border-t border-border-default/60">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun (Projected)</span>
          </div>
        </div>
      </div>
    </ProductScreenshot>
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
