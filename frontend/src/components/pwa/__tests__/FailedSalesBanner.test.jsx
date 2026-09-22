/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../../../store/slices/authSlice';
import settingsReducer from '../../../store/slices/settingsSlice';
import { freshDatabase } from '../../../offline/testing/testDb';
import { createEntry, listQueue, saveEntry } from '../../../offline/salesQueue';
import api from '../../../services/api';
import FailedSalesBanner from '../FailedSalesBanner';

jest.mock('../../../services/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const failedEntry = async (n, error = 'Insufficient stock for Sugar', cashierId = 7) => {
  const entry = createEntry(
    { items: [{ productId: n, quantity: 2, price: 150 }], total: 300, paymentMethod: 'cash', customer: { name: 'Jane Wanjiku' } },
    cashierId
  );
  await saveEntry({ ...entry, status: 'failed', lastError: error, attempts: 1 });
  return entry;
};

function renderBanner(userId = 7) {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, settings: settingsReducer }),
    preloadedState: { auth: { user: userId ? { id: userId } : null, shop: null, token: 't', loading: false, error: null } },
  });
  return render(
    <Provider store={store}>
      <FailedSalesBanner />
    </Provider>
  );
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(async () => {
  await freshDatabase();
  api.post.mockReset();
});

describe('FailedSalesBanner', () => {
  it('shows nothing when no sale has been refused', async () => {
    const { container } = renderBanner();
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when nobody is signed in', async () => {
    await failedEntry(1);
    const { container } = renderBanner(null);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it('warns that an offline sale was refused', async () => {
    await failedEntry(1);
    renderBanner();
    expect(await screen.findByRole('alert')).toHaveTextContent('1 offline sale was refused by the server.');
  });

  it('counts several, and ignores other cashiers’ sales', async () => {
    await failedEntry(1);
    await failedEntry(2);
    await failedEntry(3, 'Not mine', 8);
    renderBanner();
    expect(await screen.findByRole('alert')).toHaveTextContent('2 offline sales were refused by the server.');
  });

  it('lets someone review what was refused, and why', async () => {
    await failedEntry(1, 'Insufficient stock for Sugar');
    renderBanner();

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Insufficient stock for Sugar')).toBeInTheDocument();
    expect(within(dialog).getByText(/Jane Wanjiku/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 item\(s\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/300/)).toBeInTheDocument();
  });

  it('only discards a sale after a second, explicit confirmation', async () => {
    const entry = await failedEntry(1);
    renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' })); // changed their mind
    expect(await listQueue(7)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard this sale' }));

    await waitFor(async () => expect(await listQueue(7)).toEqual([]));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(entry.id).toBeTruthy();
  });

  it('tries a refused sale again, and it disappears once the server accepts it', async () => {
    await failedEntry(1);
    api.post.mockResolvedValue({ data: { id: 'ok' } });
    renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await listQueue(7)).toEqual([]));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('keeps the sale, with the new reason, if the server refuses it again', async () => {
    await failedEntry(1, 'Insufficient stock for Sugar');
    api.post.mockRejectedValue(httpError(400, { error: 'Product no longer exists' }));
    renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Product no longer exists')).toBeInTheDocument();
    expect(await listQueue(7)).toHaveLength(1);
  });
});
