import { axiosInstance } from './api';
// Invoice APIs
export const getInvoices = async (params = {}) => {
  const queryString = new URLSearchParams({
    page: params.page || 1,
    limit: params.limit || 10,
    ...(params.status && params.status !== 'all' && { status: params.status }),
    ...(params.search && { search: params.search }),
    ...(params.sortBy && { sortBy: params.sortBy }),
    ...(params.sortOrder && { sortOrder: params.sortOrder })
  }).toString();

  const response = await axiosInstance.get(`/api/invoices?${queryString}`);
  return {
    data: response.data,
    status: response.status
  };
};

export const getInvoiceById = async (id) => {
  const response = await axiosInstance.get(`/api/invoices/${id}`);
  return {
    data: response.data,
    status: response.status
  };
};

export const createInvoice = async (data) => {
  const response = await axiosInstance.post('/api/invoices', data);
  return {
    data: response.data,
    status: response.status
  };
};

export const updateInvoice = async (id, data) => {
  const response = await axiosInstance.put(`/api/invoices/${id}`, data);
  return {
    data: response.data,
    status: response.status
  };
};

export const deleteInvoice = async (id) => {
  const response = await axiosInstance.delete(`/api/invoices/${id}`);
  return {
    status: response.status
  };
};

export const getInvoicePDF = async (id) => {
  const response = await axiosInstance.get(`/api/invoices/${id}/pdf`, {
    responseType: 'blob'
  });
  return {
    data: response.data,
    status: response.status
  };
};