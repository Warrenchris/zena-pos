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
      <div className="p-8 text-center text-white/70">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-zana-yellow mx-auto mb-3"></div>
        <p className="text-sm">Loading role permission matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheckIcon className="h-6 w-6 text-zana-yellow" />
            Role & Permission Matrix
          </h3>
          <p className="text-xs text-white/60 mt-1">
            Configure system permissions across employee roles. Changes take effect immediately.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchMatrix}
            disabled={saving}
            className="px-3 py-2 text-sm font-medium text-white/80 hover:text-white bg-black/40 border border-zana-borderTint rounded-md flex items-center gap-1 hover:bg-black/60"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reset Matrix
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || diffCount === 0}
            className={`px-4 py-2 text-sm font-semibold rounded-md text-black bg-zana-yellow hover:bg-zana-yellow/90 flex items-center gap-2 transition-opacity ${
              diffCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
            } ${saving ? 'opacity-50 cursor-wait' : ''}`}
          >
            <CheckIcon className="h-4 w-4 text-black" />
            {saving ? 'Saving...' : `Save ${diffCount > 0 ? `(${diffCount} Change${diffCount > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/50 rounded-md text-red-300 text-sm flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-950/40 border border-green-500/50 rounded-md text-green-300 text-sm flex items-center gap-2">
          <CheckIcon className="h-5 w-5 shrink-0 text-green-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Permission Grid */}
      <div className="overflow-x-auto border border-zana-borderTint rounded-lg bg-black/40">
        <table className="w-full text-left text-sm text-white">
          <thead className="bg-black/60 text-xs uppercase text-zana-yellow font-semibold border-b border-zana-borderTint">
            <tr>
              <th scope="col" className="px-6 py-4">Permission Name & Description</th>
              {roles.map(role => (
                <th key={role} scope="col" className="px-6 py-4 text-center capitalize min-w-[120px]">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    role === 'admin'
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-500/30'
                      : role === 'manager'
                      ? 'bg-blue-900/60 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-300 border border-gray-600/30'
                  }`}>
                    {role}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zana-borderTint/50">
            {permissions.map(perm => (
              <tr key={perm.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-mono text-sm text-zana-yellow font-medium">{perm.name}</div>
                  <div className="text-xs text-white/50">{perm.description}</div>
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
                        className={`h-5 w-5 rounded border-gray-600 bg-gray-800 text-zana-yellow focus:ring-zana-yellow cursor-pointer ${
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
