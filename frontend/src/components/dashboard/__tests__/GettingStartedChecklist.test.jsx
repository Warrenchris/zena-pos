import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import settingsReducer from '../../../store/slices/settingsSlice';
import GettingStartedChecklist from '../GettingStartedChecklist';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function renderChecklist(props = {}) {
  const store = configureStore({
    reducer: { settings: settingsReducer },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GettingStartedChecklist products={[]} employees={[]} user={{ id: 1 }} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

describe('GettingStartedChecklist staff + branch quota', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  test('staff step stays incomplete when only the current-branch list is empty but org seats are 1', () => {
    renderChecklist({ employees: [], orgStaffCount: 1 });
    expect(screen.getByText('Add Staff Member')).toBeInTheDocument();
  });

  test('staff step completes from org-wide seat count even if this branch has no employees', () => {
    renderChecklist({ employees: [], orgStaffCount: 3 });
    expect(screen.getByText('Manage Staff')).toBeInTheDocument();
    expect(screen.queryByText('Add Staff Member')).not.toBeInTheDocument();
  });

  test('shows branch-limit banner and links to /billing when shops quota is exhausted', () => {
    renderChecklist({
      shopQuota: { current: 1, limit: 1, isUnlimited: false },
    });
    expect(screen.getByText(/Branch limit reached/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade your plan/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/billing');
  });

  test('does not show branch-limit banner for unlimited plans', () => {
    renderChecklist({
      shopQuota: { current: 9, limit: null, isUnlimited: true },
    });
    expect(screen.queryByText(/Branch limit reached/)).not.toBeInTheDocument();
  });

  test('does not show branch-limit banner before quota data has loaded', () => {
    renderChecklist({ shopQuota: null });
    expect(screen.queryByText(/Branch limit reached/)).not.toBeInTheDocument();
  });
});
