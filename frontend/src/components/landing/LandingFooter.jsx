import React from 'react';
import { Link } from 'react-router-dom';
import Container from './shared/Container';
import Logo from './shared/Logo';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ],
  Business: [
    { label: 'Retail', href: '#industries' },
    { label: 'Restaurants', href: '#industries' },
    { label: 'Wholesale', href: '#industries' },
  ],
  Account: [
    { label: 'Sign in', to: '/login' },
    { label: 'Create account', to: '/signup' },
  ],
};

/**
 * LandingFooter — Premium multi-column SaaS footer.
 * Only links to existing routes or anchor sections.
 */
export default function LandingFooter() {
  return (
    <footer className="border-t border-border-default bg-surface" role="contentinfo">
      <Container className="py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="md" />
            <p className="mt-4 text-caption text-text-muted leading-relaxed max-w-xs">
              Simple, fast business management built for modern African businesses.
            </p>
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
            &copy; {new Date().getFullYear()} Zana POS. All rights reserved.
          </p>
          <p className="text-caption text-text-muted">
            Built for modern businesses.
          </p>
        </div>
      </Container>
    </footer>
  );
}
