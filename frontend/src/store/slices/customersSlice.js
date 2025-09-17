import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { customersAPI } from '../../services/api'

const initialState = {
  customers: [],
  currentCustomer: null,
  loading: false,
  error: null,
  pagination: {
    currentPage: 1,
    totalPages: 0,
    total: 0
  }
}

export const fetchCustomers = createAsyncThunk(
  'customers/fetchCustomers',
  async (params) => {
    const response = await customersAPI.getAll(params)
    return response.data
  }
)

export const fetchCustomerById = createAsyncThunk(
  'customers/fetchCustomerById',
  async (id) => {
    const response = await customersAPI.getById(id)
    return response.data
  }
)

export const createCustomer = createAsyncThunk(
  'customers/createCustomer',
  async (customerData) => {
    const response = await customersAPI.create(customerData)
    return response.data
  }
)

export const updateCustomer = createAsyncThunk(
  'customers/updateCustomer',
  async ({ id, customerData }) => {
    const response = await customersAPI.update(id, customerData)
    return response.data
  }
)

export const deleteCustomer = createAsyncThunk(
  'customers/deleteCustomer',
  async (id) => {
    await customersAPI.delete(id)
    return id
  }
)

export const adjustLoyaltyPoints = createAsyncThunk(
  'customers/adjustLoyaltyPoints',
  async ({ id, points, reason }) => {
    const response = await customersAPI.adjustLoyaltyPoints(id, points, reason)
    return response.data
  }
)

const customersSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentCustomer: (state) => {
      state.currentCustomer = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch customers
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false
        state.customers = action.payload.customers || action.payload
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          total: action.payload.length
        }
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch customers'
      })
      // Fetch customer by ID
      .addCase(fetchCustomerById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCustomerById.fulfilled, (state, action) => {
        state.loading = false
        state.currentCustomer = action.payload.customer
      })
      .addCase(fetchCustomerById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch customer'
      })
      // Create customer
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.customers.unshift(action.payload)
      })
      // Update customer
      .addCase(updateCustomer.fulfilled, (state, action) => {
        const index = state.customers.findIndex(c => c.id === action.payload.id)
        if (index !== -1) {
          state.customers[index] = action.payload
        }
        if (state.currentCustomer?.id === action.payload.id) {
          state.currentCustomer = action.payload
        }
      })
      // Delete customer
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        state.customers = state.customers.filter(c => c.id !== action.payload)
      })
      // Adjust loyalty points
      .addCase(adjustLoyaltyPoints.fulfilled, (state, action) => {
        const index = state.customers.findIndex(c => c.id === action.payload.id)
        if (index !== -1) {
          state.customers[index] = action.payload
        }
        if (state.currentCustomer?.id === action.payload.id) {
          state.currentCustomer = action.payload
        }
      })
  }
})

export const { clearError, clearCurrentCustomer } = customersSlice.actions
export default customersSlice.reducer
