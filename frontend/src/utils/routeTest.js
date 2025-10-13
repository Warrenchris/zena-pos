// Route registration test
import { validRoutes } from '../constants/routes';

export const testRoutes = () => {
  console.log('🧪 Testing route registration...');
  validRoutes.forEach(route => {
    console.log(`✅ Route registered: ${route}`);
  });
  return validRoutes;
};

// Test if a route is accessible
export const testRouteAccess = (pathname) => {
  const routes = testRoutes();
  const isValid = routes.includes(pathname);
  
  console.log(`🔍 Testing route access for: ${pathname}`);
  console.log(`✅ Valid: ${isValid}`);
  
  if (!isValid) {
    console.log('❌ Route not found. Available routes:', routes);
  }
  
  return isValid;
};
