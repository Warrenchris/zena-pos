import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  FiHome,
  FiBox,
  FiShoppingBag,
  FiUsers,
  FiBarChart2,
  FiSettings,
} from 'react-icons/fi';

const NavItem = ({ icon: Icon, children, to, isActive }) => {
  return (
    <Link
      to={to}
      className={`mx-4 flex items-center p-4 rounded-lg group cursor-pointer transition-colors
        ${isActive 
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-200' 
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
      {Icon && (
        <Icon
          className={`mr-4 text-base group-hover:text-blue-600 dark:group-hover:text-blue-200
            ${isActive ? 'text-blue-600 dark:text-blue-200' : 'text-gray-600 dark:text-gray-400'}`}
        />
      )}
      {children}
    </Link>
  );
};

const Sidebar = () => {
  const location = useLocation();
  const user = useSelector(state => state.auth.user);
  const isCashier = user?.role === 'cashier';

  return (
    <nav className="fixed top-0 left-0 h-screen w-60 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="flex flex-col gap-1 py-5">
        <div className="px-4 mb-6">
          <h1 className="text-lg font-bold">
            Zana POS
          </h1>
        </div>

        <NavItem
          icon={FiHome}
          to="/dashboard"
          isActive={location.pathname === '/dashboard'}
        >
          Dashboard
        </NavItem>

        {isCashier ? (
          <>
            <NavItem
              icon={FiBox}
              to="/products"
              isActive={location.pathname === '/products'}
            >
              Products
            </NavItem>
            <NavItem
              icon={FiShoppingBag}
              to="/my-sales"
              isActive={location.pathname === '/my-sales'}
            >
              My Sales
            </NavItem>
          </>
        ) : (
          <>
            <NavItem
              icon={FiBox}
              to="/products"
              isActive={location.pathname === '/products'}
            >
              Products
            </NavItem>
            <NavItem
              icon={FiUsers}
              to="/customers"
              isActive={location.pathname === '/customers'}
            >
              Customers
            </NavItem>
            <NavItem
              icon={FiShoppingBag}
              to="/sales"
              isActive={location.pathname === '/sales'}
            >
              Sales
            </NavItem>
            <NavItem
              icon={FiBarChart2}
              to="/reports"
              isActive={location.pathname === '/reports'}
            >
              Reports
            </NavItem>
          </>
        )}

        <div className="my-6 border-t border-gray-200 dark:border-gray-700" />

        <NavItem
          icon={FiSettings}
          to="/settings"
          isActive={location.pathname === '/settings'}
        >
          Settings
        </NavItem>
      </div>
    </nav>
  );
};

export default Sidebar;