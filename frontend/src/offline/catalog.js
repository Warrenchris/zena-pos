import { STORES, idbClear, idbGet, idbPut, isIndexedDbAvailable } from './idb';

/**
 * Offline product catalog.
 *
 * While online, the product list for the current shop is copied to the device (IndexedDB).
 * If the server can't be reached, product searches and barcode scans are answered from that copy
 * (see catalogFallback.js), so the till can keep selling. Stock levels in the copy are as of the
 * last sync. The copy is per shop and is wiped when the user signs out.
 */

export const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000; // re-sync at most every 6 hours
const PAGE_SIZE = 100; // the server's maximum
const MAX_PAGES = 200; // safety cap: 20,000 products
const PAGE_DELAY_MS = 150; // be gentle with the API's rate limit

export const shopKeyFor = (shop, user) => {
  const id = shop?.id ?? user?.shopId;
  return id === undefined || id === null || id === '' ? null : String(id);
};

export async function loadCatalog(shopKey) {
  if (!shopKey || !isIndexedDbAvailable()) return null;
  return (await idbGet(STORES.catalog, shopKey)) || null;
}

export async function saveCatalog(shopKey, products, now = Date.now()) {
  const record = { key: shopKey, syncedAt: now, count: products.length, products };
  await idbPut(STORES.catalog, record);
  return record;
}

export async function clearCatalogs() {
  if (!isIndexedDbAvailable()) return;
  await idbClear(STORES.catalog);
}

export const isFresh = (record, now = Date.now(), maxAge = CATALOG_MAX_AGE_MS) =>
  Boolean(record) && now - record.syncedAt < maxAge;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let syncing = null;

/**
 * Download the shop's whole product list, page by page, and store it. All or nothing: a failure
 * part-way keeps the previous copy. Only one sync runs at a time.
 *
 * @returns {Promise<{status: 'skipped'|'synced'|'failed'|'cancelled', count?: number, error?: string}>}
 */
export function syncCatalog({ api, shopKey, force = false, isCancelled = () => false, sleep = defaultSleep, now = Date.now } = {}) {
  if (!api || !shopKey) return Promise.resolve({ status: 'skipped' });
  if (syncing) return syncing;

  syncing = (async () => {
    try {
      if (!force && isFresh(await loadCatalog(shopKey), now())) return { status: 'skipped' };

      const products = [];
      let totalPages = 1;
      for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page += 1) {
        if (isCancelled()) return { status: 'cancelled' };
        // skipOfflineCatalog: a sync must never be answered from the very copy it is refreshing.
        const response = await api.get('/api/products', {
          params: { page, pageSize: PAGE_SIZE },
          skipOfflineCatalog: true,
        });
        const data = response?.data || {};
        if (!Array.isArray(data.products)) throw new Error('Unexpected product list response');
        products.push(...data.products);
        totalPages = Number(data.pagination?.totalPages) || 1;
        if (page < totalPages) await sleep(PAGE_DELAY_MS);
      }
      if (isCancelled()) return { status: 'cancelled' };

      await saveCatalog(shopKey, products, now());
      return { status: 'synced', count: products.length };
    } catch (error) {
      return { status: 'failed', error: (error && error.message) || String(error) };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

const norm = (value) => String(value ?? '').toLowerCase();

/**
 * Answer a product list request from the local copy, in the same shape the server uses:
 * { products, searchType, pagination: { currentPage, totalPages, total } }.
 * Supports `search` (every word must appear in the name, SKU or barcode), `categoryId`, `page` and `pageSize`.
 */
export function searchProducts(products, params = {}) {
  const { search, categoryId } = params;
  const pageSize = Math.min(Math.max(parseInt(params.pageSize, 10) || 12, 1), PAGE_SIZE);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);

  let list = products;

  if (categoryId !== undefined && categoryId !== null && categoryId !== '' && categoryId !== 'all') {
    list = list.filter((p) => String(p.categoryId ?? p.category?.id ?? '') === String(categoryId));
  }

  const query = norm(search).trim();
  if (query) {
    const words = query.split(/\s+/);
    const ranked = [];
    list.forEach((product) => {
      const name = norm(product.name);
      const sku = norm(product.sku);
      const barcode = norm(product.barcode);
      const haystack = `${name} ${sku} ${barcode}`;
      if (!words.every((word) => haystack.includes(word))) return;
      // exact barcode/SKU first (what a scanner sends), then names starting with the query, then the rest
      const rank = barcode === query || sku === query ? 0 : name.startsWith(query) ? 1 : 2;
      ranked.push({ product, rank, name });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    list = ranked.map((r) => r.product);
  }

  const total = list.length;
  const start = (page - 1) * pageSize;
  return {
    products: list.slice(start, start + pageSize),
    searchType: 'offline',
    pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / pageSize)), total },
    offline: true,
  };
}
