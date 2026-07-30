import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { usePermissions } from '../hooks/usePermissions';
import { logout } from '../store/slices/authSlice';
import ModernSidebar from './ModernSidebar';
import TopNavBar from './navigation/TopNavBar';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zana_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { getRoutesByRole } = usePermissions();
  const isLoginPage = location.pathname === '/login' || location.pathname === '/signup';

  const handleToggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('zana_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isLoginPage) {
      const allowedRoutes = getRoutesByRole().map(route => route.path);
      const currentPath = location.pathname;
      const isAllowed = allowedRoutes.some(path => currentPath === path || currentPath.startsWith(`${path}/`));

      if (!isAllowed) {
        navigate('/dashboard');
      }
    }
  }, [location.pathname, getRoutesByRole, navigate, isLoginPage, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-app text-text-primary font-sans antialiased selection:bg-primary/10 selection:text-primary transition-colors duration-200">
      {/* Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-floating focus:outline-none"
      >
        Skip to main content
      </a>
      {children}
    </div>
  );

  // If login or signup page, render minimal canvas shell
  if (isLoginPage) {
    return (
      <Shell>
        <main id="main-content" className="flex-1 min-h-screen flex items-center justify-center p-4">
          <Outlet />
        </main>
      </Shell>
    );
  }

  // Padding-left on main shell for floating sidebar:
  // Collapsed: 96px on lg desktop
  // Expanded: 272px (lg) / 304px (2xl)
  const paddingLeftClass = isCollapsed
    ? 'lg:pl-[96px]'
    : 'lg:pl-[272px] 2xl:pl-[304px]';

  return (
    <Shell>
      <ModernSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        variant={user?.role === 'admin' ? 'admin' : 'cashier'}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      
      {/* Floating Content Area dynamically offset */}
      <div className={`${paddingLeftClass} flex flex-col min-h-screen transition-[padding-left] duration-200 ease-out`}>
        <TopNavBar
          onMenuClick={() => setSidebarOpen(true)}
          isSidebarOpen={sidebarOpen}
        />
        <main id="main-content" className="flex-1 pb-12 safe-area-padding">
          <div className="app-shell app-shell--wide">
            <Outlet />
          </div>
        </main>
      </div>
    </Shell>
  );
}
