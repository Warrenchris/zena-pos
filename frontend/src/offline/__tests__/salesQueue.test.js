/* eslint-env jest */
import { freshDatabase } from '../testing/testDb';
import { closeDb } from '../idb';
import {
  createEntry,
  legacyStorageKey,
  listQueue,
  migrateLegacyQueue,
  normalizeEntry,
  removeEntry,
  resetQueueBackend,
  saveEntry,
  subscribeQueue,
} from '../salesQueue';

const sale = (n = 1, extra = {}) => ({ items: [{ productId: n, quantity: 1, price: 100 }], total: 100, paymentMethod: 'cash', ...extra });

beforeEach(freshDatabase);

describe('sales queue (IndexedDB)', () => {
  it('stores a sale with its idempotency key and reads it back', async () => {
    const entry = createEntry(sale(), 7);
    await saveEntry(entry);

    const [stored] = await listQueue(7);
    expect(stored).toMatchObject({ id: entry.id, cashierId: '7', status: 'pending', attempts: 0, lastError: null });
    expect(stored.idempotencyKey).toBe(entry.id);
    expect(stored.saleData.idempotencyKey).toBe(entry.id);
    expect(stored.saleData.total).toBe(100);
  });

  it('keeps an existing idempotency key', () => {
    expect(createEntry(sale(1, { idempotencyKey: 'abc-123' }), 7).id).toBe('abc-123');
  });

  it('returns the oldest sale first and keeps each cashier’s sales separate', async () => {
    const a = { ...createEntry(sale(1), 7), queuedAt: 3000 };
    const b = { ...createEntry(sale(2), 7), queuedAt: 1000 };
    const other = createEntry(sale(3), 8);
    await Promise.all([saveEntry(a), saveEntry(b), saveEntry(other)]);

    expect((await listQueue(7)).map((e) => e.id)).toEqual([b.id, a.id]);
    expect((await listQueue(8)).map((e) => e.id)).toEqual([other.id]);
  });

  it('updates an entry in place and removes it', async () => {
    const entry = createEntry(sale(), 7);
    await saveEntry(entry);
    await saveEntry({ ...entry, status: 'failed', attempts: 2, lastError: 'Out of stock' });

    let list = await listQueue(7);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'failed', attempts: 2, lastError: 'Out of stock' });

    await removeEntry(list[0]);
    list = await listQueue(7);
    expect(list).toEqual([]);
  });

  it('survives the app being closed and reopened', async () => {
    const entry = createEntry(sale(), 7);
    await saveEntry(entry);

    await closeDb(); // like a page reload: the connection goes away, the data stays
    resetQueueBackend();

    expect((await listQueue(7)).map((e) => e.id)).toEqual([entry.id]);
  });

  it('tells subscribers when the queue changes', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeQueue(listener);
    const entry = createEntry(sale(), 7);

    await saveEntry(entry);
    await removeEntry(entry);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await saveEntry(entry);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('moving sales queued by the old localStorage version', () => {
  const legacy = (id, queuedAt = 1000) => ({ id, idempotencyKey: id, saleData: { ...sale(), idempotencyKey: id }, queuedAt });

  it('copies every old sale into IndexedDB, then removes the old key', async () => {
    window.localStorage.setItem(legacyStorageKey(7), JSON.stringify([legacy('k1', 1000), legacy('k2', 2000)]));

    expect(await migrateLegacyQueue(7)).toBe(2);

    expect((await listQueue(7)).map((e) => e.id)).toEqual(['k1', 'k2']);
    expect(window.localStorage.getItem(legacyStorageKey(7))).toBeNull();
    expect((await listQueue(7))[0]).toMatchObject({ status: 'pending', cashierId: '7' });
  });

  it('is safe to run again and never overwrites a sale already in IndexedDB', async () => {
    await saveEntry({ ...createEntry(sale(), 7), id: 'k1', idempotencyKey: 'k1', status: 'failed', lastError: 'Out of stock' });
    window.localStorage.setItem(legacyStorageKey(7), JSON.stringify([legacy('k1')]));

    await migrateLegacyQueue(7);
    await migrateLegacyQueue(7);

    const list = await listQueue(7);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'failed', lastError: 'Out of stock' });
  });

  it('does nothing when there is nothing (or garbage) to move', async () => {
    expect(await migrateLegacyQueue(7)).toBe(0);
    window.localStorage.setItem(legacyStorageKey(7), '{not json');
    expect(await migrateLegacyQueue(7)).toBe(0);
    expect(await listQueue(7)).toEqual([]);
  });
});

describe('when IndexedDB is not available', () => {
  beforeEach(() => {
    delete global.indexedDB; // e.g. blocked in a private window
    resetQueueBackend();
  });

  it('keeps sales in localStorage instead, in the old format the app always used', async () => {
    const entry = createEntry(sale(), 7);
    await saveEntry(entry);

    expect(JSON.parse(window.localStorage.getItem(legacyStorageKey(7)))).toHaveLength(1);
    expect((await listQueue(7)).map((e) => e.id)).toEqual([entry.id]);

    await removeEntry(entry);
    expect(window.localStorage.getItem(legacyStorageKey(7))).toBeNull();
  });

  it('does not try to migrate (there is nowhere to move to)', async () => {
    window.localStorage.setItem(legacyStorageKey(7), JSON.stringify([{ id: 'k1', saleData: {} }]));
    expect(await migrateLegacyQueue(7)).toBe(0);
    expect(window.localStorage.getItem(legacyStorageKey(7))).not.toBeNull();
  });
});

describe('normalizeEntry', () => {
  it('fills in the fields older entries lack', () => {
    expect(normalizeEntry({ id: 'k', saleData: { total: 5 } }, 3)).toMatchObject({
      id: 'k',
      idempotencyKey: 'k',
      cashierId: '3',
      status: 'pending',
      attempts: 0,
    });
  });
});
