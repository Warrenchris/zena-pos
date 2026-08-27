import React from 'react';
import Container from './shared/Container';
import SectionHeading from './shared/SectionHeading';
import FeatureCard from './shared/FeatureCard';
import ScrollReveal from './shared/ScrollReveal';
import {
  ShoppingCartIcon,
  CubeIcon,
  TruckIcon,
  UsersIcon,
  ChartBarIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';

const features = [
  {
    title: 'Sales',
    description: 'Process sales quickly with fast product search, barcode support, and simple cart management.',
    icon: ShoppingCartIcon
  },
  {
    title: 'Inventory',
    description: 'Know exactly what you have, what is moving, and what needs restocking attention.',
    icon: CubeIcon
  },
  {
    title: 'Purchases',
    description: 'Receive products from suppliers and keep inventory automatically synchronized.',
    icon: TruckIcon
  },
  {
    title: 'Customers',
    description: 'Keep customer information, purchase history, and loyalty data organized.',
    icon: UsersIcon
  },
  {
    title: 'Reports',
    description: 'Understand sales performance, inventory health, and business trends at a glance.',
    icon: ChartBarIcon
  },
  {
    title: 'Expenses',
    description: 'Track business expenses, categorize costs, and monitor cash flow.',
    icon: BanknotesIcon
  }
];

export default function LandingFeatureOverview() {
  return (
    <section id="features" className="py-24 bg-app">
      <Container>
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            eyebrow="Capabilities"
            title="Everything your business needs. Nothing it doesn't."
            subtitle="From checkout to back office, Zana POS covers every part of running your business."
            centered
          />
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {features.map((feature, index) => (
            <ScrollReveal key={feature.title} delay={index * 80}>
              <FeatureCard
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
              />
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
