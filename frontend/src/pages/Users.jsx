import { Navigate } from 'react-router-dom';

/**
 * Legacy Users page has been deprecated in favor of the authoritative Employees staff management page.
 */
export default function Users() {
  return <Navigate to="/employees" replace />;
}
