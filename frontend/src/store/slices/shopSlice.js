import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import shopService from '../../services/shop.service';

export const fetchMyShop = createAsyncThunk(
  'shop/fetchMyShop',
  async (_, { rejectWithValue }) => {
    try {
      const shop = await shopService.getMine();
      return shop || null;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.message || error.message || 'Failed to fetch shop',
        status: error.response?.status,
      });
    }
  }
);

export const updateMyShop = createAsyncThunk(
  'shop/updateMyShop',
  async (payload, { rejectWithValue }) => {
    try {
      const shop = await shopService.updateMine(payload);
      return shop;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.message || error.message || 'Failed to update shop',
        status: error.response?.status,
      });
    }
  }
);

const initialState = {
  shop: null,
  loading: false,
  error: null,
};

const shopSlice = createSlice({
  name: 'shop',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyShop.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyShop.fulfilled, (state, action) => {
        state.loading = false;
        state.shop = action.payload;
      })
      .addCase(fetchMyShop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateMyShop.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateMyShop.fulfilled, (state, action) => {
        state.loading = false;
        state.shop = action.payload;
      })
      .addCase(updateMyShop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default shopSlice.reducer;