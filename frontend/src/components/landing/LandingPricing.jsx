import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import SectionHeading from './shared/SectionHeading';
import { CheckIcon } from '@heroicons/react/24/solid';
import {
  BuildingStorefrontIcon,
  UserGroupIcon,
  SparklesIcon,
  ShieldCheckIcon,
  DevicePhoneMobileIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Ideal for single retail shops, kiosks & boutique storefronts',
    priceMonthly: 1500,
    priceAnnual: 1275, // 15% discount
    maxShops: '1 Store Location',
    maxUsers: '2 Staff Accounts',
    popular: false,
    features: [
      'Complete point of sale & cashier terminal',
      'Real-time inventory & low-stock alerts',
      'Instant thermal receipt printing',
      'Barcode scanner & cash drawer support',
      'Daily sales & expense summaries',
      'Cash & manual M-Pesa tracking',
      'Standard email support',
    ],
    ctaText: 'Start 14-day free trial',
    ctaVariant: 'secondary',
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For thriving retailers expanding across multiple branches',
    priceMonthly: 3500,
    priceAnnual: 2975, // 15% discount
    maxShops: '3 Store Locations',
    maxUsers: '10 Staff Accounts',
    popular: true,
    features: [
      'All Starter capabilities included',
      'Multi-branch stock transfers & balancing',
      'Organization Insights & consolidated reporting',
      'Automated Safaricom M-Pesa STK Push',
      'Customer CRM, store credit & ledger',
      'Role-based permissions (Cashier, Manager)',
      'Purchase orders & supplier receiving',
      'Priority live chat & phone support',
    ],
    ctaText: 'Start 14-day free trial',
    ctaVariant: 'primary',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For supermarket chains, wholesale operations & high-volume merchants',
    priceMonthly: 7500,
    priceAnnual: 6375, // 15% discount
    maxShops: 'Unlimited Locations',
    maxUsers: 'Unlimited Staff',
    popular: false,
    features: [
      'All Growth capabilities included',
      'AI Sales Demand Forecasting & Insights',
      'Advanced financial margin & profit analysis',
      'Thermal barcode & QR label generator',
      'Multi-currency & custom tax rule engine',
      'REST API & Webhook integration access',
      'Dedicated account manager',
      '99.9% Uptime Service Level Agreement (SLA)',
    ],
    ctaText: 'Start 14-day free trial',
    ctaVariant: 'secondary',
  },
];

export default function LandingPricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section className="py-24 bg-surface-0 border-t border-border-default relative overflow-hidden" id="pricing">
      {/* Background ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            eyebrow="Transparent Pricing"
            title="Simple, honest pricing for African businesses."
            subtitle="Everything you need to run, manage, and scale your operations without hidden charges or per-transaction fees."
            centered
          />
        </div>

        {/* Billing Cycle Toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className={`text-small font-medium ${!isAnnual ? 'text-text-primary' : 'text-text-secondary'}`}>
            Monthly Billing
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isAnnual}
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              isAnnual ? 'bg-primary' : 'bg-surface-3'
            }`}
          >
            <span className="sr-only">Toggle annual billing</span>
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isAnnual ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-small font-medium flex items-center gap-1.5 ${isAnnual ? 'text-text-primary' : 'text-text-secondary'}`}>
            <span>Annual Billing</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary">
              Save 15%
            </span>
          </span>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;

            return (
              <ScrollReveal key={plan.id} delay={index * 100}>
                <div
                  className={`rounded-2xl flex flex-col justify-between h-full p-6 lg:p-8 transition-all duration-200 relative ${
                    plan.popular
                      ? 'bg-surface border-2 border-primary shadow-floating ring-4 ring-primary/10'
                      : 'bg-surface border border-border-default shadow-sm hover:shadow-md hover:border-border-hover'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white text-[11px] font-bold tracking-wider uppercase py-1 px-3.5 rounded-full shadow-sm flex items-center gap-1">
                      <SparklesIcon className="w-3.5 h-3.5" />
                      Most Popular
                    </div>
                  )}

                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-h2 font-bold text-text-primary tracking-tight">{plan.name}</h3>
                    </div>
                    <p className="text-caption text-text-secondary min-h-[40px] leading-relaxed">
                      {plan.tagline}
                    </p>

                    {/* Price display */}
                    <div className="mt-6 mb-6 pb-6 border-b border-border-default">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-caption font-semibold text-text-muted">KES</span>
                        <span className="text-4xl lg:text-5xl font-extrabold text-text-primary tracking-tight">
                          {price.toLocaleString()}
                        </span>
                        <span className="text-small text-text-muted font-normal">/ month</span>
                      </div>
                      {isAnnual && (
                        <p className="text-[12px] text-text-muted mt-1">
                          Billed annually at KES {(price * 12).toLocaleString()} / year
                        </p>
                      )}
                    </div>

                    {/* Quota Highlights */}
                    <div className="space-y-2 mb-6 p-3.5 rounded-xl bg-surface-2 border border-border-default text-small">
                      <div className="flex items-center gap-2 text-text-primary font-medium">
                        <BuildingStorefrontIcon className="w-4 h-4 text-primary shrink-0" />
                        <span>{plan.maxShops}</span>
                      </div>
                      <div className="flex items-center gap-2 text-text-primary font-medium">
                        <UserGroupIcon className="w-4 h-4 text-primary shrink-0" />
                        <span>{plan.maxUsers}</span>
                      </div>
                    </div>

                    {/* Features checklist */}
                    <div className="space-y-3 mb-8">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                        Included Features
                      </p>
                      <ul className="space-y-2.5">
                        {plan.features.map((feature, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-2.5 text-small text-text-secondary leading-snug">
                            <CheckIcon className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Card CTA */}
                  <div className="pt-4 border-t border-border-default">
                    <Link
                      to="/signup"
                      className={`w-full inline-flex items-center justify-center py-3 px-4 rounded-xl text-small font-semibold transition-all duration-150 active:scale-[0.98] ${
                        plan.popular
                          ? 'bg-primary text-white hover:bg-primary-hover shadow-sm'
                          : 'bg-surface-2 text-text-primary border border-border-default hover:bg-surface-3 hover:border-border-hover'
                      }`}
                    >
                      {plan.ctaText}
                    </Link>
                    <p className="text-center text-[11px] text-text-muted mt-2">
                      No credit card required
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Commercial Trust Footer Bar */}
        <div className="mt-16 max-w-4xl mx-auto rounded-2xl border border-border-default bg-surface p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheckIcon className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-body font-bold text-text-primary">Need a tailored enterprise solution?</h4>
              <p className="text-small text-text-secondary mt-0.5">
                For supermarket chains with 10+ branches, custom ERP integrations, or on-premise deployments.
              </p>
            </div>
          </div>
          <a
            href="https://wa.me/254700000000?text=Hello%20Zana%20POS%20Team,%20I%20would%20like%20to%20inquire%20about%20enterprise%20pricing."
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-small font-semibold text-text-primary transition-colors whitespace-nowrap"
          >
            Talk to Sales
          </a>
        </div>

        {/* Payment Methods Supported */}
        <div className="mt-8 text-center">
          <p className="text-caption text-text-muted uppercase tracking-wider font-semibold mb-3">
            Supported Payment Methods
          </p>
          <div className="flex items-center justify-center gap-6 text-small text-text-secondary font-medium">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-border-default">
              <DevicePhoneMobileIcon className="w-4 h-4 text-emerald-600" />
              Safaricom M-Pesa STK Push
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-border-default">
              <CreditCardIcon className="w-4 h-4 text-blue-600" />
              Visa &amp; Mastercard
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-border-default">
              Cash &amp; Bank Transfer
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
