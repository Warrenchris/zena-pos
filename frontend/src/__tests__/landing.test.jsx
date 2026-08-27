import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../components/landing/LandingPage';

describe('Zana POS Landing Page', () => {
  beforeEach(() => {
    // Mock IntersectionObserver
    window.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));

    // Mock matchMedia
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  test('renders hero headline and main call to action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Your business,/i)).toBeInTheDocument();
    expect(screen.getByText(/beautifully in control\./i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /get started/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign in/i })[0]).toBeInTheDocument();
  });

  test('renders capabilities and business types sections', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Everything your business needs\. Nothing it doesn't\./i)).toBeInTheDocument();
    expect(screen.getByText(/Built for real business\./i)).toBeInTheDocument();
    expect(screen.getByText(/Questions & answers\./i)).toBeInTheDocument();
  });

  test('renders feature stories for sales, inventory, and reports', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Sell faster\./i)).toBeInTheDocument();
    expect(screen.getByText(/Know what's on your shelves\./i)).toBeInTheDocument();
    expect(screen.getByText(/Stop guessing\./i)).toBeInTheDocument();
  });
});
