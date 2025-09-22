import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { brandsAPI } from '../../services/api'

const initialState = {
  brands: [],
  currentBrand: null,
  loading: false,
  error: null
}

export const fetchBrands = createAsyncThunk(
  'brands/fetchBrands',
  async () => {
    const response = await brandsAPI.getAll()
    return response.data
  }
)

export const fetchBrandById = createAsyncThunk(
  'brands/fetchBrandById',
  async (id) => {
    const response = await brandsAPI.getById(id)
    return response.data
  }
)

export const createBrand = createAsyncThunk(
  'brands/createBrand',
  async (brandData) => {
    const response = await brandsAPI.create(brandData)
    return response.data
  }
)

export const updateBrand = createAsyncThunk(
  'brands/updateBrand',
  async ({ id, brandData }) => {
    const response = await brandsAPI.update(id, brandData)
    return response.data
  }
)

export const deleteBrand = createAsyncThunk(
  'brands/deleteBrand',
  async (id) => {
    await brandsAPI.delete(id)
    return id
  }
)

const brandsSlice = createSlice({
  name: 'brands',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentBrand: (state) => {
      state.currentBrand = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch all brands
      .addCase(fetchBrands.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchBrands.fulfilled, (state, action) => {
        state.loading = false
        state.brands = action.payload
      })
      .addCase(fetchBrands.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch brands'
      })
      // Fetch brand by ID
      .addCase(fetchBrandById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchBrandById.fulfilled, (state, action) => {
        state.loading = false
        state.currentBrand = action.payload
      })
      .addCase(fetchBrandById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch brand'
      })
      // Create brand
      .addCase(createBrand.fulfilled, (state, action) => {
        state.brands.push(action.payload)
      })
      // Update brand
      .addCase(updateBrand.fulfilled, (state, action) => {
        const index = state.brands.findIndex(b => b.id === action.payload.id)
        if (index !== -1) {
          state.brands[index] = action.payload
        }
        if (state.currentBrand?.id === action.payload.id) {
          state.currentBrand = action.payload
        }
      })
      // Delete brand
      .addCase(deleteBrand.fulfilled, (state, action) => {
        state.brands = state.brands.filter(b => b.id !== action.payload)
      })
  }
})

export const { clearError, clearCurrentBrand } = brandsSlice.actions
export default brandsSlice.reducer