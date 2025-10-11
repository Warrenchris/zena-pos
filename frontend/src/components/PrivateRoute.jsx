import { Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useRef } from 'react';
import { getCurrentUser } from '../store/slices/authSlice';

export default function PrivateRoute({ children }) {
  const dispatch = useDispatch();
  const { token, user, loading } = useSelector((state) => state.auth);
  const location = useLocation();
  const authCheckRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      // Only check auth once and when we have a token but no user
      if (!authCheckRef.current && token && !user && !loading) {
        authCheckRef.current = true;
        try {
          await dispatch(getCurrentUser()).unwrap();
        } catch (error) {
          console.error('Auth check failed:', error);
          if (mounted && error === 'Your session has expired. Please sign in again.') {
            localStorage.removeItem('token');
          }
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [token, user, loading, dispatch]);

  // Show loading state while we're fetching user data
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
    
  // Redirect to login if there's no token or no user data
  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}