import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import LandingDashboardMockup from './LandingDashboardMockup';

/**
 * LandingDarkShowcase — Premium dark section with dashboard mockup.
 * "One system. Your entire operation."
 */
export default function LandingDarkShowcase() {
  return (
    <section className="relative py-24 md:py-32 bg-[#12100E] overflow-hidden">
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(120, 68, 33, 0.08) 0%, transparent 70%)',
        }}
      />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-white">
              One system.
              <br />
              Your entire operation.
            </h2>
            <p className="mt-4 text-body md:text-[1.125rem] text-[#A8A29E] max-w-xl mx-auto leading-relaxed">
              Sales, inventory, purchases, customers, and reporting — all connected
              in one fast, reliable platform.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <LandingDashboardMockup variant="dark" />
        </ScrollReveal>
      </Container>
    </section>
  );
}
