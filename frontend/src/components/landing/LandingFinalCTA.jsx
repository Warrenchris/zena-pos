import React from 'react';
import { Link } from 'react-router-dom';
import Container from './shared/Container';
import Logo from './shared/Logo';
import ScrollReveal from './shared/ScrollReveal';

/**
 * LandingFinalCTA — Visually powerful final conversion section.
 * "Your business deserves better tools."
 */
export default function LandingFinalCTA() {
  return (
    <section className="relative py-24 md:py-32 bg-surface overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 50%, var(--color-primary-light) 0%, transparent 70%)',
        }}
      />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto text-center">
            <div className="flex justify-center mb-8">
              <Logo showText={false} size="lg" />
            </div>

            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
              Your business deserves
              <br />
              better tools.
            </h2>

            <p className="mt-4 text-body md:text-[1.125rem] text-text-secondary leading-relaxed max-w-lg mx-auto">
              Start running your business with less friction and more clarity.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-primary text-white rounded-xl font-semibold text-body shadow-sm hover:bg-primary-hover active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Get started with Zana
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-6 py-3.5 text-text-secondary font-medium text-body hover:text-text-primary transition-colors duration-150 focus:outline-none focus-visible:underline"
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
