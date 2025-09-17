import { Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { getCurrentUser } from '../store/slices/authSlice';

export default function PrivateRoute({ children }) {
  const dispatch = useDispatch();
  const { token, user } = useSelector((state) => state.auth);
  const location = useLocation();

  useEffect(() => {
    if (token && !user) {
      dispatch(getCurrentUser());
    }
  }, [token, user, dispatch]);

  // Check both token and user
  if (!token) {
    // Clear any stale token
    localStorage.removeItem('token');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}