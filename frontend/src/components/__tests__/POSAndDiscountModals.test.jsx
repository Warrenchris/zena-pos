import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import settingsReducer from '../../store/slices/settingsSlice';
import salesReducer from '../../store/slices/salesSlice';
import { employeesAPI } from '../../services/api';
import POSModal from '../POSModal';
import DiscountModal from '../pos/DiscountModal';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  employeesAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
  },
  couponsAPI: {
    validate: jest.fn(),
  },
}));

function createTestStore() {
  return configureStore({
    reducer: {
      settings: settingsReducer,
      sales: salesReducer,
    },
  });
}

describe('POSModal and DiscountModal no-undef regression tests', () => {
  it('renders POSModal with a Redux store provider without throwing', () => {
    const store = createTestStore();

    expect(() =>
      render(
        <Provider store={store}>
          <MemoryRouter>
            <POSModal products={[]} customers={[]} onClose={jest.fn()} />
          </MemoryRouter>
        </Provider>
      )
    ).not.toThrow();

    expect(screen.getByText(/Point of Sale/i)).toBeInTheDocument();
  });

  it('allows typing in DiscountModal discount value input without throwing', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <DiscountModal
          isOpen={true}
          onClose={jest.fn()}
          target="cart"
          baseAmount={1000}
          userRole="admin"
          onApplyDiscount={jest.fn()}
          onRemoveDiscount={jest.fn()}
        />
      </Provider>
    );

    await waitFor(() => expect(employeesAPI.getAll).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('e.g. 10');
    expect(() => {
      fireEvent.change(input, { target: { value: '15' } });
    }).not.toThrow();
    expect(input).toHaveValue(15);
  });
});
