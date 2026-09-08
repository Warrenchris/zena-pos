import api from './api';

// Deduplicate concurrent in-flight analytical POST queries (e.g. React StrictMode or concurrent renders)
const inFlightPostCache = new Map();

function dedupePost(url, payload) {
  let keyPayload = payload;
  if (url.includes('/finance/analyze') && payload && typeof payload === 'object') {
    const { date, ...rest } = payload;
    keyPayload = rest;
  }
  const key = `${url}:${JSON.stringify(keyPayload)}`;
  if (inFlightPostCache.has(key)) {
    return inFlightPostCache.get(key);
  }
  const promise = api.post(url, payload).finally(() => {
    inFlightPostCache.delete(key);
  });
  inFlightPostCache.set(key, promise);
  return promise;
}

const aiAPI = {
  status: () => api.get('/api/ai/status'),
  analyzeFinancial: (payload) => dedupePost('/api/ai/forward/api/finance/analyze', payload),
  createForecast: (dates, values, periods = 30) => api.post('/api/ai/forward/api/forecasting/forecast?periods=' + periods, { dates, values }),
  createRFForecast: (dates, values, periods = 30) => api.post('/api/ai/forward/api/forecasting/rf-forecast', { dates, values, periods }),
  analyzeBusiness: (payload) => api.post('/api/ai/forward/api/insights/analyze', payload),
  detectAnomalies: (dailyData, contamination = 0.05) => dedupePost('/api/ai/forward/api/insights/anomalies', { daily_data: dailyData, contamination }),
  stockDepletion: (payload) => api.post('/api/ai/forward/api/forecasting/stock-depletion', payload),
};

export default aiAPI;
