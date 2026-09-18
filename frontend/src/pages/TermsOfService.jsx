import React from 'react';
import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import LandingFooter from '../components/landing/LandingFooter';
import Container from '../components/landing/shared/Container';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-app text-text-primary font-sans antialiased">
      <LandingNavbar />

      <main className="pt-32 pb-24">
        <Container>
          <div className="max-w-3xl mx-auto bg-surface border border-border-default rounded-2xl p-8 md:p-12 shadow-sm">
            <div className="border-b border-border-default pb-6 mb-8">
              <span className="text-caption font-semibold uppercase tracking-widest text-primary block mb-2">
                Legal Documentation
              </span>
              <h1 className="text-display font-bold text-text-primary tracking-tight">
                Terms of Service
              </h1>
              <p className="text-small text-text-muted mt-2">
                Last updated: September 2026 · Effective immediately for all registered merchants
              </p>
            </div>

            <div className="prose prose-stone max-w-none space-y-6 text-body text-text-secondary leading-relaxed">
              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">1. Agreement to Terms</h2>
                <p>
                  These Terms of Service constitute a legally binding agreement between you (whether personally or on behalf of an entity, "Merchant", "you") and Zana POS ("we", "us", or "our"), concerning your access to and use of the Zana POS web application, cloud APIs, and related point-of-sale services.
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">2. Subscriptions &amp; Billing Cycles</h2>
                <p>
                  Zana POS services are made available on a subscription basis (Starter, Growth, Pro tiers). Subscriptions are billed in advance on a recurring monthly or annual basis via supported payment rails (including Safaricom M-Pesa STK push, credit/debit cards, and direct bank transfers).
                </p>
                <ul className="list-disc pl-5 space-y-1.5 mt-2">
                  <li><strong>Free Trial:</strong> New organizations receive a 14-day evaluation trial without payment requirement.</li>
                  <li><strong>Plan Quotas:</strong> Each subscription tier enforces maximum physical branch counts and staff user seat quotas. Exceeding tier quotas requires an immediate upgrade or branch decommission.</li>
                  <li><strong>Automatic Renewal:</strong> Unless canceled prior to the end of the current billing cycle, your subscription will automatically renew.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">3. Merchant Data &amp; Confidentiality</h2>
                <p>
                  You retain complete and exclusive ownership of all inventory records, transaction receipts, customer ledgers, and financial reports processed through your Zana POS organization tenant. Zana POS will never sell, lease, or monetize your proprietary sales figures or customer identities.
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">4. Service Availability &amp; Offline Continuity</h2>
                <p>
                  We target a 99.9% cloud service uptime availability. The Zana POS cashier terminal includes local caching designed to facilitate transaction recording during transient network connectivity interruptions. Transactions cached offline are automatically committed to the central cloud database once network access is restored.
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">5. Termination &amp; Cancellation</h2>
                <p>
                  You may cancel your subscription at any time through the Billing &amp; Subscription management portal. Cancellation becomes effective at the conclusion of your current paid billing period, during which you will retain full operational access to your account and historical data exports.
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">6. Contact Information</h2>
                <p>
                  For inquiries regarding these Terms of Service, reach out to our legal and merchant compliance team at{' '}
                  <a href="mailto:support@zanapos.com" className="text-primary font-medium underline">
                    support@zanapos.com
                  </a>.
                </p>
              </section>
            </div>

            <div className="mt-10 pt-6 border-t border-border-default flex items-center justify-between">
              <Link
                to="/"
                className="text-small font-semibold text-primary hover:underline"
              >
                ← Return to Home
              </Link>
              <Link
                to="/privacy"
                className="text-small font-semibold text-text-secondary hover:text-text-primary"
              >
                View Privacy Policy →
              </Link>
            </div>
          </div>
        </Container>
      </main>

      <LandingFooter />
    </div>
  );
}
