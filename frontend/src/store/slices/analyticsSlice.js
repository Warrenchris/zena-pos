import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import analyticsService from '../../services/analytics.service';

export const fetchVisitorStats = createAsyncThunk(
  'analytics/fetchVisitorStats',
  async (period, { rejectWithValue }) => {
    try {
      const data = await analyticsService.getVisitorStats(period);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch visitor statistics');
    }
  }
);

export const fetchOrderStats = createAsyncThunk(
  'analytics/fetchOrderStats',
  async (period, { rejectWithValue }) => {
    try {
      const data = await analyticsService.getOrderStats(period);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch order statistics');
    }
  }
);

export const fetchTopProducts = createAsyncThunk(
  'analytics/fetchTopProducts',
  async ({ period = 'week', limit = 5 } = {}, { rejectWithValue }) => {
    try {
      const data = await analyticsService.getTopProducts(period, limit);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch top products');
    }
  }
);

export const fetchSalesChannels = createAsyncThunk(
  'analytics/fetchSalesChannels',
  async (period = 'week', { rejectWithValue }) => {
    try {
      const data = await analyticsService.getSalesChannels(period);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch sales channels');
    }
  }
);

export const fetchCustomerLocations = createAsyncThunk(
  'analytics/fetchCustomerLocations',
  async (period = 'week', { rejectWithValue }) => {
    try {
      const data = await analyticsService.getCustomerLocations(period);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch customer locations');
    }
  }
);

const initialState = {
  visitorStats: {
    visitorData: [],
    percentageChange: 0,
    totalVisitors: 0,
    loading: false,
    error: null
  },
  orderStats: {
    orderData: [],
    orderPercentageChange: 0,
    revenuePercentageChange: 0,
    totalOrders: 0,
    totalRevenue: 0,
    loading: false,
    error: null
  },
  topProducts: {
    products: [],
    salesPercentageChange: 0,
    totalSales: 0,
    loading: false,
    error: null
  },
  salesChannels: {
    platforms: [],
    totalSales: 0,
    totalRevenue: 0,
    salesPercentageChange: 0,
    loading: false,
    error: null
  },
  customerLocations: {
    locations: [],
    totalCustomers: 0,
    percentageChange: 0,
    loading: false,
    error: null
  }
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Visitor stats cases
      .addCase(fetchVisitorStats.pending, (state) => {
        state.visitorStats.loading = true;
        state.visitorStats.error = null;
      })
      .addCase(fetchVisitorStats.fulfilled, (state, action) => {
        state.visitorStats.loading = false;
        state.visitorStats.visitorData = action.payload.visitorData;
        state.visitorStats.percentageChange = action.payload.percentageChange;
        state.visitorStats.totalVisitors = action.payload.totalVisitors;
      })
      .addCase(fetchVisitorStats.rejected, (state, action) => {
        state.visitorStats.loading = false;
        state.visitorStats.error = action.payload;
      })
      // Order stats cases
      .addCase(fetchOrderStats.pending, (state) => {
        state.orderStats.loading = true;
        state.orderStats.error = null;
      })
      .addCase(fetchOrderStats.fulfilled, (state, action) => {
        state.orderStats.loading = false;
        state.orderStats.orderData = action.payload.orderData;
        state.orderStats.orderPercentageChange = action.payload.orderPercentageChange;
        state.orderStats.revenuePercentageChange = action.payload.revenuePercentageChange;
        state.orderStats.totalOrders = action.payload.totalOrders;
        state.orderStats.totalRevenue = action.payload.totalRevenue;
      })
      .addCase(fetchOrderStats.rejected, (state, action) => {
        state.orderStats.loading = false;
        state.orderStats.error = action.payload;
      })
      // Top products cases
      .addCase(fetchTopProducts.pending, (state) => {
        state.topProducts.loading = true;
        state.topProducts.error = null;
      })
      .addCase(fetchTopProducts.fulfilled, (state, action) => {
        state.topProducts.loading = false;
        state.topProducts.products = action.payload.products;
        state.topProducts.salesPercentageChange = action.payload.salesPercentageChange;
        state.topProducts.totalSales = action.payload.totalSales;
      })
      .addCase(fetchTopProducts.rejected, (state, action) => {
        state.topProducts.loading = false;
        state.topProducts.error = action.payload;
      })
      // Sales channels cases
      .addCase(fetchSalesChannels.pending, (state) => {
        state.salesChannels.loading = true;
        state.salesChannels.error = null;
      })
      .addCase(fetchSalesChannels.fulfilled, (state, action) => {
        state.salesChannels.loading = false;
        state.salesChannels.platforms = action.payload.platforms;
        state.salesChannels.totalSales = action.payload.totalSales;
        state.salesChannels.totalRevenue = action.payload.totalRevenue;
        state.salesChannels.salesPercentageChange = action.payload.salesPercentageChange;
      })
      .addCase(fetchSalesChannels.rejected, (state, action) => {
        state.salesChannels.loading = false;
        state.salesChannels.error = action.payload;
      })
      // Customer locations cases
      .addCase(fetchCustomerLocations.pending, (state) => {
        state.customerLocations.loading = true;
        state.customerLocations.error = null;
      })
      .addCase(fetchCustomerLocations.fulfilled, (state, action) => {
        state.customerLocations.loading = false;
        state.customerLocations.locations = action.payload.locations;
        state.customerLocations.totalCustomers = action.payload.totalCustomers;
        state.customerLocations.percentageChange = action.payload.percentageChange;
      })
      .addCase(fetchCustomerLocations.rejected, (state, action) => {
        state.customerLocations.loading = false;
        state.customerLocations.error = action.payload;
      });
  }
});

export default analyticsSlice.reducer;