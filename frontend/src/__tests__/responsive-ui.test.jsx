import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModernSidebar from '../components/ModernSidebar';
import TopNavBar from '../components/navigation/TopNavBar';

jest.mock('../components/NotificationDropdown', () => () => (
  <div data-testid="notification-dropdown" />
));

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
  useDispatch: jest.fn(),
}));

jest.mock('../store/slices/shopSlice', () => ({
  fetchMyShop: jest.fn(() => ({ type: 'shop/fetchMyShop' })),
}));

jest.mock('../store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'auth/logout' })),
}));

const mockedSelectors = {
  auth: {
    user: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
    shop: null,
  },
  shop: {
    shop: { name: 'Flagship Shop' },
    loading: false,
    error: null,
  },
};

const { useSelector, useDispatch } = jest.requireMock('react-redux');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: jest.fn(() => jest.fn()),
  };
});

describe('Responsive navigation primitives', () => {
  beforeEach(() => {
    useSelector.mockImplementation((selector) => selector(mockedSelectors));
    useDispatch.mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exposes navigation semantics on ModernSidebar and closes with Escape', () => {
    const handleClose = jest.fn();

    render(
      <MemoryRouter>
        <ModernSidebar
          isOpen
          onClose={handleClose}
          user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
          variant="admin"
        />
      </MemoryRouter>
    );

    const navigation = screen.getByRole('navigation', { name: /admin panel/i });
    expect(navigation).toHaveAttribute('aria-hidden', 'false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('toggles the mobile search overlay in TopNavBar', () => {
    render(
      <MemoryRouter>
        <TopNavBar onMenuClick={jest.fn()} isSidebarOpen={false} />
      </MemoryRouter>
    );

    const openSearch = screen.getByLabelText(/open search/i);
    fireEvent.click(openSearch);

    expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument();

    const closeSearch = screen.getByLabelText(/close search/i);
    fireEvent.click(closeSearch);

    expect(screen.queryByRole('heading', { name: /search/i })).not.toBeInTheDocument();
  });
});

