import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { unitsAPI } from '../../services/api'

const initialState = {
  units: [],
  currentUnit: null,
  loading: false,
  error: null
}

export const fetchUnits = createAsyncThunk(
  'units/fetchUnits',
  async () => {
    const response = await unitsAPI.getAll()
    return response.data
  }
)

export const fetchUnitById = createAsyncThunk(
  'units/fetchUnitById',
  async (id) => {
    const response = await unitsAPI.getById(id)
    return response.data
  }
)

export const createUnit = createAsyncThunk(
  'units/createUnit',
  async (unitData) => {
    const response = await unitsAPI.create(unitData)
    return response.data
  }
)

export const updateUnit = createAsyncThunk(
  'units/updateUnit',
  async ({ id, unitData }) => {
    const response = await unitsAPI.update(id, unitData)
    return response.data
  }
)

export const deleteUnit = createAsyncThunk(
  'units/deleteUnit',
  async (id) => {
    await unitsAPI.delete(id)
    return id
  }
)

const unitsSlice = createSlice({
  name: 'units',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentUnit: (state) => {
      state.currentUnit = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch all units
      .addCase(fetchUnits.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUnits.fulfilled, (state, action) => {
        state.loading = false
        state.units = action.payload
      })
      .addCase(fetchUnits.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch units'
      })
      // Fetch unit by ID
      .addCase(fetchUnitById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUnitById.fulfilled, (state, action) => {
        state.loading = false
        state.currentUnit = action.payload
      })
      .addCase(fetchUnitById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch unit'
      })
      // Create unit
      .addCase(createUnit.fulfilled, (state, action) => {
        state.units.push(action.payload)
      })
      // Update unit
      .addCase(updateUnit.fulfilled, (state, action) => {
        const index = state.units.findIndex(u => u.id === action.payload.id)
        if (index !== -1) {
          state.units[index] = action.payload
        }
        if (state.currentUnit?.id === action.payload.id) {
          state.currentUnit = action.payload
        }
      })
      // Delete unit
      .addCase(deleteUnit.fulfilled, (state, action) => {
        state.units = state.units.filter(u => u.id !== action.payload)
      })
  }
})

export const { clearError, clearCurrentUnit } = unitsSlice.actions
export default unitsSlice.reducer