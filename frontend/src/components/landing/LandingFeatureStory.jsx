import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

export default function LandingFeatureStory({
  eyebrow,
  heading,
  description,
  features = [],
  visual,
  reversed = false,
  id,
  className = ''
}) {
  return (
    <section id={id} className={`py-24 ${className}`}>
      <Container>
        <div className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-20 ${reversed ? 'lg:flex-row-reverse' : ''}`}>
          
          <div className="flex-1 w-full lg:w-1/2">
            <ScrollReveal delay={100}>
              {eyebrow && (
                <p className="text-caption font-semibold uppercase tracking-widest text-primary mb-3">
                  {eyebrow}
                </p>
              )}
              <h3 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
                {heading}
              </h3>
              <p className="text-body text-text-secondary leading-relaxed mt-4">
                {description}
              </p>
              
              {features.length > 0 && (
                <ul className="mt-6">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 mb-3">
                      <CheckCircleIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-body text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollReveal>
          </div>

          <div className="flex-1 w-full lg:w-1/2 flex items-center justify-center">
            <ScrollReveal delay={200} className="w-full">
              {visual}
            </ScrollReveal>
          </div>

        </div>
      </Container>
    </section>
  );
}
