import { loadCatalog, searchProducts } from './catalog';

const isProductListUrl = (url) => {
  if (typeof url !== 'string') return false;
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].replace(/\/+$/, '');
  return path === '/api/products';
};

// No response at all (offline, timeout, CORS/DNS failure), or a gateway saying the backend is down.
const looksOffline = (error) => !error?.response || [502, 503, 504].includes(error.response.status);

/**
 * Make product list requests fall back to the offline catalog when the server can't be reached.
 * Nothing changes while online, and only GET /api/products is affected (single-product lookups,
 * writes and every other endpoint still fail normally).
 *
 * @param {import('axios').AxiosInstance} api
 * @param {() => string|null} getShopKey  current shop, read at request time
 * @returns {() => void} uninstall
 */
export function installCatalogFallback(api, getShopKey, { load = loadCatalog } = {}) {
  const id = api.interceptors.response.use(undefined, async (error) => {
    const config = error?.config;
    const isGet = String(config?.method || '').toLowerCase() === 'get';
    if (!config || !isGet || config.skipOfflineCatalog || !looksOffline(error) || !isProductListUrl(config.url)) {
      throw error;
    }
    const shopKey = getShopKey();
    if (!shopKey) throw error;

    let record = null;
    try {
      record = await load(shopKey);
    } catch {
      throw error;
    }
    if (!record) throw error;

    return {
      data: searchProducts(record.products, config.params),
      status: 200,
      statusText: 'OK (offline catalog)',
      headers: {},
      config,
      request: error.request,
      offlineCatalog: true,
    };
  });
  return () => api.interceptors.response.eject(id);
}
