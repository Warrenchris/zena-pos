import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import {
  MagnifyingGlassIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  DocumentCheckIcon
} from '@heroicons/react/24/outline';

export default function LandingSpeedSection() {
  const steps = [
    { label: 'Search', icon: MagnifyingGlassIcon },
    { label: 'Add to cart', icon: PlusCircleIcon },
    { label: 'Checkout', icon: ShoppingCartIcon },
    { label: 'Payment', icon: CreditCardIcon },
    { label: 'Receipt', icon: DocumentCheckIcon },
  ];

  return (
    <section className="py-24 bg-app overflow-hidden">
      <Container>
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold tracking-tight text-text-primary leading-tight">
              Your business moves fast.<br />
              Your POS should too.
            </h2>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-12 max-w-4xl mx-auto">
            {/* Desktop Flow */}
            <div className="relative hidden md:flex items-center justify-between">
              {/* Connecting line */}
              <div className="absolute top-6 left-12 right-12 h-[2px] border-t-2 border-dashed border-border-default z-0"></div>
              
              {steps.map((step, index) => (
                <div key={step.label} className="relative z-10 flex flex-col items-center group">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
                    <step.icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <span className="text-caption text-text-muted font-medium mt-2 whitespace-nowrap">
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Mobile Flow (wrap/scrollable) */}
            <div className="md:hidden flex space-x-6 overflow-x-auto pb-4 px-2 no-scrollbar relative items-start">
              {/* Fake connecting line for mobile */}
              <div className="absolute top-6 left-10 w-[450px] h-[2px] border-t-2 border-dashed border-border-default z-0"></div>
              
              {steps.map((step, index) => (
                <div key={step.label} className="relative z-10 flex flex-col items-center shrink-0 w-16">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <step.icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-caption text-text-muted font-medium mt-2 text-center leading-tight">
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <p className="text-body text-text-secondary text-center max-w-md mx-auto mt-12">
            From search to receipt in seconds. No lag, no unnecessary steps.
          </p>
        </ScrollReveal>
      </Container>
    </section>
  );
}
