import React from 'react';
import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import LandingFooter from '../components/landing/LandingFooter';
import Container from '../components/landing/shared/Container';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-app text-text-primary font-sans antialiased">
      <LandingNavbar />

      <main className="pt-32 pb-24">
        <Container>
          <div className="max-w-3xl mx-auto bg-surface border border-border-default rounded-2xl p-8 md:p-12 shadow-sm">
            <div className="border-b border-border-default pb-6 mb-8">
              <span className="text-caption font-semibold uppercase tracking-widest text-primary block mb-2">
                Legal &amp; Privacy
              </span>
              <h1 className="text-display font-bold text-text-primary tracking-tight">
                Privacy Policy
              </h1>
              <p className="text-small text-text-muted mt-2">
                Last updated: September 2026 · Committed to robust data protection for African merchants
              </p>
            </div>

            <div className="prose prose-stone max-w-none space-y-6 text-body text-text-secondary leading-relaxed">
              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">1. Information We Collect</h2>
                <p>
                  To provide, secure, and maintain point of sale and inventory management services, Zana POS collects:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 mt-2">
                  <li><strong>Account Registration Details:</strong> Business name, administrator full name, email address, phone number, and physical store branch addresses.</li>
                  <li><strong>Operational Records:</strong> Stock catalog items, barcode serials, purchase orders, sales transactions, receipts, customer contact info for loyalty tracking, and expense entries.</li>
                  <li><strong>Payment Reconciliation Data:</strong> M-Pesa transaction reference IDs, phone numbers used for STK Push prompt requests, and payment settlement statuses. We do NOT store debit/credit card CVVs or bank credentials.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">2. How We Protect Your Data</h2>
                <p>
                  Your business records are protected by industry-standard security architectures:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 mt-2">
                  <li><strong>Tenant Isolation:</strong> Multi-tenant database partitioning ensures no organization can access another merchant's operational or customer data.</li>
                  <li><strong>Cryptographic Security:</strong> All API authentication utilizes asymmetric RS256 JWT tokens with automatic key rotation and strict token revocation.</li>
                  <li><strong>Transport Layer Security:</strong> All traffic between POS clients and cloud servers is encrypted using modern TLS 1.3 encryption.</li>
                  <li><strong>Automated Backups:</strong> Point-in-time database backups safeguard against hardware failure or accidental data loss.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">3. Sharing of Information</h2>
                <p>
                  Zana POS does not sell, rent, or trade merchant personal or transaction data to third-party advertisers. Information is only transferred to verified infrastructural sub-processors necessary to provide our core services (such as cloud hosting facilities and telecom SMS/M-Pesa payment gateways).
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">4. Merchant Data Rights</h2>
                <p>
                  You have the right to request a full structured export of all inventory, sales, customer, and accounting records at any time via CSV or Excel format. Upon account termination, you may request permanent deletion of all tenant data.
                </p>
              </section>

              <section>
                <h2 className="text-h2 font-bold text-text-primary mb-3">5. Privacy Contact</h2>
                <p>
                  For data protection inquiries or to exercise your privacy rights under local data protection regulations, contact our Data Protection Officer at{' '}
                  <a href="mailto:privacy@zanapos.com" className="text-primary font-medium underline">
                    privacy@zanapos.com
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
                to="/terms"
                className="text-small font-semibold text-text-secondary hover:text-text-primary"
              >
                View Terms of Service →
              </Link>
            </div>
          </div>
        </Container>
      </main>

      <LandingFooter />
    </div>
  );
}
