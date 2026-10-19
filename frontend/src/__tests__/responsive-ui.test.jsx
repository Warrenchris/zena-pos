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
  fetchAccessibleShops: jest.fn(() => ({ type: 'shop/fetchAccessibleShops' })),
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

    const navigation = screen.getByRole('navigation', { name: /zana suite/i });
    expect(navigation).toHaveAttribute('aria-hidden', 'false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onMenuClick when mobile menu button is clicked in TopNavBar', () => {
    const handleMenuClick = jest.fn();
    render(
      <MemoryRouter>
        <TopNavBar onMenuClick={handleMenuClick} isSidebarOpen={false} />
      </MemoryRouter>
    );

    const menuButton = screen.getByLabelText(/open navigation menu/i);
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menuButton);
    expect(handleMenuClick).toHaveBeenCalledTimes(1);
  });

  it('renders floating tooltip when collapsed sidebar nav item is hovered and cleans up on leave', () => {
    window.innerWidth = 1280;

    render(
      <MemoryRouter>
        <ModernSidebar
          isOpen
          isCollapsed
          user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
          variant="admin"
        />
      </MemoryRouter>
    );

    const posLink = screen.getByRole('link', { name: 'POS Terminal' });
    expect(posLink).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(posLink);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('POS Terminal');
    expect(tooltip).toHaveTextContent('• Sales & Orders');
    expect(posLink).toHaveAttribute('aria-describedby', 'sidebar-collapsed-tooltip');

    fireEvent.mouseLeave(posLink);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation with focus and blur for collapsed sidebar tooltips', () => {
    window.innerWidth = 1280;

    render(
      <MemoryRouter>
        <ModernSidebar
          isOpen
          isCollapsed
          user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
          variant="admin"
        />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });

    fireEvent.focus(dashboardLink);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Dashboard');

    fireEvent.blur(dashboardLink);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses collapsed tooltip on Escape key', () => {
    window.innerWidth = 1280;

    render(
      <MemoryRouter>
        <ModernSidebar
          isOpen
          isCollapsed
          user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
          variant="admin"
        />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    fireEvent.mouseEnter(dashboardLink);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not display floating tooltip when sidebar is expanded', () => {
    window.innerWidth = 1280;

    render(
      <MemoryRouter>
        <ModernSidebar
          isOpen
          isCollapsed={false}
          user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
          variant="admin"
        />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    fireEvent.mouseEnter(dashboardLink);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

