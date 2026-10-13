import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import billingReducer from '../../store/slices/billingSlice';
import { useEntitlement } from '../useEntitlement';
import billingService from '../../services/billing.service';

jest.mock('../../services/billing.service', () => ({
  __esModule: true,
  default: { getSubscription: jest.fn(), getPlans: jest.fn(), getInvoices: jest.fn() },
}));

const makeStore = () =>
  configureStore({
    reducer: {
      billing: billingReducer,
      auth: (state = { user: { id: 1, orgRole: 'owner' } }) => state,
    },
  });

describe('useEntitlement subscription hydration', () => {
  it('does not re-fetch in a loop after a 403', async () => {
    billingService.getSubscription.mockRejectedValue({
      response: { status: 403, data: { code: 'EMAIL_VERIFICATION_REQUIRED', error: 'blocked' } },
    });
    const store = makeStore();
    const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;

    renderHook(() => useEntitlement('multi_shop'), { wrapper });
    await waitFor(() => expect(store.getState().billing.error.subscription).toBeTruthy());
    await new Promise((r) => setTimeout(r, 200));

    expect(billingService.getSubscription).toHaveBeenCalledTimes(1);
  });
});
