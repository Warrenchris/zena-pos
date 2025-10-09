import api from './api';

// Backend proxy endpoints
const aiAPI = {
  status: () => api.get('/api/ai/status'),
  analyzeFinancial: (payload) => api.post('/api/ai/forward/api/finance/analyze', payload),
  createForecast: (dates, values, periods = 30) => api.post('/api/ai/forward/api/forecasting/forecast?periods=' + periods, { dates, values }),
  analyzeBusiness: (payload) => api.post('/api/ai/forward/api/insights/analyze', payload),
};

export default aiAPI;
