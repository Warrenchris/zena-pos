import React from 'react';
import { Link } from 'react-router-dom';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';

/**
 * LandingPricing — Pricing placeholder section.
 * No actual pricing data exists in the codebase, so this uses a CTA approach.
 */
export default function LandingPricing() {
  return (
    <section className="py-24 bg-surface-0" id="pricing">
      <Container>
        <ScrollReveal>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-caption font-semibold uppercase tracking-widest text-primary mb-3">
              Pricing
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
              Simple pricing.
              <br />
              Built around your business.
            </h2>
            <p className="mt-4 text-body md:text-[1.125rem] text-text-secondary leading-relaxed max-w-lg mx-auto">
              Whether you're running a single shop or scaling across locations,
              Zana POS fits your business needs without complicated pricing tiers.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-primary text-white rounded-xl font-semibold text-body shadow-sm hover:bg-primary-hover active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app"
              >
                Get started
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-8 py-3.5 border border-border-default bg-surface text-text-primary rounded-xl font-medium text-body hover:bg-surface-2 hover:border-border-hover transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app"
              >
                Sign in
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
