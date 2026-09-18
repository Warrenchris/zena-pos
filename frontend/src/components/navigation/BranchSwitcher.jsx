import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import {
  BuildingStorefrontIcon,
  ChevronDownIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { fetchMyShop, fetchAccessibleShops, clearShopError } from '../../store/slices/shopSlice';
import { switchActiveShop } from '../../store/slices/authSlice';
import { useEntitlement, useQuota } from '../../hooks/useEntitlement';
import CreateBranchModal from '../CreateBranchModal';
import { useToast } from '../Toast';

export default function BranchSwitcher({
  variant = 'topbar',
  className = '',
  onSwitch,
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  let toast;
  try {
    toast = useToast();
  } catch (_) {
    toast = null;
  }

  const showToast = (opts) => {
    if (toast?.showToast) {
      toast.showToast(opts);
    } else if (typeof window !== 'undefined' && window.showToast) {
      window.showToast(opts);
    }
  };

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [switchingShopId, setSwitchingShopId] = useState(null);

  const user = useSelector((state) => state.auth?.user);
  const authShop = useSelector((state) => state.auth?.shop);
  const { shop, loading, accessibleShops = [], switching = false, error: shopError } = useSelector(
    (state) => state.shop || {}
  );

  const currentShop = shop || authShop || (user?.shop ? { name: user.shop.name } : null);
  const hasFetchedShopRef = useRef(false);

  // Only the primary 'topbar' variant triggers initial mount fetches.
  // The 'sidebar' variant purely reads the already-fetched Redux state.
  useEffect(() => {
    if (variant !== 'topbar') return;
    if (hasFetchedShopRef.current) return;
    if (user && !authShop && !shop && !loading) {
      hasFetchedShopRef.current = true;
      dispatch(fetchMyShop());
    }
  }, [dispatch, authShop, shop, loading, user, variant]);

  useEffect(() => {
    if (variant !== 'topbar') return;
    if (user && accessibleShops.length === 0) {
      dispatch(fetchAccessibleShops());
    }
  }, [dispatch, user, accessibleShops.length, variant]);

  const handleSwitcherClick = () => {
    if (user) {
      dispatch(fetchAccessibleShops({ force: true }));
    }
  };

  const handleSwitchShop = async (targetShopId) => {
    if (switching || switchingShopId) return;
    setSwitchingShopId(targetShopId);
    try {
      if (onSwitch) onSwitch(targetShopId);
      await dispatch(switchActiveShop(targetShopId)).unwrap();
    } catch (err) {
      console.error('Failed to switch active shop:', err);
    } finally {
      setSwitchingShopId(null);
    }
  };

  useEffect(() => {
    if (shopError) {
      const message =
        typeof shopError === 'string'
          ? shopError
          : shopError?.message || shopError?.error || 'Failed to perform shop operation.';

      showToast({
        type: 'error',
        title: 'Branch Error',
        message,
      });

      dispatch(clearShopError());
    }
  }, [shopError, dispatch]);

  const canCreateBranch = user?.orgRole === 'owner' || user?.orgRole === 'admin';
  const { allowed: hasMultiShop, loading: entitlementLoading } = useEntitlement('multi_shop');
  const { allowed: hasShopQuota, current: shopCount, limit: shopLimit } = useQuota('shops');

  const isBranchLocked = !entitlementLoading && (!hasMultiShop || !hasShopQuota);
  const branchLockReason = !hasMultiShop
    ? 'Multi-branch feature requires Growth plan or higher'
    : !hasShopQuota
    ? `Branch limit reached (${shopCount}/${shopLimit}). Upgrade to add more.`
    : null;

  // Visibility logic per Phase 5 requirements:
  // Visible as interactive switcher only when:
  // 1. multi_shop entitlement is allowed, OR
  // 2. user has more than 1 shop in accessibleShops (e.g. grandfathered / downgraded orgs)
  const canSwitch = Boolean(hasMultiShop || accessibleShops.length > 1);

  const displayShops = accessibleShops.length > 0
    ? accessibleShops
    : (currentShop ? [{ ...currentShop, isCurrent: true }] : []);

  // When multi_shop is not available and there's <= 1 shop: render static badge
  if (!canSwitch) {
    if (variant === 'sidebar') {
      return (
        <div
          className={`w-full flex items-center gap-2.5 px-3 py-2 border border-border-default/60 rounded-xl bg-surface-2/40 text-text-secondary text-small font-medium select-none ${className}`}
          title={`Active Branch: ${currentShop?.name || 'My Store'}`}
        >
          <BuildingStorefrontIcon className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider leading-none mb-0.5">
              Active Branch
            </p>
            <p className="text-small font-semibold text-text-primary truncate leading-tight">
              {currentShop?.name || 'My Store'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`h-9 flex items-center gap-2 px-3 border border-border-default rounded-xl bg-surface-2/40 text-text-secondary text-small font-medium select-none shadow-2xs ${className}`}
        title={`Active Branch: ${currentShop?.name || 'My Store'}`}
      >
        <BuildingStorefrontIcon className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
        <span className="max-w-[130px] truncate font-medium text-text-primary">
          {currentShop?.name || 'My Store'}
        </span>
      </div>
    );
  }

  // Interactive Switcher Dropdown
  const isSidebar = variant === 'sidebar';

  return (
    <>
      <div className={`relative ${isSidebar ? 'w-full' : ''} ${className}`}>
        <Menu as="div" className="relative w-full">
          <Menu.Button
            disabled={switching}
            onClick={handleSwitcherClick}
            className={
              isSidebar
                ? `w-full h-10 flex items-center justify-between px-3 border border-border-default rounded-xl bg-surface hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-text-primary transition-all duration-150 text-small font-medium shadow-2xs ${
                    switching ? 'opacity-75 cursor-not-allowed' : ''
                  }`
                : `h-9 flex items-center gap-2 px-3 border border-border-default rounded-xl bg-surface hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-text-primary transition-all duration-150 text-small font-medium shadow-2xs ${
                    switching ? 'opacity-75 cursor-not-allowed' : ''
                  }`
            }
            aria-label="Switch store workspace"
          >
            <div className="flex items-center gap-2 truncate">
              <BuildingStorefrontIcon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className={isSidebar ? 'truncate font-medium' : 'max-w-[130px] truncate font-medium'}>
                {switching
                  ? 'Switching...'
                  : loading && !currentShop
                  ? 'Loading...'
                  : currentShop?.name || 'My Store'}
              </span>
            </div>
            <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
          </Menu.Button>

          <Transition
            enter="transition duration-150 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-100 ease-in"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Menu.Items
              className={`absolute mt-2 w-72 rounded-2xl bg-surface border border-border-default shadow-modal p-1.5 z-50 focus:outline-none ${
                isSidebar ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
              }`}
            >
              <div className="px-3.5 py-2.5 border-b border-border-default mb-1">
                <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">
                  Branches & Workspaces
                </p>
                <p className="text-small font-semibold text-text-primary mt-0.5 truncate">
                  {currentShop?.name || 'Default Store'}
                </p>
              </div>

              {/* List of Accessible Shops */}
              <div className="max-h-60 overflow-y-auto space-y-0.5 py-1">
                {displayShops.map((s) => {
                  const isCurrent = Boolean(
                    s.isCurrent || (currentShop && s.id === currentShop.id)
                  );
                  const isTargetSwitching = switchingShopId === s.id;
                  return (
                    <Menu.Item key={s.id} disabled={isCurrent || switching}>
                      {({ active }) => (
                        <button
                          type="button"
                          onClick={() => !isCurrent && handleSwitchShop(s.id)}
                          disabled={isCurrent || switching}
                          className={`w-full text-left px-3 py-2 text-small rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                            isCurrent
                              ? 'bg-primary/10 text-primary font-semibold cursor-default'
                              : active
                              ? 'bg-surface-2 text-text-primary'
                              : 'text-text-secondary hover:text-text-primary'
                          } ${switching && !isTargetSwitching ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <BuildingStorefrontIcon
                              className={`h-4 w-4 shrink-0 ${
                                isCurrent ? 'text-primary' : 'text-text-muted'
                              }`}
                            />
                            <span className="truncate">{s.name}</span>
                          </div>
                          {isCurrent && (
                            <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          )}
                          {isTargetSwitching && (
                            <span className="text-[11px] text-primary font-medium animate-pulse">
                              Switching...
                            </span>
                          )}
                        </button>
                      )}
                    </Menu.Item>
                  );
                })}
              </div>

              {/* Add Branch Action (Owner / Admin only) */}
              {canCreateBranch && (
                <div className="pt-1 border-t border-border-default mt-1">
                  <Menu.Item disabled={switching}>
                    {({ active }) => (
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isBranchLocked) {
                              navigate('/billing');
                            } else {
                              setIsBranchModalOpen(true);
                            }
                          }}
                          disabled={switching}
                          className={`w-full text-left px-3 py-2 text-small rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                            isBranchLocked
                              ? 'text-text-muted hover:bg-surface-2 hover:text-text-secondary cursor-pointer'
                              : active
                              ? 'bg-surface-2 text-primary font-semibold'
                              : 'text-text-primary font-medium'
                          } ${switching ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title={branchLockReason || 'Add a new branch'}
                        >
                          <div className="flex items-center gap-2.5">
                            <PlusIcon
                              className={`h-4 w-4 shrink-0 ${
                                isBranchLocked ? 'text-text-muted' : 'text-primary'
                              }`}
                            />
                            <span>Add Branch</span>
                          </div>
                          {isBranchLocked && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <SparklesIcon className="h-3 w-3" />
                              Upgrade
                            </span>
                          )}
                        </button>
                        {isBranchLocked && branchLockReason && (
                          <p className="px-3 pb-1 text-[11px] text-text-muted leading-tight">
                            {branchLockReason}
                          </p>
                        )}
                      </div>
                    )}
                  </Menu.Item>
                </div>
              )}
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {/* Create Branch Modal */}
      {isBranchModalOpen && (
        <CreateBranchModal
          isOpen={isBranchModalOpen}
          onClose={() => setIsBranchModalOpen(false)}
        />
      )}
    </>
  );
}
