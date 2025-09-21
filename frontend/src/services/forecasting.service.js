import axios from 'axios';

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

const forecastingService = {
  async getForecast(dates, values) {
    try {
      const response = await axios.post(`${AI_SERVICE_URL}/api/forecasting/forecast`, {
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