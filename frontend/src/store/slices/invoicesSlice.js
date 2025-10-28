import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../utils/api';

// Thunk for fetching all invoices
export const fetchInvoices = createAsyncThunk(
  'invoices/fetchInvoices',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/invoices', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to fetch invoices');
    }
  }
);

// Thunk for fetching a single invoice
export const fetchInvoiceById = createAsyncThunk(
  'invoices/fetchInvoiceById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/invoices/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to fetch invoice');
    }
  }
);

// Initial state
const initialState = {
  invoices: [],
  currentInvoice: null,
  loading: false,
  error: null,
  total: 0,
  page: 1,
  limit: 10,
  filters: {
    search: '',
    status: 'all',
    dateRange: null,
  },
};

// Create the slice
const invoicesSlice = createSlice({
  name: 'invoices',
  initialState,
  reducers: {
    setPage: (state, action) => {
      state.page = action.payload;
    },
    setLimit: (state, action) => {
      state.limit = action.payload;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchInvoices
      .addCase(fetchInvoices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        state.loading = false;
        state.invoices = action.payload.invoices;
        state.total = action.payload.total;
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch invoices';
      })
      // Handle fetchInvoiceById
      .addCase(fetchInvoiceById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInvoiceById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentInvoice = action.payload;
      })
      .addCase(fetchInvoiceById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch invoice';
      });
  },
});

// Export actions
export const { setPage, setLimit, setFilters, clearFilters } = invoicesSlice.actions;

// Export selectors
export const selectInvoices = (state) => state.invoices.invoices;
export const selectCurrentInvoice = (state) => state.invoices.currentInvoice;
export const selectInvoicesLoading = (state) => state.invoices.loading;
export const selectInvoicesError = (state) => state.invoices.error;
export const selectInvoicesTotal = (state) => state.invoices.total;
export const selectInvoicesPage = (state) => state.invoices.page;
export const selectInvoicesLimit = (state) => state.invoices.limit;
export const selectInvoicesFilters = (state) => state.invoices.filters;

// Export reducer
export default invoicesSlice.reducer;