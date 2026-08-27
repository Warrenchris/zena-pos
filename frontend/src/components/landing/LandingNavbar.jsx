import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Disclosure } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Logo from './shared/Logo';
import Container from './shared/Container';

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Disclosure
      as="nav"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
        scrolled
          ? 'bg-app/80 backdrop-blur-xl border-b border-border-default py-3'
          : 'bg-transparent py-5'
      }`}
    >
      {({ open }) => (
        <>
          <Container>
            <div className="flex items-center justify-between">
              {/* Left: Logo */}
              <div className="flex-shrink-0 flex items-center">
                <Logo />
              </div>

              {/* Center-right: Nav links (Desktop) */}
              <div className="hidden md:flex md:items-center md:space-x-8">
                <a
                  href="#features"
                  className="text-text-secondary hover:text-text-primary text-small font-medium transition-colors duration-150"
                >
                  Features
                </a>
                <a
                  href="#pricing"
                  className="text-text-secondary hover:text-text-primary text-small font-medium transition-colors duration-150"
                >
                  Pricing
                </a>
              </div>

              {/* Right: Actions (Desktop) */}
              <div className="hidden md:flex md:items-center md:space-x-6">
                <Link
                  to="/login"
                  className="text-text-secondary hover:text-text-primary text-small font-medium transition-colors duration-150"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="bg-primary text-white px-4 py-2 rounded-xl text-small font-semibold hover:bg-primary-hover shadow-sm transition-all duration-150 active:scale-[0.98]"
                >
                  Get started
                </Link>
              </div>

              {/* Mobile menu button */}
              <div className="flex items-center md:hidden">
                <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface focus:outline-none transition-colors duration-150">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
            </div>
          </Container>

          {/* Mobile menu */}
          <Disclosure.Panel className="md:hidden border-t border-border-default bg-app">
            <div className="px-4 pt-2 pb-6 space-y-1 shadow-lg">
              <Disclosure.Button
                as="a"
                href="#features"
                className="block px-3 py-3 rounded-md text-base font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors duration-150"
              >
                Features
              </Disclosure.Button>
              <Disclosure.Button
                as="a"
                href="#pricing"
                className="block px-3 py-3 rounded-md text-base font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors duration-150"
              >
                Pricing
              </Disclosure.Button>
              <div className="border-t border-border-default pt-4 pb-2 mt-4 space-y-3">
                <Disclosure.Button
                  as={Link}
                  to="/login"
                  className="block px-3 py-2 rounded-md text-base font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors duration-150"
                >
                  Sign in
                </Disclosure.Button>
                <Disclosure.Button
                  as={Link}
                  to="/signup"
                  className="block px-3 py-2 text-center rounded-xl text-base font-semibold bg-primary text-white hover:bg-primary-hover shadow-sm transition-all duration-150 active:scale-[0.98]"
                >
                  Get started
                </Disclosure.Button>
              </div>
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}
