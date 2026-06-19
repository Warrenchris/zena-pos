import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiServices from '../pages/AiServices';
import { ToastProvider } from '../components/Toast';
import aiService from '../services/ai.service';
import api from '../services/api';

jest.mock('../services/ai.service');
jest.mock('../services/api');

describe('AiServices page', () => {
  beforeEach(() => {
    aiService.status.mockResolvedValue({ data: { ok: true, upstream: 'http://localhost:8000' } });
    aiService.createForecast.mockResolvedValue({ data: { dates: [], predictions: [], lower_bounds: [], upper_bounds: [] } });
    aiService.analyzeBusiness.mockResolvedValue({ data: [] });
    aiService.analyzeFinancial.mockResolvedValue({ data: { gross_profit_margin: 0.4, net_profit_margin: 0.25, current_ratio: 4.0, inventory_turnover: 1.5 } });
    api.get.mockImplementation((path) => {
      if (path === '/api/dashboard/revenue') return Promise.resolve({ data: { data: [] } });
      if (path === '/api/dashboard/stats') return Promise.resolve({ data: {} });
      if (path === '/api/shop/me') return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => jest.resetAllMocks());

  test('renders hub and shows AI Service Health', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AiServices />
        </ToastProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(aiService.status).toHaveBeenCalled());
    expect(await screen.findByText(/AI Service Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Sales Forecasting/i)).toBeInTheDocument();
    expect(screen.getByText(/Market Insights/i)).toBeInTheDocument();
    expect(screen.getByText(/Financial Analysis/i)).toBeInTheDocument();
  });
});
