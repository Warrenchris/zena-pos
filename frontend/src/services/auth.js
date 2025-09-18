import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  shop?: {
    id: number;
    name: string;
  };
}

export const authService = {
  async login(credentials: LoginCredentials) {
    const response = await api.post<{ token: string; user: User }>('/auth/login', credentials);
    localStorage.setItem('token', response.data.token);
    return response.data;
  },

  async logout() {
    localStorage.removeItem('token');
  },

  async getCurrentUser() {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },
};