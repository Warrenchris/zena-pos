import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import billingService from '../../services/billing.service';

export const fetchPlans = createAsyncThunk(
  'billing/fetchPlans',
  async (_, { rejectWithValue }) => {
    try {
      const data = await billingService.getPlans();
      return data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to fetch billing plans',
        status: error.response?.status,
      });
    }
  }
);

export const fetchSubscription = createAsyncThunk(
  'billing/fetchSubscription',
  async (_, { rejectWithValue }) => {
    try {
      const data = await billingService.getSubscription();
      return data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to fetch subscription',
        status: error.response?.status,
      });
    }
  }
);

export const fetchInvoices = createAsyncThunk(
  'billing/fetchInvoices',
  async (params = {}, { rejectWithValue }) => {
    try {
      const data = await billingService.getInvoices(params);
      return data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to fetch invoices',
        status: error.response?.status,
      });
    }
  }
);

const initialState = {
  plans: [],
  subscription: null,
  quotas: null,
  invoices: [],
  invoicesPagination: {
    total: 0,
    totalPages: 1,
    currentPage: 1,
  },
  loading: {
    plans: false,
    subscription: false,
    invoices: false,
  },
  error: {
    plans: null,
    subscription: null,
    invoices: null,
  },
};

const billingSlice = createSlice({
  name: 'billing',
  initialState,
  reducers: {
    clearBillingErrors: (state) => {
      state.error = {
        plans: null,
        subscription: null,
        invoices: null,
      };
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchPlans
      .addCase(fetchPlans.pending, (state) => {
        state.loading.plans = true;
        state.error.plans = null;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.loading.plans = false;
        state.plans = action.payload?.plans || [];
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.loading.plans = false;
        state.error.plans = action.payload?.message || 'Failed to load billing plans';
      })

      // fetchSubscription
      .addCase(fetchSubscription.pending, (state) => {
        state.loading.subscription = true;
        state.error.subscription = null;
      })
      .addCase(fetchSubscription.fulfilled, (state, action) => {
        state.loading.subscription = false;
        state.subscription = action.payload?.subscription || null;
        state.quotas = action.payload?.quotas || null;
      })
      .addCase(fetchSubscription.rejected, (state, action) => {
        state.loading.subscription = false;
        state.error.subscription = action.payload?.message || 'Failed to load subscription';
      })

      // fetchInvoices
      .addCase(fetchInvoices.pending, (state) => {
        state.loading.invoices = true;
        state.error.invoices = null;
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        state.loading.invoices = false;
        state.invoices = action.payload?.invoices || [];
        state.invoicesPagination = {
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 1,
          currentPage: action.payload?.currentPage || 1,
        };
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        state.loading.invoices = false;
        state.error.invoices = action.payload?.message || 'Failed to load billing invoices';
      });
  },
});

export const { clearBillingErrors } = billingSlice.actions;
export default billingSlice.reducer;
