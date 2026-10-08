import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import EmailVerificationBanner from '../components/EmailVerificationBanner';

function renderBanner(userState, preSession = false) {
  if (preSession) {
    sessionStorage.setItem('zana_email_banner_dismissed', 'true');
  } else {
    sessionStorage.removeItem('zana_email_banner_dismissed');
  }

  const store = configureStore({
    reducer: {
      auth: () => ({ user: userState }),
    },
  });

  return render(
    <Provider store={store}>
      <EmailVerificationBanner />
    </Provider>
  );
}

describe('EmailVerificationBanner Component', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders nothing if user is verified', () => {
    renderBanner({
      id: 1,
      orgRole: 'owner',
      isEmployee: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing if user is not an owner', () => {
    renderBanner({
      id: 2,
      orgRole: 'member',
      role: 'cashier',
      isEmployee: true,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calculates remaining days accurately when createdAt is 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 1000).toISOString();
    renderBanner({
      id: 1,
      orgRole: 'owner',
      isEmployee: false,
      emailVerified: false,
      createdAt: twoDaysAgo,
    });

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/5 days remaining/i)).toBeInTheDocument();
  });

  it('renders expired state when createdAt is 8 days ago', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    renderBanner({
      id: 1,
      orgRole: 'owner',
      isEmployee: false,
      emailVerified: false,
      createdAt: eightDaysAgo,
    });

    expect(screen.getByText(/Your 7-day grace period has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/Action Required/i)).toBeInTheDocument();
  });

  it('hides after user clicks the dismiss button', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    renderBanner({
      id: 1,
      orgRole: 'owner',
      isEmployee: false,
      emailVerified: false,
      createdAt: oneDayAgo,
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    const dismissBtn = screen.getByLabelText(/Dismiss banner/i);
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(sessionStorage.getItem('zana_email_banner_dismissed')).toBe('true');
  });
});
