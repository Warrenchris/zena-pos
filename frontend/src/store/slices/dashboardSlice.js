import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboardAPI } from '../../services/dashboardAPI';

// Async thunks
export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async (params) => {
    console.log('Fetching dashboard stats with params:', params);
    try {
      const response = await dashboardAPI.getStats(params);
      console.log('Dashboard stats response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }
);

export const fetchRevenueData = createAsyncThunk(
  'dashboard/fetchRevenue',
  async (params) => {
    console.log('Fetching revenue data with params:', params);
    try {
      const response = await dashboardAPI.getRevenueChart(params);
      console.log('Revenue data response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      throw error;
    }
  }
);

export const fetchVisitorStats = createAsyncThunk(
  'dashboard/fetchVisitors',
  async (params) => {
    const response = await dashboardAPI.getVisitorStats(params);
    return response.data;
  }
);

export const fetchTopProducts = createAsyncThunk(
  'dashboard/fetchTopProducts',
  async (params) => {
    const response = await dashboardAPI.getTopProducts(params);
    return response.data;
  }
);

const initialState = {
  stats: {
    totalIncome: 0,
    totalSales: 0,
    totalCustomers: 0,
    totalTransactions: 0,
    incomeGrowth: 0,
    salesGrowth: 0,
    customerGrowth: 0,
    transactionGrowth: 0,
    loading: false,
    error: null
  },
  revenue: {
    data: [],
    loading: false,
    error: null
  },
  visitors: {
    data: [],
    totalVisitors: 0,
    percentageChange: 0,
    loading: false,
    error: null
  },
  topProducts: {
    data: [],
    loading: false,
    error: null
  }
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // Stats
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.stats.loading = true;
        state.stats.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.stats = {
          ...action.payload,
          loading: false,
          error: null
        };
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.stats.loading = false;
        state.stats.error = action.error.message;
      })
      // Revenue
      .addCase(fetchRevenueData.pending, (state) => {
        state.revenue.loading = true;
        state.revenue.error = null;
      })
      .addCase(fetchRevenueData.fulfilled, (state, action) => {
        state.revenue.data = action.payload.revenueData;
        state.revenue.loading = false;
        state.revenue.error = null;
      })
      .addCase(fetchRevenueData.rejected, (state, action) => {
        state.revenue.loading = false;
        state.revenue.error = action.error.message;
      })
      // Visitors
      .addCase(fetchVisitorStats.pending, (state) => {
        state.visitors.loading = true;
        state.visitors.error = null;
      })
      .addCase(fetchVisitorStats.fulfilled, (state, action) => {
        state.visitors = {
          ...action.payload,
          loading: false,
          error: null
        };
      })
      .addCase(fetchVisitorStats.rejected, (state, action) => {
        state.visitors.loading = false;
        state.visitors.error = action.error.message;
      })
      // Top Products
      .addCase(fetchTopProducts.pending, (state) => {
        state.topProducts.loading = true;
        state.topProducts.error = null;
      })
      .addCase(fetchTopProducts.fulfilled, (state, action) => {
        state.topProducts.data = action.payload;
        state.topProducts.loading = false;
        state.topProducts.error = null;
      })
      .addCase(fetchTopProducts.rejected, (state, action) => {
        state.topProducts.loading = false;
        state.topProducts.error = action.error.message;
      });
  }
});

export default dashboardSlice.reducer;