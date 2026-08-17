import React, { useState, useEffect } from 'react';
import { permissionsAPI } from '../services/api';
import {
  ShieldCheckIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const CRITICAL_ADMIN_PERMISSIONS = ['manage_settings', 'manage_users'];

export default function RolePermissionMatrix() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [roles, setRoles] = useState(['admin', 'manager', 'cashier']);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [originalMatrix, setOriginalMatrix] = useState({});

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await permissionsAPI.getMatrix();
      if (res.data?.success) {
        setRoles(res.data.roles || ['admin', 'manager', 'cashier']);
        setPermissions(res.data.permissions || []);
        setMatrix(res.data.matrix || {});
        // Deep copy original for diffing
        setOriginalMatrix(JSON.parse(JSON.stringify(res.data.matrix || {})));
      }
    } catch (err) {
      console.error('Failed to fetch role permission matrix:', err);
      setError(err.response?.data?.error || 'Failed to load permission matrix.');
    } fontFinally: {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, []);

  const handleToggle = (role, permName) => {
    // Prevent toggling critical admin permissions in UI
    if (role === 'admin' && CRITICAL_ADMIN_PERMISSIONS.includes(permName)) {
      return;
    }

    setMatrix(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permName]: !prev[role]?.[permName]
      }
    }));
  };

  const getDiffedUpdates = () => {
    const updates = [];
    roles.forEach(role => {
      permissions.forEach(perm => {
        const currentVal = !!matrix[role]?.[perm.name];
        const origVal = !!originalMatrix[role]?.[perm.name];
        if (currentVal !== origVal) {
          updates.push({
            role,
            permissionId: perm.id,
            permissionName: perm.name,
            enabled: currentVal
          });
        }
      });
    });
    return updates;
  };

  const handleSave = async () => {
    const updates = getDiffedUpdates();
    if (updates.length === 0) {
      setSuccess('No changes to save.');
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await permissionsAPI.updateMatrix(updates);
      if (res.data?.success) {
        setMatrix(res.data.matrix || {});
        setOriginalMatrix(JSON.parse(JSON.stringify(res.data.matrix || {})));
        setSuccess(`Successfully updated ${updates.length} permission rule(s)!`);
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Failed to update matrix:', err);
      setError(err.response?.data?.error || 'Failed to update permissions matrix.');
    } finally {
      setSaving(false);
    }
  };

  const diffCount = getDiffedUpdates().length;

  if (loading) {
    return (
      <div className="p-8 text-center text-text-muted">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-small font-medium">Loading role permission matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-h3 font-bold text-text-primary flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-primary" />
            Role & Permission Matrix
          </h3>
          <p className="text-caption text-text-muted mt-0.5">
            Configure system permissions across employee roles. Changes take effect immediately.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchMatrix}
            disabled={saving}
            className="h-9 px-3.5 text-small font-semibold text-text-primary bg-surface border border-border-default rounded-xl hover:bg-surface-2 flex items-center gap-1.5 transition-all shadow-2xs"
          >
            <ArrowPathIcon className="h-4 w-4 text-text-muted" />
            Reset Matrix
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || diffCount === 0}
            className={`h-9 px-4 text-small font-semibold rounded-xl text-white bg-primary hover:bg-primary-hover active:bg-primary-active flex items-center gap-2 transition-all shadow-sm ${
              diffCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
            } ${saving ? 'opacity-50 cursor-wait' : ''}`}
          >
            <CheckIcon className="h-4 w-4 text-white" />
            {saving ? 'Saving...' : `Save ${diffCount > 0 ? `(${diffCount} Change${diffCount > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-muted border border-danger-border rounded-xl text-danger-text text-small flex items-center gap-2.5">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-success-muted border border-success-border rounded-xl text-success-text text-small flex items-center gap-3">
          <CheckIcon className="h-5 w-5 shrink-0 text-success" />
          <span>{success}</span>
        </div>
      )}

      {/* Permission Grid */}
      <div className="overflow-x-auto border border-border-default rounded-2xl bg-surface shadow-sm">
        <table className="w-full text-left text-small text-text-primary">
          <thead className="bg-surface-2 text-caption uppercase text-text-secondary font-semibold border-b border-border-default">
            <tr>
              <th scope="col" className="px-6 py-4">Permission Name & Description</th>
              {roles.map(role => (
                <th key={role} scope="col" className="px-6 py-4 text-center capitalize min-w-[120px]">
                  <span className={`px-3 py-1 rounded-full text-caption font-bold ${
                    role === 'admin'
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : role === 'manager'
                      ? 'bg-info-muted text-info-text border border-info-border'
                      : 'bg-surface-3 text-text-secondary border border-border-default'
                  }`}>
                    {role}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {permissions.map(perm => (
              <tr key={perm.id} className="hover:bg-surface-2/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-mono text-small text-primary font-semibold">{perm.name}</div>
                  <div className="text-caption text-text-muted mt-0.5">{perm.description}</div>
                </td>

                {roles.map(role => {
                  const isChecked = !!matrix[role]?.[perm.name];
                  const isProtected = role === 'admin' && CRITICAL_ADMIN_PERMISSIONS.includes(perm.name);

                  return (
                    <td key={`${role}-${perm.id}`} className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isProtected}
                        onChange={() => handleToggle(role, perm.name)}
                        title={isProtected ? 'Protected system setting permission' : ''}
                        className={`h-5 w-5 rounded-lg border-border-default text-primary focus:ring-primary/30 bg-surface cursor-pointer ${
                          isProtected ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
