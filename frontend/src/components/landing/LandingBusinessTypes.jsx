import React from 'react';
import Container from './shared/Container';
import SectionHeading from './shared/SectionHeading';
import ScrollReveal from './shared/ScrollReveal';
import {
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
  DevicePhoneMobileIcon,
  HeartIcon,
  CubeTransparentIcon
} from '@heroicons/react/24/outline';

export default function LandingBusinessTypes() {
  const businessTypes = [
    {
      name: 'Retail',
      description: 'Keep products, sales, and inventory under control.',
      icon: ShoppingBagIcon,
    },
    {
      name: 'Restaurants',
      description: 'Keep transactions moving during busy hours.',
      icon: BuildingStorefrontIcon,
    },
    {
      name: 'Boutiques',
      description: 'Manage products and customer sales effortlessly.',
      icon: SparklesIcon,
    },
    {
      name: 'Electronics',
      description: 'Track high-value inventory and product movement.',
      icon: DevicePhoneMobileIcon,
    },
    {
      name: 'Pharmacies',
      description: 'Keep stock operations organized and compliant.',
      icon: HeartIcon,
    },
    {
      name: 'Wholesale',
      description: 'Manage larger inventories with confidence.',
      icon: CubeTransparentIcon,
    },
  ];

  return (
    <section id="industries" className="py-24 bg-surface-0">
      <Container>
        <SectionHeading 
          eyebrow="Industries" 
          title="Built for real business." 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-16">
          {businessTypes.map((type, index) => (
            <ScrollReveal key={type.name} delay={index * 100}>
              <div className="group bg-surface rounded-2xl border border-border-default p-6 hover:shadow-md hover:border-border-hover hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <type.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-h3 font-semibold text-text-primary mb-2">
                  {type.name}
                </h3>
                <p className="text-body text-text-secondary">
                  {type.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
