import api from './api';

const aiAPI = {
  status: () => api.get('/api/ai/status'),
  analyzeFinancial: (payload) => api.post('/api/ai/forward/api/finance/analyze', payload),
  createForecast: (dates, values, periods = 30) => api.post('/api/ai/forward/api/forecasting/forecast?periods=' + periods, { dates, values }),
  createRFForecast: (dates, values, periods = 30) => api.post('/api/ai/forward/api/forecasting/rf-forecast', { dates, values, periods }),
  analyzeBusiness: (payload) => api.post('/api/ai/forward/api/insights/analyze', payload),
  detectAnomalies: (dailyData, contamination = 0.05) => api.post('/api/ai/forward/api/insights/anomalies', { daily_data: dailyData, contamination }),
  stockDepletion: (payload) => api.post('/api/ai/forward/api/forecasting/stock-depletion', payload),
};

export default aiAPI;
