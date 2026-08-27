import React from 'react';
import { Disclosure, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * FAQItem — Accordion item using Headless UI Disclosure.
 * Accessible keyboard navigation and smooth transitions.
 */
export default function FAQItem({ question, answer }) {
  return (
    <Disclosure as="div" className="border-b border-border-default">
      {({ open }) => (
        <>
          <Disclosure.Button className="flex w-full items-center justify-between py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app rounded-lg group">
            <span className="text-body font-semibold text-text-primary pr-4 group-hover:text-primary transition-colors duration-150">
              {question}
            </span>
            <ChevronDownIcon
              className={`h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </Disclosure.Button>
          <Transition
            enter="transition-all duration-200 ease-out"
            enterFrom="max-h-0 opacity-0"
            enterTo="max-h-96 opacity-100"
            leave="transition-all duration-150 ease-in"
            leaveFrom="max-h-96 opacity-100"
            leaveTo="max-h-0 opacity-0"
          >
            <Disclosure.Panel className="pb-5 pr-12">
              <p className="text-body text-text-secondary leading-relaxed">
                {answer}
              </p>
            </Disclosure.Panel>
          </Transition>
        </>
      )}
    </Disclosure>
  );
}
