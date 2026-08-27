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
 *
 * All sections are composed from isolated landing components.
 * No POS business logic is imported or executed.
 */

/* ── Mini mockup panels used inside Feature Story sections ── */
function SalesMockup() {
  return (
    <ProductScreenshot>
      <div className="flex h-[280px] md:h-[340px] w-full bg-surface overflow-hidden">
        {/* POS-style checkout panel */}
        <div className="flex-1 flex flex-col p-4 md:p-5">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default bg-surface-2 mb-4">
            <div className="w-4 h-4 rounded-full bg-border-default" />
            <div className="h-3 w-32 bg-border-default rounded-full" />
          </div>
          {/* Product rows */}
          <div className="flex-1 space-y-3">
            {[0.8, 0.6, 0.7, 0.5].map((w, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-surface-3" />
                  <div className="space-y-1.5">
                    <div className="h-2.5 rounded-full bg-border-default" style={{ width: `${w * 120}px` }} />
                    <div className="h-2 w-12 rounded-full bg-border-default/50" />
                  </div>
                </div>
                <div className="h-3 w-14 rounded-full bg-surface-3" />
              </div>
            ))}
          </div>
          {/* Total bar */}
          <div className="flex items-center justify-between pt-3 mt-auto border-t border-border-default">
            <div className="h-4 w-16 rounded bg-border-default" />
            <div className="h-4 w-20 rounded bg-primary/30" />
          </div>
        </div>
        {/* Right cart summary (hidden on very small) */}
        <div className="hidden sm:flex flex-col w-44 border-l border-border-default bg-surface-2 p-4">
          <div className="h-4 w-16 rounded bg-surface-3 mb-4" />
          <div className="flex-1 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-2.5 w-16 rounded-full bg-border-default" />
                <div className="h-2.5 w-8 rounded-full bg-border-default/60" />
              </div>
            ))}
          </div>
          <div className="mt-auto">
            <div className="h-8 w-full rounded-lg bg-primary/20" />
          </div>
        </div>
      </div>
    </ProductScreenshot>
  );
}

function InventoryMockup() {
  return (
    <ProductScreenshot>
      <div className="flex flex-col h-[280px] md:h-[340px] w-full bg-surface overflow-hidden p-4 md:p-5">
        {/* Header with tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 rounded bg-surface-3" />
          <div className="flex gap-2">
            <div className="h-7 w-16 rounded-lg bg-primary/15" />
            <div className="h-7 w-16 rounded-lg bg-surface-2" />
          </div>
        </div>
        {/* Table header */}
        <div className="grid grid-cols-4 gap-4 px-3 py-2 bg-surface-2 rounded-lg mb-2">
          {['w-20', 'w-16', 'w-12', 'w-14'].map((w, i) => (
            <div key={i} className={`h-2.5 ${w} rounded-full bg-border-default`} />
          ))}
        </div>
        {/* Table rows */}
        <div className="flex-1 space-y-1">
          {[
            { status: 'bg-green-500', widths: ['w-24', 'w-12', 'w-10', 'w-14'] },
            { status: 'bg-green-500', widths: ['w-20', 'w-14', 'w-8', 'w-12'] },
            { status: 'bg-amber-500', widths: ['w-28', 'w-10', 'w-6', 'w-16'] },
            { status: 'bg-green-500', widths: ['w-16', 'w-12', 'w-12', 'w-10'] },
            { status: 'bg-red-500', widths: ['w-22', 'w-8', 'w-4', 'w-14'] },
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 px-3 py-2.5 border-b border-border-default items-center">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${row.status}`} />
                <div className={`h-2.5 ${row.widths[0]} rounded-full bg-border-default`} />
              </div>
              {row.widths.slice(1).map((w, j) => (
                <div key={j} className={`h-2.5 ${w} rounded-full bg-border-default/60`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </ProductScreenshot>
  );
}

function ReportsMockup() {
  return (
    <ProductScreenshot>
      <div className="flex flex-col h-[280px] md:h-[340px] w-full bg-surface overflow-hidden p-4 md:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="h-5 w-24 rounded bg-surface-3" />
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-lg bg-surface-2 border border-border-default" />
            <div className="h-7 w-7 rounded-lg bg-surface-2 border border-border-default" />
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {['bg-green-500/20', 'bg-blue-500/20', 'bg-amber-500/20'].map((bg, i) => (
            <div key={i} className={`${bg} rounded-xl p-3`}>
              <div className="h-2 w-10 rounded-full bg-border-default/60 mb-2" />
              <div className="h-4 w-16 rounded bg-border-default" />
            </div>
          ))}
        </div>
        {/* Line chart area */}
        <div className="flex-1 rounded-xl border border-border-default p-4 relative overflow-hidden">
          <svg viewBox="0 0 300 80" className="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M0 60 Q30 50 60 55 T120 35 T180 40 T240 20 T300 25"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              opacity="0.6"
            />
            <path
              d="M0 60 Q30 50 60 55 T120 35 T180 40 T240 20 T300 25 V80 H0 Z"
              fill="var(--color-primary)"
              opacity="0.06"
            />
          </svg>
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

        {/* Trust: Social proof through industry relevance */}
        <LandingTrustStrip />

        {/* Features: Product capabilities overview */}
        <LandingFeatureOverview />

        {/* Sales Story: Editorial product section */}
        <LandingFeatureStory
          eyebrow="Sales"
          heading="Sell faster."
          description="Your checkout should never slow your business down. Zana POS makes selling fast, straightforward, and reliable."
          features={[
            'Fast product search and barcode scanning',
            'Simple cart management with discounts',
            'Multiple payment methods including M-Pesa',
            'Instant receipt generation',
            'Complete sales history and tracking',
          ]}
          visual={<SalesMockup />}
          className="bg-surface"
        />

        {/* Inventory Story: Alternating layout */}
        <LandingFeatureStory
          eyebrow="Inventory"
          heading="Know what's on your shelves."
          description="Real-time visibility into every product, every location. No guesswork, no surprises."
          features={[
            'Live stock levels and movement tracking',
            'Low-stock alerts and notifications',
            'Automated inventory updates on sales and receivings',
            'Stock adjustments and inter-location transfers',
            'Supplier purchase integration',
          ]}
          visual={<InventoryMockup />}
          reversed
          className="bg-app"
        />

        {/* Intelligence Story */}
        <LandingFeatureStory
          eyebrow="Reports & Intelligence"
          heading={<>Stop guessing.<br />Start knowing.</>}
          description="Turn your operational data into useful business insights. Understand what's working, what needs attention, and where to focus."
          features={[
            'Sales performance and trend reports',
            'Inventory health and valuation',
            'Expense tracking and cash flow visibility',
            'Export to Excel and PDF',
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
