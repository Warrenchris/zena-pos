import React from 'react';
import { Link } from 'react-router-dom';
import Container from './shared/Container';
import Logo from './shared/Logo';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing Plans', href: '#pricing' },
    { label: 'Frequently Asked', href: '#faq' },
  ],
  Industries: [
    { label: 'Supermarkets & Retail', href: '#industries' },
    { label: 'Restaurants & Hospitality', href: '#industries' },
    { label: 'Pharmacies & Healthcare', href: '#industries' },
    { label: 'Wholesale Distribution', href: '#industries' },
  ],
  'Account & Support': [
    { label: 'Merchant Sign in', to: '/login' },
    { label: 'Create Free Account', to: '/signup' },
    { label: 'WhatsApp Live Support', href: 'https://wa.me/254700000000?text=Hello%20Zana%20POS%20Support,%20I%20need%20assistance.', external: true },
  ],
  'Legal & Trust': [
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Security Overview', to: '/terms#security' },
  ],
};

export default function LandingFooter() {
  return (
    <footer className="border-t border-border-default bg-surface" role="contentinfo">
      <Container className="py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 md:gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="md" />
            <p className="mt-4 text-caption text-text-muted leading-relaxed max-w-xs">
              Simple, fast business management &amp; POS engineered for modern African retailers.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-caption font-semibold uppercase tracking-widest text-text-muted mb-4">
                {category}
              </h3>
              <ul className="space-y-3" role="list">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        className="text-small text-text-secondary hover:text-text-primary transition-colors duration-150 focus:outline-none focus-visible:underline"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noopener noreferrer' : undefined}
                        className="text-small text-text-secondary hover:text-text-primary transition-colors duration-150 focus:outline-none focus-visible:underline"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-border-default flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-caption text-text-muted">
            &copy; {new Date().getFullYear()} Zana POS. All rights reserved. Built for African commerce.
          </p>
          <div className="flex items-center gap-4 text-caption text-text-muted">
            <Link to="/terms" className="hover:text-text-primary transition-colors">Terms</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-text-primary transition-colors">Privacy</Link>
            <span>•</span>
            <span>M-Pesa Integrated</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
