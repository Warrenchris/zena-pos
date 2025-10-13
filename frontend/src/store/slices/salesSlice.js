import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { salesAPI } from '../../services/api'

const initialState = {
  sales: [],
  currentSale: null,
  loading: false,
  error: null,
  pagination: {
    currentPage: 1,
    totalPages: 0,
    total: 0
  },
  statistics: {
    totalSales: 0,
    totalRevenue: 0,
    averageTicket: 0
  }
}

export const fetchSales = createAsyncThunk(
  'sales/fetchSales',
  async (params) => {
    const response = await salesAPI.getAll(params)
    return response.data
  }
)

export const fetchAdminSales = createAsyncThunk(
  'sales/fetchAdminSales',
  async (params) => {
    const response = await salesAPI.getAllForAdmin(params)
    return response.data
  }
)

export const fetchMySales = createAsyncThunk(
  'sales/fetchMySales',
  async (params) => {
    const response = await salesAPI.getMySales(params)
    return response.data
  }
)

export const fetchSaleById = createAsyncThunk(
  'sales/fetchSaleById',
  async (id) => {
    const response = await salesAPI.getById(id)
    return response.data
  }
)

export const createSale = createAsyncThunk(
  'sales/createSale',
  async (saleData) => {
    const response = await salesAPI.create(saleData)
    return response.data
  }
)

export const updatePaymentStatus = createAsyncThunk(
  'sales/updatePaymentStatus',
  async ({ id, paymentStatus }) => {
    const response = await salesAPI.updatePaymentStatus(id, paymentStatus)
    return response.data
  }
)

export const fetchSalesStatistics = createAsyncThunk(
  'sales/fetchSalesStatistics',
  async (params) => {
    const response = await salesAPI.getStatistics(params)
    return response.data
  }
)

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentSale: (state) => {
      state.currentSale = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch sales
      .addCase(fetchSales.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSales.fulfilled, (state, action) => {
        state.loading = false
        state.sales = action.payload.sales || action.payload
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          total: action.payload.length
        }
      })
      .addCase(fetchSales.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch sales'
      })
      // Fetch admin sales
      .addCase(fetchAdminSales.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAdminSales.fulfilled, (state, action) => {
        state.loading = false
        state.sales = action.payload.sales || action.payload
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          total: action.payload.length
        }
      })
      .addCase(fetchAdminSales.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch admin sales'
      })
      // Fetch my sales
      .addCase(fetchMySales.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchMySales.fulfilled, (state, action) => {
        state.loading = false
        state.sales = action.payload.sales || action.payload
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          total: action.payload.length
        }
      })
      .addCase(fetchMySales.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch my sales'
      })
      // Fetch sale by ID
      .addCase(fetchSaleById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSaleById.fulfilled, (state, action) => {
        state.loading = false
        state.currentSale = action.payload
      })
      .addCase(fetchSaleById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch sale'
      })
      // Create sale
      .addCase(createSale.fulfilled, (state, action) => {
        state.sales.unshift(action.payload)
      })
      // Update payment status
      .addCase(updatePaymentStatus.fulfilled, (state, action) => {
        const index = state.sales.findIndex(s => s.id === action.payload.id)
        if (index !== -1) {
          state.sales[index] = action.payload
        }
        if (state.currentSale?.id === action.payload.id) {
          state.currentSale = action.payload
        }
      })
      // Fetch sales statistics
      .addCase(fetchSalesStatistics.fulfilled, (state, action) => {
        state.statistics = action.payload
      })
  }
})

export const { clearError, clearCurrentSale } = salesSlice.actions
export default salesSlice.reducer
