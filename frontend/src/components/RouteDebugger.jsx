import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getRouteInfo } from '../utils/routeValidator';
import { bustCache } from '../utils/cacheBuster';
import { clearAllCaches, forceReload } from '../utils/forceReload';
import { testRouteAccess } from '../utils/routeTest';

const RouteDebugger = () => {
  const location = useLocation();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const routeInfo = getRouteInfo(location.pathname);
      const isRouteValid = testRouteAccess(location.pathname);
      
      console.log('🔍 Route Debug Info:', routeInfo);
      console.log('Current pathname:', location.pathname);
      console.log('Current search:', location.search);
      console.log('Current hash:', location.hash);
      console.log('Current state:', location.state);
      console.log('Route valid:', isRouteValid);
    }
  }, [location]);

  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-50 max-w-xs">
      <div className="font-mono">
        <div>Path: {location.pathname}</div>
        <div>Search: {location.search || 'none'}</div>
        <div>Hash: {location.hash || 'none'}</div>
        <div className="flex gap-1">
          <button 
            onClick={bustCache}
            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
          >
            Clear Cache
          </button>
          <button 
            onClick={clearAllCaches}
            className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
          >
            Clear All
          </button>
          <button 
            onClick={forceReload}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            Force Reload
          </button>
        </div>
      </div>
    </div>
  );
};

export default RouteDebugger;
