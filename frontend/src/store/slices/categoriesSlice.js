import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { categoriesAPI } from '../../services/api'

const initialState = {
  categories: [],
  currentCategory: null,
  loading: false,
  error: null
}

export const fetchCategories = createAsyncThunk(
  'categories/fetchCategories',
  async () => {
    const response = await categoriesAPI.getAll()
    return response.data
  }
)

export const fetchCategoryById = createAsyncThunk(
  'categories/fetchCategoryById',
  async (id) => {
    const response = await categoriesAPI.getById(id)
    return response.data
  }
)

export const createCategory = createAsyncThunk(
  'categories/createCategory',
  async (categoryData) => {
    const response = await categoriesAPI.create(categoryData)
    return response.data
  }
)

export const updateCategory = createAsyncThunk(
  'categories/updateCategory',
  async ({ id, categoryData }) => {
    const response = await categoriesAPI.update(id, categoryData)
    return response.data
  }
)

export const deleteCategory = createAsyncThunk(
  'categories/deleteCategory',
  async (id) => {
    await categoriesAPI.delete(id)
    return id
  }
)

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentCategory: (state) => {
      state.currentCategory = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch categories
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch categories'
      })
      // Fetch category by ID
      .addCase(fetchCategoryById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategoryById.fulfilled, (state, action) => {
        state.loading = false
        state.currentCategory = action.payload
      })
      .addCase(fetchCategoryById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch category'
      })
      // Create category
      .addCase(createCategory.fulfilled, (state, action) => {
        state.categories.push(action.payload)
      })
      // Update category
      .addCase(updateCategory.fulfilled, (state, action) => {
        const index = state.categories.findIndex(c => c.id === action.payload.id)
        if (index !== -1) {
          state.categories[index] = action.payload
        }
        if (state.currentCategory?.id === action.payload.id) {
          state.currentCategory = action.payload
        }
      })
      // Delete category
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.categories = state.categories.filter(c => c.id !== action.payload)
      })
  }
})

export const { clearError, clearCurrentCategory } = categoriesSlice.actions
export default categoriesSlice.reducer
