// Route validation utility
import { validRoutes } from '../constants/routes';

export const validateRoute = (pathname) => {
  const isValid = validRoutes.includes(pathname);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Route Validation:');
    console.log('Path:', pathname);
    console.log('Valid:', isValid);
    if (!isValid) {
      console.log('Available routes:', validRoutes);
    }
  }

  return isValid;
};

export const getRouteInfo = (pathname) => {
  return {
    pathname,
    isValid: validateRoute(pathname),
    timestamp: new Date().toISOString()
  };
};
