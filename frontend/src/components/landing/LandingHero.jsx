import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownIcon } from '@heroicons/react/24/outline';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import LandingDashboardMockup from './LandingDashboardMockup';

export default function LandingHero() {
  return (
    <section className="pt-32 pb-20 relative overflow-hidden">
      <Container>
        <div className="flex flex-col items-center md:items-start text-center md:text-left relative z-10">
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.08] tracking-tight text-text-primary">
            <span className="block">Your business,</span>
            <span className="block">beautifully in control.</span>
          </h1>
          
          <p className="text-body md:text-[1.125rem] text-text-secondary max-w-xl leading-relaxed mt-6">
            Zana POS brings sales, inventory, receivings, customers, and business intelligence into one fast, beautifully simple system.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-8 w-full sm:w-auto">
            <Link
              to="/signup"
              className="bg-primary text-white px-6 py-3 rounded-xl font-semibold text-body hover:bg-primary-hover shadow-sm active:scale-[0.98] transition-all duration-150 w-full sm:w-auto text-center"
            >
              Get started
            </Link>
            <a
              href="#features"
              className="text-text-secondary hover:text-text-primary font-medium flex items-center justify-center gap-1.5 transition-colors duration-150 px-6 py-3 w-full sm:w-auto"
            >
              See how it works
              <ArrowDownIcon className="w-4 h-4" />
            </a>
          </div>
          
          <p className="text-caption text-text-muted mt-6">
            Built for modern African businesses.
          </p>
        </div>

        <div className="mt-16 md:mt-20 relative z-10 w-full">
          <ScrollReveal delay={200}>
            <LandingDashboardMockup />
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}
