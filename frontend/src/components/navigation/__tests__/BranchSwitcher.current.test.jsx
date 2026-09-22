import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import shopReducer from '../../../store/slices/shopSlice';
import authReducer from '../../../store/slices/authSlice';
import billingReducer from '../../../store/slices/billingSlice';
import BranchSwitcher from '../BranchSwitcher';

function createStore({ currentShop, accessibleShops }) {
  const rootReducer = combineReducers({
    auth: authReducer,
    shop: shopReducer,
    billing: billingReducer,
  });
  return configureStore({
    reducer: rootReducer,
    preloadedState: {
      auth: {
        user: { id: 1, role: 'admin', orgRole: 'owner', shop: currentShop },
        shop: currentShop,
      },
      billing: {
        subscription: {
          status: 'active',
          plan: { features: { multi_shop: true }, maxShops: 5 },
        },
        quotas: { shops: { current: 2, limit: 5, isUnlimited: false, allowed: true } },
        loading: { subscription: false },
      },
      shop: {
        shop: currentShop,
        accessibleShops,
      },
    },
  });
}

function openSwitcher(store) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <BranchSwitcher variant="topbar" />
      </MemoryRouter>
    </Provider>
  );
  fireEvent.click(screen.getByLabelText('Switch store workspace'));
}

function listRowButton(name) {
  return screen
    .getAllByText(name)
    .find((el) => el.tagName === 'SPAN' && el.className === 'truncate')
    ?.closest('button');
}

async function currentListRows() {
  await screen.findByText('Branches & Workspaces');
  return ['HQ', 'Branch B']
    .map((name) => listRowButton(name))
    .filter((btn) => btn && btn.disabled);
}

describe('BranchSwitcher current checkmarks', () => {
  test('after aligned auth/me + accessible isCurrent, only one branch is current', async () => {
    openSwitcher(
      createStore({
        currentShop: { id: 2, name: 'Branch B' },
        accessibleShops: [
          { id: 1, name: 'HQ', isCurrent: false },
          { id: 2, name: 'Branch B', isCurrent: true },
        ],
      })
    );
    const current = await currentListRows();
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Branch B');
  });

  test('stale currentShop vs backend isCurrent still ORs into two currents (documents #1 coupling)', async () => {
    openSwitcher(
      createStore({
        currentShop: { id: 1, name: 'HQ' },
        accessibleShops: [
          { id: 1, name: 'HQ', isCurrent: false },
          { id: 2, name: 'Branch B', isCurrent: true },
        ],
      })
    );
    const current = await currentListRows();
    expect(current).toHaveLength(2);
  });
});
