import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/Toast';

const TestComponent = () => {
  const { showToast } = useToast();

  return (
    <div>
      <button
        onClick={() =>
          showToast({
            type: 'warning',
            title: 'Low Stock Alert',
            message: 'Coca-Cola Soda 1.25L is running low. Current stock: 2 (Reorder at: 10)',
            id: 'toast-1'
          })
        }
      >
        Trigger Low Stock
      </button>
      <button
        onClick={() =>
          showToast({
            type: 'success',
            title: 'Sale Completed',
            message: 'Order #1001 processed',
            id: 'toast-2'
          })
        }
      >
        Trigger Success
      </button>
    </div>
  );
};

describe('Toast notification system', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders toast with title and readable message', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Low Stock'));

    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
    expect(
      screen.getByText('Coca-Cola Soda 1.25L is running low. Current stock: 2 (Reorder at: 10)')
    ).toBeInTheDocument();
  });

  it('prevents duplicate toasts with the same ID', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Low Stock'));
    fireEvent.click(screen.getByText('Trigger Low Stock'));

    const titles = screen.getAllByText('Low Stock Alert');
    expect(titles).toHaveLength(1);
  });

  it('allows manual dismissal of toasts via close button', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Low Stock'));
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Low Stock Alert')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after duration', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Low Stock'));
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4500);
    });

    expect(screen.queryByText('Low Stock Alert')).not.toBeInTheDocument();
  });
});
