/* eslint-env jest */
import axios, { AxiosError } from 'axios';
import { installCatalogFallback } from '../catalogFallback';

const CATALOG = {
  key: '1',
  syncedAt: 1,
  count: 3,
  products: [
    { id: 1, name: 'Sugar 1kg', sku: 'S1', barcode: '111', categoryId: 1 },
    { id: 2, name: 'Milk 500ml', sku: 'M1', barcode: '222', categoryId: 2 },
    { id: 3, name: 'Sugar Brown', sku: 'S2', barcode: '333', categoryId: 1 },
  ],
};

/** An axios instance whose "network" always fails the way an offline browser does. */
function offlineClient({ status } = {}) {
  const adapter = jest.fn(async (config) => {
    if (status) {
      throw new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, {}, { status, data: {}, statusText: '', headers: {}, config });
    }
    throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
  });
  return { api: axios.create({ adapter, baseURL: 'https://api.test' }), adapter };
}

const install = (api, { shopKey = '1', record = CATALOG } = {}) => {
  const load = jest.fn(async () => record);
  const uninstall = installCatalogFallback(api, () => shopKey, { load });
  return { uninstall, load };
};

describe('offline catalog fallback', () => {
  it('answers a product search from the local copy when there is no connection', async () => {
    const { api } = offlineClient();
    const { load } = install(api);

    const response = await api.get('/api/products', { params: { search: 'sugar', page: 1, pageSize: 12 } });

    expect(load).toHaveBeenCalledWith('1');
    expect(response.status).toBe(200);
    expect(response.offlineCatalog).toBe(true);
    expect(response.data.products.map((p) => p.id)).toEqual([1, 3]);
    expect(response.data.searchType).toBe('offline');
    expect(response.data.pagination.total).toBe(2);
  });

  it('answers a barcode scan the same way', async () => {
    const { api } = offlineClient();
    install(api);
    const response = await api.get('/api/products', { params: { search: '222' } });
    expect(response.data.products.map((p) => p.name)).toEqual(['Milk 500ml']);
  });

  it('also covers a gateway saying the backend is down (502/503/504)', async () => {
    for (const status of [502, 503, 504]) {
      const { api } = offlineClient({ status });
      install(api);
      expect((await api.get('/api/products', { params: {} })).offlineCatalog).toBe(true);
    }
  });

  it('accepts a full URL and a trailing slash', async () => {
    const { api } = offlineClient();
    install(api);
    expect((await api.get('https://api.test/api/products/', { params: {} })).offlineCatalog).toBe(true);
  });

  it('leaves real server errors alone (a 500, a 401, a 404 are not "offline")', async () => {
    for (const status of [400, 401, 404, 500]) {
      const { api } = offlineClient({ status });
      const { load } = install(api);
      await expect(api.get('/api/products', { params: {} })).rejects.toMatchObject({ response: { status } });
      expect(load).not.toHaveBeenCalled();
    }
  });

  it('only covers the product LIST: single products, other endpoints and writes still fail', async () => {
    const { api } = offlineClient();
    install(api);
    await expect(api.get('/api/products/5')).rejects.toThrow('Network Error');
    await expect(api.get('/api/products/batch', { params: { ids: '1,2' } })).rejects.toThrow('Network Error');
    await expect(api.get('/api/customers')).rejects.toThrow('Network Error');
    await expect(api.post('/api/products', {})).rejects.toThrow('Network Error');
  });

  it('does not answer the catalog sync’s own requests from the copy', async () => {
    const { api } = offlineClient();
    const { load } = install(api);
    await expect(api.get('/api/products', { params: { page: 1 }, skipOfflineCatalog: true })).rejects.toThrow('Network Error');
    expect(load).not.toHaveBeenCalled();
  });

  it('fails normally when there is no copy yet or no shop is known', async () => {
    const { api } = offlineClient();
    install(api, { record: null });
    await expect(api.get('/api/products', { params: {} })).rejects.toThrow('Network Error');

    const second = offlineClient();
    install(second.api, { shopKey: null });
    await expect(second.api.get('/api/products', { params: {} })).rejects.toThrow('Network Error');
  });

  it('fails normally if reading the copy itself fails', async () => {
    const { api } = offlineClient();
    installCatalogFallback(api, () => '1', {
      load: async () => {
        throw new Error('IndexedDB broke');
      },
    });
    await expect(api.get('/api/products', { params: {} })).rejects.toThrow('Network Error');
  });

  it('does nothing while online', async () => {
    const adapter = jest.fn(async (config) => ({ data: { products: ['from server'] }, status: 200, statusText: 'OK', headers: {}, config }));
    const api = axios.create({ adapter });
    const { load } = install(api);
    const response = await api.get('/api/products', { params: {} });
    expect(response.data.products).toEqual(['from server']);
    expect(response.offlineCatalog).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('can be uninstalled', async () => {
    const { api } = offlineClient();
    const { uninstall } = install(api);
    uninstall();
    await expect(api.get('/api/products', { params: {} })).rejects.toThrow('Network Error');
  });
});
