import api from './api';

const forecastingService = {
  async getForecast(dates, values) {
    try {
      const response = await api.post('/api/ai/forward/api/forecasting/forecast', {
        dates: dates.map(d => new Date(d).toISOString()),
        values
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching forecast:', error);
      return {
        dates: [],
        predictions: [],
        lower_bounds: [],
        upper_bounds: []
      };
    }
  }
};

export default forecastingService;