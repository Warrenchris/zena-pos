import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BuildingStorefrontIcon, ArrowRightOnRectangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../services/api';
import { switchActiveShop, logout } from '../store/slices/authSlice';
import Button from './ui/Button';
import Modal from './ui/Modal';

/**
 * InactiveShopModal
 *
 * Displays a clean, blocking interface when a user encounters a 403 SHOP_INACTIVE.
 * Prevents infinite loading and eliminates raw 403 error displays.
 * Fetches available active branches via /api/shop/accessible:
 *  - If other active accessible branches exist, offers a branch switcher dropdown.
 *  - If no other branches exist, offers a sign-out button.
 */
export default function InactiveShopModal({ isOpen: controlledIsOpen, onClose }) {
  const dispatch = useDispatch();
  const currentShop = useSelector((state) => state.auth?.user?.shop);

  const [isOpen, setIsOpen] = useState(false);
  const [loadingShops, setLoadingShops] = useState(false);
  const [accessibleShops, setAccessibleShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [switching, setSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const activeModal = controlledIsOpen !== undefined ? controlledIsOpen : isOpen;

  const fetchAccessibleBranches = useCallback(async () => {
    setLoadingShops(true);
    setErrorMessage('');
    try {
      const response = await api.get('/api/shop/accessible');
      const shops = response.data?.shops || (Array.isArray(response.data) ? response.data : []);
      // /api/shop/accessible returns only active shops for non-owners
      const otherActiveShops = shops.filter((s) => s.id !== currentShop?.id);
      setAccessibleShops(otherActiveShops);
      if (otherActiveShops.length > 0) {
        setSelectedShopId(String(otherActiveShops[0].id));
      }
    } catch (_err) {
      // Never leave user in infinite loading
      setAccessibleShops([]);
    } finally {
      setLoadingShops(false);
    }
  }, [currentShop?.id]);

  useEffect(() => {
    const handleInactiveEvent = () => {
      setIsOpen(true);
      fetchAccessibleBranches();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('shop-inactive', handleInactiveEvent);
      return () => window.removeEventListener('shop-inactive', handleInactiveEvent);
    }
  }, [fetchAccessibleBranches]);

  useEffect(() => {
    if (controlledIsOpen) {
      fetchAccessibleBranches();
    }
  }, [controlledIsOpen, fetchAccessibleBranches]);

  const handleSwitch = async () => {
    if (!selectedShopId) return;
    setSwitching(true);
    setErrorMessage('');
    try {
      await dispatch(switchActiveShop(selectedShopId)).unwrap();
      setIsOpen(false);
      onClose?.();
    } catch (err) {
      setErrorMessage(typeof err === 'string' ? err : 'Failed to switch branch. Please try again.');
    } finally {
      setSwitching(false);
    }
  };

  const handleSignOut = () => {
    dispatch(logout());
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  if (!activeModal) return null;

  const hasOtherShops = accessibleShops.length > 0;

  return (
    <Modal
      isOpen={activeModal}
      onClose={() => {}}
      title="Branch Deactivated"
      description="This branch is currently deactivated and cannot process transactions or data."
      size="md"
      showCloseButton={false}
    >
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400">
          <BuildingStorefrontIcon className="w-6 h-6 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            {hasOtherShops
              ? 'Your current shop branch has been deactivated. Please switch to another active branch to continue working.'
              : 'Your current shop branch has been deactivated by the organization owner. No other active branches are available for your account.'}
          </p>
        </div>

        {loadingShops ? (
          <div className="flex items-center justify-center gap-2 py-4 text-stone-500">
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
            <span className="text-sm">Checking available branches...</span>
          </div>
        ) : (
          <>
            {hasOtherShops ? (
              <div className="space-y-2">
                <label htmlFor="inactive-shop-select" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Switch to branch:
                </label>
                <select
                  id="inactive-shop-select"
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {accessibleShops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end">
              {hasOtherShops && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSwitch}
                  disabled={switching || !selectedShopId}
                  className="w-full sm:w-auto"
                >
                  {switching ? 'Switching...' : 'Switch Branch'}
                </Button>
              )}
              <Button
                type="button"
                variant={hasOtherShops ? 'outline' : 'primary'}
                onClick={handleSignOut}
                className="w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
