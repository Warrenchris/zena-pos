/* eslint-env jest */
import { freshDatabase } from '../testing/testDb';
import {
  CATALOG_MAX_AGE_MS,
  clearCatalogs,
  isFresh,
  loadCatalog,
  saveCatalog,
  searchProducts,
  shopKeyFor,
  syncCatalog,
} from '../catalog';

const product = (id, name, extra = {}) => ({ id, name, sku: `SKU${id}`, barcode: `600${id}`, price: 100 + id, stock: 5, categoryId: 1, ...extra });
const CATALOG = [
  product(1, 'Sugar 1kg'),
  product(2, 'Sugar Brown 2kg', { categoryId: 2 }),
  product(3, 'Unga Jogoo 2kg', { categoryId: 2 }),
  product(4, 'Brookside Milk 500ml', { categoryId: 3 }),
  product(5, 'Milk Powder', { categoryId: 3, sku: 'MILKPOW', barcode: '6009999' }),
];

beforeEach(freshDatabase);

describe('shopKeyFor', () => {
  it('prefers the shop, falls back to the user’s shop, and is null when unknown', () => {
    expect(shopKeyFor({ id: 4 }, { shopId: 9 })).toBe('4');
    expect(shopKeyFor(null, { shopId: 9 })).toBe('9');
    expect(shopKeyFor(null, null)).toBeNull();
    expect(shopKeyFor({ id: '' }, {})).toBeNull();
  });
});

describe('storing the catalog', () => {
  it('saves and loads a per-shop copy, and clears every shop’s copy', async () => {
    await saveCatalog('1', CATALOG, 5000);
    await saveCatalog('2', [product(9, 'Other shop item')], 5000);

    expect(await loadCatalog('1')).toMatchObject({ key: '1', syncedAt: 5000, count: 5 });
    expect((await loadCatalog('2')).products[0].name).toBe('Other shop item');
    expect(await loadCatalog('3')).toBeNull();
    expect(await loadCatalog(null)).toBeNull();

    await clearCatalogs();
    expect(await loadCatalog('1')).toBeNull();
    expect(await loadCatalog('2')).toBeNull();
  });

  it('treats a copy as fresh for 6 hours', () => {
    expect(isFresh({ syncedAt: 1000 }, 1000 + CATALOG_MAX_AGE_MS - 1)).toBe(true);
    expect(isFresh({ syncedAt: 1000 }, 1000 + CATALOG_MAX_AGE_MS)).toBe(false);
    expect(isFresh(null)).toBe(false);
  });
});

describe('syncCatalog', () => {
  const pagesApi = (pages, { failOn } = {}) => ({
    get: jest.fn(async (url, config) => {
      const page = config.params.page;
      if (page === failOn) throw new Error('Network Error');
      return { data: { products: pages[page - 1], pagination: { currentPage: page, totalPages: pages.length, total: 99 } } };
    }),
  });
  const noSleep = () => Promise.resolve();

  it('downloads every page (100 per page) and stores them together', async () => {
    const api = pagesApi([CATALOG.slice(0, 2), CATALOG.slice(2, 4), CATALOG.slice(4)]);

    const result = await syncCatalog({ api, shopKey: '1', sleep: noSleep });

    expect(result).toEqual({ status: 'synced', count: 5 });
    expect(api.get.mock.calls.map((c) => c[1].params)).toEqual([
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
      { page: 3, pageSize: 100 },
    ]);
    expect((await loadCatalog('1')).products.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks its own requests so the offline fallback never answers them from the copy being refreshed', async () => {
    const api = pagesApi([CATALOG]);
    await syncCatalog({ api, shopKey: '1', sleep: noSleep });
    expect(api.get.mock.calls[0][1].skipOfflineCatalog).toBe(true);
  });

  it('skips the download while the copy is fresh, unless forced', async () => {
    await saveCatalog('1', CATALOG, 10_000);
    const api = pagesApi([CATALOG]);

    expect(await syncCatalog({ api, shopKey: '1', now: () => 10_000 + 60_000 })).toEqual({ status: 'skipped' });
    expect(api.get).not.toHaveBeenCalled();

    expect((await syncCatalog({ api, shopKey: '1', now: () => 10_000 + 60_000, force: true, sleep: noSleep })).status).toBe('synced');
  });

  it('downloads again once the copy is old', async () => {
    await saveCatalog('1', [product(99, 'Old')], 0);
    const api = pagesApi([CATALOG]);
    const result = await syncCatalog({ api, shopKey: '1', now: () => CATALOG_MAX_AGE_MS + 1, sleep: noSleep });
    expect(result.status).toBe('synced');
    expect((await loadCatalog('1')).count).toBe(5);
  });

  it('keeps the previous copy if the download fails part-way (all or nothing)', async () => {
    await saveCatalog('1', [product(99, 'Old')], 0);
    const api = pagesApi([CATALOG.slice(0, 2), CATALOG.slice(2)], { failOn: 2 });

    const result = await syncCatalog({ api, shopKey: '1', now: () => CATALOG_MAX_AGE_MS + 1, sleep: noSleep });

    expect(result).toMatchObject({ status: 'failed', error: 'Network Error' });
    expect((await loadCatalog('1')).products.map((p) => p.id)).toEqual([99]);
  });

  it('rejects an unexpected response instead of storing garbage', async () => {
    const api = { get: jest.fn(async () => ({ data: { oops: true } })) };
    expect((await syncCatalog({ api, shopKey: '1', sleep: noSleep })).status).toBe('failed');
    expect(await loadCatalog('1')).toBeNull();
  });

  it('stops without saving when cancelled (e.g. the user signed out)', async () => {
    const api = pagesApi([CATALOG]);
    const result = await syncCatalog({ api, shopKey: '1', isCancelled: () => true, sleep: noSleep });
    expect(result.status).toBe('cancelled');
    expect(await loadCatalog('1')).toBeNull();
  });

  it('does nothing without an API or a shop', async () => {
    expect(await syncCatalog({ api: null, shopKey: '1' })).toEqual({ status: 'skipped' });
    expect(await syncCatalog({ api: pagesApi([CATALOG]), shopKey: null })).toEqual({ status: 'skipped' });
  });

  it('runs one sync at a time', async () => {
    let release;
    const api = { get: jest.fn(() => new Promise((resolve) => (release = () => resolve({ data: { products: CATALOG, pagination: { totalPages: 1 } } })))) };
    const a = syncCatalog({ api, shopKey: '1', sleep: noSleep });
    const b = syncCatalog({ api, shopKey: '1', sleep: noSleep });
    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all([a, b]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('searchProducts', () => {
  const names = (result) => result.products.map((p) => p.name);

  it('answers in the same shape as the server', () => {
    const result = searchProducts(CATALOG, { page: 1, pageSize: 2 });
    expect(result).toMatchObject({ searchType: 'offline', offline: true, pagination: { currentPage: 1, totalPages: 3, total: 5 } });
    expect(result.products).toHaveLength(2);
  });

  it('pages through the list and caps the page size at 100', () => {
    expect(names(searchProducts(CATALOG, { page: 3, pageSize: 2 }))).toEqual(['Milk Powder']);
    expect(searchProducts(CATALOG, { pageSize: 5000 }).pagination.totalPages).toBe(1);
    expect(searchProducts([], {}).pagination).toEqual({ currentPage: 1, totalPages: 1, total: 0 });
  });

  it('matches every word against name, SKU or barcode, ignoring case', () => {
    expect(names(searchProducts(CATALOG, { search: 'SUGAR' }))).toEqual(['Sugar 1kg', 'Sugar Brown 2kg']);
    expect(names(searchProducts(CATALOG, { search: 'sugar 2kg' }))).toEqual(['Sugar Brown 2kg']);
    expect(names(searchProducts(CATALOG, { search: 'milkpow' }))).toEqual(['Milk Powder']);
    expect(names(searchProducts(CATALOG, { search: 'zzz' }))).toEqual([]);
  });

  it('puts an exact barcode/SKU match (what a scanner sends) first', () => {
    const items = [product(1, 'Aaa milk 6009999 pack', { barcode: 'x' }), product(2, 'Zzz', { barcode: '6009999' })];
    expect(names(searchProducts(items, { search: '6009999' }))).toEqual(['Zzz', 'Aaa milk 6009999 pack']);
  });

  it('ranks names that start with the search above names that merely contain it', () => {
    const items = [product(1, 'Brown sugar'), product(2, 'Sugar white')];
    expect(names(searchProducts(items, { search: 'sugar' }))).toEqual(['Sugar white', 'Brown sugar']);
  });

  it('filters by category (and ignores "all")', () => {
    expect(names(searchProducts(CATALOG, { categoryId: 3 }))).toEqual(['Brookside Milk 500ml', 'Milk Powder']);
    expect(names(searchProducts(CATALOG, { categoryId: '2' }))).toEqual(['Sugar Brown 2kg', 'Unga Jogoo 2kg']);
    expect(searchProducts(CATALOG, { categoryId: 'all' }).pagination.total).toBe(5);
    expect(names(searchProducts([{ id: 1, name: 'X', category: { id: 8 } }], { categoryId: 8 }))).toEqual(['X']);
  });

  it('combines search, category and paging', () => {
    // 'Milk Powder' starts with the search, so it ranks above 'Brookside Milk 500ml'
    expect(names(searchProducts(CATALOG, { search: 'milk', categoryId: 3, pageSize: 1, page: 1 }))).toEqual(['Milk Powder']);
    expect(names(searchProducts(CATALOG, { search: 'milk', categoryId: 3, pageSize: 1, page: 2 }))).toEqual(['Brookside Milk 500ml']);
  });
});
