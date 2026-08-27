import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';

const steps = [
  { number: '01', title: 'Set up your business', description: 'Create your account, add your shop details, and configure your preferences.' },
  { number: '02', title: 'Add products and start selling', description: 'Import or create your product catalog, set prices, and begin processing sales.' },
  { number: '03', title: 'Understand and grow your business', description: 'Use reports and insights to track performance and make better decisions.' },
];

/**
 * LandingHowItWorks — Simple 3-step onboarding process.
 * Large numbers, elegant typography, minimal design.
 */
export default function LandingHowItWorks() {
  return (
    <section className="py-24 bg-app" id="how-it-works">
      <Container>
        <ScrollReveal>
          <div className="text-center mb-16 md:mb-20">
            <p className="text-caption font-semibold uppercase tracking-widest text-primary mb-3">
              Getting Started
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
              Up and running in minutes.
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <ScrollReveal key={step.number} delay={i * 120}>
              <div className="text-center md:text-left">
                <span className="inline-block text-[clamp(3rem,6vw,4.5rem)] font-bold leading-none tracking-tighter text-primary/15">
                  {step.number}
                </span>
                <h3 className="text-h3 font-semibold text-text-primary mt-2 mb-2">
                  {step.title}
                </h3>
                <p className="text-body text-text-secondary leading-relaxed">
                  {step.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
