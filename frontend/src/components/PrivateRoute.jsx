import { Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser, logout, CONNECTIVITY_ERROR } from '../store/slices/authSlice';
import ConnectionProblem from './ConnectionProblem';

export default function PrivateRoute({ children }) {
  const dispatch = useDispatch();
  const { token, user, loading, error } = useSelector((state) => state.auth);
  const [attempt, setAttempt] = useState(0);
  const location = useLocation();
  const authCheckRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Tri-state: true while we have a token but haven't verified the session yet.
  // Only set false once getCurrentUser() settles (success or failure).
  const [initializing, setInitializing] = useState(Boolean(token) && !user);

  useEffect(() => {
    const checkAuth = async () => {
      // Only check auth once and when we have a token but no user
      if (!authCheckRef.current && token && !user) {
        authCheckRef.current = true;
        try {
          await dispatch(getCurrentUser()).unwrap();
        } catch (error) {
          console.error('Auth check failed:', error);
          if (isMountedRef.current && error === 'Your session has expired. Please sign in again.') {
            localStorage.removeItem('token');
          }
        } finally {
          if (isMountedRef.current) {
            setInitializing(false);
          }
        }
      }
    };

    checkAuth();
  }, [token, user, dispatch, attempt]);

  // The server can't be reached but the sign-in is still valid: wait here instead of bouncing to /login
  // (which would bounce straight back and loop).
  const connectivityProblem = Boolean(token) && !user && error === CONNECTIVITY_ERROR;

  const retryCheck = useCallback(() => {
    authCheckRef.current = false;
    setInitializing(true);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!connectivityProblem) return undefined;
    window.addEventListener('online', retryCheck);
    return () => window.removeEventListener('online', retryCheck);
  }, [connectivityProblem, retryCheck]);

  // No token at all — genuinely logged out, redirect immediately (no spinner)
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show loading state while we're initializing or actively fetching user data
  if (initializing || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
    
  if (connectivityProblem) {
    return <ConnectionProblem onRetry={retryCheck} onSignOut={() => dispatch(logout())} />;
  }

  // Session verified but no user (expired/invalid token) — redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}