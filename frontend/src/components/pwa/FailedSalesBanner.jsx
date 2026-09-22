import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useCurrency from '../../hooks/useCurrency';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { listQueue, removeEntry, subscribeQueue } from '../../offline/salesQueue';
import { flushSales, requeueEntry } from '../../offline/salesSync';

const formatWhen = (ms) => {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

/**
 * Offline sales the server refused (out of stock, invalid data, ...). They are kept, never dropped,
 * and shown here so a person can retry or discard each one.
 */
export default function FailedSalesBanner() {
  const userId = useSelector((state) => state.auth.user?.id);
  const { format: formatMoney } = useCurrency();
  const [failed, setFailed] = useState([]);
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  // While a retry is in flight the sale is briefly "pending" again; keep showing it as it was.
  const lastShown = useRef([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setFailed([]);
      return;
    }
    try {
      const entries = await listQueue(userId);
      setFailed(entries.filter((entry) => entry.status === 'failed'));
    } catch {
      setFailed([]);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    return subscribeQueue(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!retryingId) lastShown.current = failed;
  }, [failed, retryingId]);

  useEffect(() => {
    if (failed.length === 0 && !retryingId) setOpen(false);
  }, [failed.length, retryingId]);

  const retry = async (entry) => {
    setRetryingId(entry.id);
    try {
      await requeueEntry(entry);
      await flushSales({ cashierId: userId, api });
    } finally {
      setRetryingId(null);
      refresh();
    }
  };

  const discard = async (entry) => {
    await removeEntry(entry);
    setConfirmingId(null);
  };

  const shown = retryingId ? lastShown.current : failed;
  if (!userId || shown.length === 0) return null;

  return (
    <>
      <div
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] flex items-center gap-3 rounded-2xl border border-danger-border bg-surface px-4 py-3 shadow-lg"
      >
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger-text" aria-hidden="true" />
        <p className="text-caption text-text-primary">
          <span className="font-semibold">
            {shown.length} offline sale{shown.length === 1 ? ' was' : 's were'} refused by the server.
          </span>{' '}
          Someone needs to check {shown.length === 1 ? 'it' : 'them'}.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Review
        </Button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Offline sales that need attention"
        description="These sales were completed at the till while offline, but the server refused them. Nothing has been deleted."
        size="lg"
      >
        <ul className="space-y-3">
          {shown.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border-default p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-small font-semibold text-text-primary">
                  {formatMoney(entry.saleData?.total ?? entry.saleData?.totalAmount ?? 0)}
                  <span className="font-normal text-text-secondary">
                    {' '}
                    · {entry.saleData?.items?.length ?? 0} item(s) · {entry.saleData?.customer?.name || 'Walk-in customer'}
                  </span>
                </p>
                <p className="text-caption text-text-muted">{formatWhen(entry.queuedAt)}</p>
              </div>
              <p className="text-caption text-danger-text">{entry.lastError || 'Refused by the server'}</p>
              <div className="flex gap-2 justify-end">
                {confirmingId === entry.id ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                      Keep it
                    </Button>
                    <Button type="button" variant="danger" size="sm" onClick={() => discard(entry)}>
                      Yes, discard this sale
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingId(entry.id)}>
                      Discard
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={retryingId === entry.id}
                      disabled={Boolean(retryingId)}
                      onClick={() => retry(entry)}
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
