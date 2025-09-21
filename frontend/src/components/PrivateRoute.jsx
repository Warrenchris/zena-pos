import { Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { getCurrentUser } from '../store/slices/authSlice';

export default function PrivateRoute({ children }) {
  const dispatch = useDispatch();
  const { token, user, loading } = useSelector((state) => state.auth);
  const location = useLocation();

  useEffect(() => {
    if (token && !user && !loading) {
      dispatch(getCurrentUser());
    }
  }, [token, user, loading, dispatch]);

  // Check both token and user
  if (!token) {
    // Clear any stale token
    localStorage.removeItem('token');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show loading while fetching user data
  if (token && !user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If we have a token but no user after loading, there's an auth error
  if (token && !user && !loading) {
    localStorage.removeItem('token');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}