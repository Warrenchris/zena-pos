import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { productsAPI } from '../../services/api'

const initialState = {
  products: [],
  currentProduct: null,
  loading: false,
  error: null,
  pagination: {
    currentPage: 1,
    totalPages: 0,
    total: 0
  }
}

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (params) => {
    const response = await productsAPI.getAll(params)
    return response.data
  }
)

export const fetchProductById = createAsyncThunk(
  'products/fetchProductById',
  async (id) => {
    const response = await productsAPI.getById(id)
    return response.data
  }
)

export const createProduct = createAsyncThunk(
  'products/createProduct',
  async (productData) => {
    const response = await productsAPI.create(productData)
    return response.data
  }
)

export const updateProduct = createAsyncThunk(
  'products/updateProduct',
  async ({ id, productData }) => {
    const response = await productsAPI.update(id, productData)
    return response.data
  }
)

export const deleteProduct = createAsyncThunk(
  'products/deleteProduct',
  async (id) => {
    await productsAPI.delete(id)
    return id
  }
)

export const updateStock = createAsyncThunk(
  'products/updateStock',
  async ({ id, quantity }) => {
    const response = await productsAPI.updateStock(id, quantity)
    return response.data
  }
)

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentProduct: (state) => {
      state.currentProduct = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch products
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false
        state.products = action.payload.products || action.payload
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          total: action.payload.length
        }
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch products'
      })
      // Fetch product by ID
      .addCase(fetchProductById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.loading = false
        state.currentProduct = action.payload
      })
      .addCase(fetchProductById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch product'
      })
      // Create product
      .addCase(createProduct.fulfilled, (state, action) => {
        state.products.unshift(action.payload)
      })
      // Update product
      .addCase(updateProduct.fulfilled, (state, action) => {
        const index = state.products.findIndex(p => p.id === action.payload.id)
        if (index !== -1) {
          state.products[index] = action.payload
        }
        if (state.currentProduct?.id === action.payload.id) {
          state.currentProduct = action.payload
        }
      })
      // Delete product
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.products = state.products.filter(p => p.id !== action.payload)
      })
      // Update stock
      .addCase(updateStock.fulfilled, (state, action) => {
        const index = state.products.findIndex(p => p.id === action.payload.id)
        if (index !== -1) {
          state.products[index] = action.payload
        }
        if (state.currentProduct?.id === action.payload.id) {
          state.currentProduct = action.payload
        }
      })
  }
})

export const { clearError, clearCurrentProduct } = productsSlice.actions
export default productsSlice.reducer
