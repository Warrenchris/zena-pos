import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import shopService from '../../services/shop.service';
import { switchActiveShop } from './authSlice';

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
  },
  {
    condition: (params, { getState }) => {
      const { shop, loading } = getState().shop;
      if (params?.force) return true;
      if (loading || shop) {
        return false;
      }
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

export const fetchAccessibleShops = createAsyncThunk(
  'shop/fetchAccessibleShops',
  async (_, { rejectWithValue }) => {
    try {
      const data = await shopService.getAccessibleShops();
      return data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to fetch accessible shops',
        status: error.response?.status,
      });
    }
  },
  {
    condition: (params, { getState }) => {
      const { accessibleShops, loadingAccessible } = getState().shop;
      if (params?.force) return true;
      if (loadingAccessible || (accessibleShops && accessibleShops.length > 0)) {
        return false;
      }
    }
  }
);

export const createBranch = createAsyncThunk(
  'shop/createBranch',
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const data = await shopService.createShop(payload);
      dispatch(fetchAccessibleShops({ force: true }));
      return data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to create branch',
        code: error.response?.data?.code,
        status: error.response?.status,
        data: error.response?.data,
      });
    }
  }
);

const initialState = {
  shop: null,
  loading: false,
  loadingAccessible: false,
  error: null,
  accessibleShops: [],
  switching: false,
  creatingBranch: false,
};

const shopSlice = createSlice({
  name: 'shop',
  initialState,
  reducers: {
    clearShopError: (state) => {
      state.error = null;
    },
  },
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
      })
      .addCase(fetchAccessibleShops.pending, (state) => {
        state.loadingAccessible = true;
        state.error = null;
      })
      .addCase(fetchAccessibleShops.fulfilled, (state, action) => {
        state.loadingAccessible = false;
        state.accessibleShops = action.payload?.shops || (Array.isArray(action.payload) ? action.payload : []);
      })
      .addCase(fetchAccessibleShops.rejected, (state, action) => {
        state.loadingAccessible = false;
        state.error = action.payload;
      })
      .addCase(createBranch.pending, (state) => {
        state.creatingBranch = true;
        state.error = null;
      })
      .addCase(createBranch.fulfilled, (state, action) => {
        state.creatingBranch = false;
        if (action.payload?.shop) {
          const exists = state.accessibleShops.some(s => s.id === action.payload.shop.id);
          if (!exists) {
            state.accessibleShops.push({ ...action.payload.shop, isCurrent: false });
          }
        }
      })
      .addCase(createBranch.rejected, (state, action) => {
        state.creatingBranch = false;
        state.error = action.payload;
      })
      .addCase(switchActiveShop.pending, (state) => {
        state.switching = true;
        state.error = null;
      })
      .addCase(switchActiveShop.fulfilled, (state, action) => {
        state.switching = false;
        if (action.payload?.shop) {
          state.shop = action.payload.shop;
        }
      })
      .addCase(switchActiveShop.rejected, (state, action) => {
        state.switching = false;
        state.error = action.payload;
      });
  },
});

export const { clearShopError } = shopSlice.actions;
export default shopSlice.reducer;