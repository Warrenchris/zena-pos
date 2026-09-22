import React, { useEffect, useRef } from 'react';
import { useSelector, useStore } from 'react-redux';
import api from '../services/api';
import useOnlineStatus from '../hooks/useOnlineStatus';
import ConnectionBanner from './pwa/ConnectionBanner';
import FailedSalesBanner from './pwa/FailedSalesBanner';
import PwaUpdatePrompt from './pwa/PwaUpdatePrompt';
import { clearCatalogs, shopKeyFor, syncCatalog } from '../offline/catalog';
import { installCatalogFallback } from '../offline/catalogFallback';
import { listQueue } from '../offline/salesQueue';
import { flushSales, hasQueueOwner } from '../offline/salesSync';

const CATALOG_FIRST_SYNC_DELAY_MS = 5000; // let the screen finish loading first
const CATALOG_RECHECK_MS = 30 * 60 * 1000; // syncCatalog itself skips if the copy is still fresh
const SALES_RETRY_MS = 60 * 1000;

/**
 * App-wide offline support, mounted once. Does nothing visible while everything is normal.
 *
 *  - offline notice, "new version" prompt, and the review list for refused offline sales
 *  - keeps a copy of the shop's product list on the device and answers product searches from it when the
 *    server can't be reached
 *  - sends queued offline sales in the background when the cashier dashboard (which normally does it) isn't open
 *  - wipes the product copy at sign-out (queued sales are never wiped: they are money not yet recorded)
 */
export default function OfflineSupport() {
  const store = useStore();
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const shop = useSelector((state) => state.auth.shop);
  const online = useOnlineStatus();
  const userId = user?.id;
  const shopKey = shopKeyFor(shop, user);

  // Product searches fall back to the local copy when the server can't be reached.
  useEffect(
    () =>
      installCatalogFallback(api, () => {
        const { auth } = store.getState();
        return shopKeyFor(auth.shop, auth.user);
      }),
    [store]
  );

  // Signing out removes the product copy. (A dropped connection doesn't clear the token, so it can't trigger this.)
  const previousToken = useRef(token);
  useEffect(() => {
    if (previousToken.current && !token) clearCatalogs().catch(() => {});
    previousToken.current = token;
  }, [token]);

  // Keep the product copy up to date while online.
  useEffect(() => {
    if (!token || !userId || !shopKey || !online) return undefined;
    let cancelled = false;
    const run = () => syncCatalog({ api, shopKey, isCancelled: () => cancelled });
    const first = setTimeout(run, CATALOG_FIRST_SYNC_DELAY_MS);
    const interval = setInterval(run, CATALOG_RECHECK_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [token, userId, shopKey, online]);

  // Send queued sales when nothing else is doing it.
  useEffect(() => {
    if (!token || !userId) return undefined;
    let stopped = false;
    const run = async () => {
      if (stopped || hasQueueOwner() || navigator.onLine === false) return;
      try {
        const pending = (await listQueue(userId)).filter((entry) => entry.status === 'pending');
        if (pending.length === 0) return;
        const summary = await flushSales({ cashierId: userId, api });
        if (!summary.joined && summary.synced > 0) {
          window.showToast?.({
            type: 'success',
            title: 'Offline sales synced',
            message: `Sent ${summary.synced} offline sale(s) to the server.`,
          });
        }
      } catch (error) {
        console.warn('Background sales sync failed:', error);
      }
    };
    run();
    window.addEventListener('online', run);
    const timer = setInterval(run, SALES_RETRY_MS);
    return () => {
      stopped = true;
      window.removeEventListener('online', run);
      clearInterval(timer);
    };
  }, [token, userId]);

  return (
    <>
      <ConnectionBanner />
      <PwaUpdatePrompt />
      <FailedSalesBanner />
    </>
  );
}
