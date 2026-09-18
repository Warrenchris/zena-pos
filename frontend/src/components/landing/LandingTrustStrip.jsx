import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import {
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
  HeartIcon,
  DevicePhoneMobileIcon,
  CubeIcon,
  BoltIcon,
  ShieldCheckIcon,
  SignalSlashIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';

const metrics = [
  { label: 'Uptime Reliability', value: '99.9%', detail: 'Cloud SLA Guarantee', icon: ShieldCheckIcon },
  { label: 'Average Checkout', value: '< 2.1s', detail: 'Rapid Line Clearance', icon: BoltIcon },
  { label: 'Mobile Money', value: 'Instant', detail: 'M-Pesa STK Integration', icon: CheckBadgeIcon },
  { label: 'Offline Resilient', value: '100%', detail: 'Continuous Cashiering', icon: SignalSlashIcon },
];

const industries = [
  { name: 'Supermarkets & Retail', icon: ShoppingBagIcon },
  { name: 'Restaurants & Cafes', icon: BuildingStorefrontIcon },
  { name: 'Fashion & Boutiques', icon: SparklesIcon },
  { name: 'Pharmacies & Chemists', icon: HeartIcon },
  { name: 'Electronics & Gadgets', icon: DevicePhoneMobileIcon },
  { name: 'Wholesale & Distributors', icon: CubeIcon },
];

export default function LandingTrustStrip() {
  return (
    <section className="py-16 border-y border-border-default bg-surface-0">
      <Container>
        {/* Proof Stats Grid */}
        <ScrollReveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
            {metrics.map((item) => (
              <div
                key={item.label}
                className="p-5 rounded-2xl bg-surface border border-border-default shadow-2xs flex flex-col items-center sm:items-start text-center sm:text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
                  {item.value}
                </div>
                <div className="text-small font-semibold text-text-primary mt-1">
                  {item.label}
                </div>
                <div className="text-caption text-text-muted">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>

        {/* Industry Pill Strip */}
        <ScrollReveal delay={150}>
          <p className="text-caption font-semibold uppercase tracking-widest text-text-muted text-center mb-6">
            Engineered for high-throughput retail across Africa
          </p>
          <div className="flex overflow-x-auto flex-nowrap scrollbar-hide md:flex-wrap md:justify-center gap-2.5 pb-2 md:pb-0">
            {industries.map((industry) => (
              <div
                key={industry.name}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border-default text-small font-medium text-text-secondary bg-surface hover:border-border-hover hover:text-text-primary transition-colors duration-150 whitespace-nowrap"
              >
                <industry.icon className="h-4 w-4 text-primary shrink-0" />
                <span>{industry.name}</span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
