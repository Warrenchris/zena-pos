import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import {
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
  HeartIcon,
  DevicePhoneMobileIcon,
  CubeIcon
} from '@heroicons/react/24/outline';

const industries = [
  { name: 'Retail', icon: ShoppingBagIcon },
  { name: 'Restaurants', icon: BuildingStorefrontIcon },
  { name: 'Boutiques', icon: SparklesIcon },
  { name: 'Pharmacies', icon: HeartIcon },
  { name: 'Electronics', icon: DevicePhoneMobileIcon },
  { name: 'Wholesale', icon: CubeIcon },
];

export default function LandingTrustStrip() {
  return (
    <section className="py-16 border-y border-border-default bg-surface-0">
      <Container>
        <ScrollReveal>
          <h2 className="text-caption font-semibold uppercase tracking-widest text-text-muted text-center mb-8">
            Built for businesses that move fast.
          </h2>
          <div className="flex overflow-x-auto flex-nowrap scrollbar-hide md:flex-wrap md:justify-center gap-3 pb-4 md:pb-0">
            {industries.map((industry) => (
              <div
                key={industry.name}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border-default text-small font-medium text-text-secondary bg-surface hover:border-border-hover hover:text-text-primary transition-colors duration-150 whitespace-nowrap"
              >
                <industry.icon className="h-4 w-4" />
                <span>{industry.name}</span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
