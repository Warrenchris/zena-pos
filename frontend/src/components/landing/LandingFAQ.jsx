import React from 'react';
import Container from './shared/Container';
import ScrollReveal from './shared/ScrollReveal';
import FAQItem from './shared/FAQItem';

const faqs = [
  {
    question: 'What is Zana POS?',
    answer:
      'Zana POS is a modern business management platform that brings together point of sale, inventory management, purchasing, customer management, and reporting into one integrated system designed for African businesses.',
  },
  {
    question: 'Who is Zana POS for?',
    answer:
      'Zana POS is built for small and medium businesses including retail stores, restaurants, boutiques, pharmacies, electronics shops, and wholesale operations. It supports both single-location and growing businesses.',
  },
  {
    question: 'Can I manage inventory with Zana POS?',
    answer:
      'Yes. Zana POS provides complete inventory management including stock tracking, low-stock notifications, stock adjustments, stock transfers between locations, and automated inventory updates when sales and purchases are processed.',
  },
  {
    question: 'Can I manage suppliers and purchases?',
    answer:
      'Yes. You can create and manage supplier profiles, process purchase orders, record product receivings from suppliers, and track purchase returns — all integrated with your inventory.',
  },
  {
    question: 'Can I track sales and generate reports?',
    answer:
      'Absolutely. Zana POS records all sales transactions and provides comprehensive reports on sales performance, inventory health, expenses, and business trends. Reports can be exported to Excel and PDF.',
  },
  {
    question: 'Does Zana POS work on tablets and phones?',
    answer:
      'Zana POS is designed to work across devices. The interface adapts to desktop computers, tablets, and phones so you can manage your business from any device with a web browser.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Create an account, set up your shop details, add your products, and you are ready to start selling. The setup process takes just a few minutes.',
  },
  {
    question: 'Is my business data secure?',
    answer:
      'Yes. Zana POS uses industry-standard security practices including encrypted authentication, role-based access control, and secure data handling to protect your business information.',
  },
];

/**
 * LandingFAQ — Elegant FAQ accordion section.
 * Uses Headless UI Disclosure for accessible keyboard navigation.
 */
export default function LandingFAQ() {
  return (
    <section className="py-24 bg-app" id="faq">
      <Container>
        <ScrollReveal>
          <div className="text-center mb-12 md:mb-16">
            <p className="text-caption font-semibold uppercase tracking-widest text-primary mb-3">
              FAQ
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
              Questions &amp; answers.
            </h2>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="max-w-2xl mx-auto">
            {faqs.map((faq) => (
              <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
