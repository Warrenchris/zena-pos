import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  SunIcon,
  MoonIcon,
  Bars3Icon,
  XMarkIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  BuildingOffice2Icon,
  RectangleStackIcon,
  DocumentTextIcon,
  BellAlertIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { logout } from '../../store/slices/authSlice';
import { useTheme } from '../../providers/ThemeProvider';

export default function PlatformLayout({ children }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const navLinks = [
    { to: '/platform', label: 'Overview', end: true, icon: Squares2X2Icon },
    { to: '/platform/organizations', label: 'Organizations', end: false, icon: BuildingOffice2Icon },
    { to: '/platform/plans', label: 'Plans', end: false, icon: RectangleStackIcon },
    { to: '/platform/invoices', label: 'Invoices', end: false, icon: DocumentTextIcon },
    { to: '/platform/notifications', label: 'Notifications', end: false, icon: BellAlertIcon },
  ];

  const navLinkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-xl text-small font-medium transition-all duration-150 ${
      isActive
        ? 'bg-primary text-white shadow-sm'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
    }`;

  const mobileNavLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-body font-medium transition-colors ${
      isActive
        ? 'bg-primary text-white shadow-sm font-semibold'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
    }`;

  return (
    <div className="min-h-screen bg-app text-text-primary flex flex-col font-sans transition-colors duration-200">
      {/* Platform Navigation Header */}
      <header className="bg-surface border-b border-border-default sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand & Mobile Hamburger */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
              aria-label="Toggle platform menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Bars3Icon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
                <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center">
                <span className="font-bold text-base tracking-tight text-text-primary">Zana POS</span>
                <span className="ml-2 px-2 py-0.5 text-caption font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-md">
                  Platform
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Platform navigation">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={navLinkClass}
              >
                <link.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Operator Profile, Theme Toggle & Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-2xs"
              title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? (
                <SunIcon className="h-4 w-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
              ) : (
                <MoonIcon className="h-4 w-4 text-text-secondary transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>

            {/* Operator Info */}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-small font-semibold text-text-primary leading-tight">
                {user?.name || 'Super Admin'}
              </span>
              <span className="text-caption text-text-muted font-mono truncate max-w-[170px]">
                {user?.email}
              </span>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-secondary hover:text-text-primary text-small font-medium transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer / Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border-default bg-surface px-4 pt-3 pb-4 space-y-1 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
            <div className="px-3 py-2 mb-2 bg-surface-2 rounded-xl">
              <p className="text-small font-semibold text-text-primary">{user?.name || 'Super Admin'}</p>
              <p className="text-caption text-text-muted font-mono truncate">{user?.email}</p>
            </div>
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMobileMenuOpen(false)}
                className={mobileNavLinkClass}
              >
                <link.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-200">
        {children || <Outlet />}
      </main>
    </div>
  );
}
