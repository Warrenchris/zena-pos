import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';

export default function PlatformLayout({ children }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Platform Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white shadow-md shadow-blue-500/20">
              ⚡
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">Zana POS</span>
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
                Platform
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/platform" end className={navLinkClass}>
              Overview
            </NavLink>
            <NavLink to="/platform/organizations" className={navLinkClass}>
              Organizations
            </NavLink>
            <NavLink to="/platform/plans" className={navLinkClass}>
              Plans
            </NavLink>
            <NavLink to="/platform/invoices" className={navLinkClass}>
              Invoices
            </NavLink>
            <NavLink to="/platform/notifications" className={navLinkClass}>
              Notifications
            </NavLink>
          </nav>

          {/* Operator Profile & Logout */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200">{user?.name || 'Super Admin'}</span>
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[160px]">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children || <Outlet />}
      </main>
    </div>
  );
}
