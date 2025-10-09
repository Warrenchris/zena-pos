import aiService from '../services/ai.service';
import api from '../services/api';

jest.mock('../services/api');

describe('ai.service', () => {
  afterEach(() => jest.resetAllMocks());

  test('status calls backend /api/ai/status', async () => {
    api.get.mockResolvedValue({ data: { ok: true, upstream: 'http://localhost:8000' } });
    const res = await aiService.status();
    expect(api.get).toHaveBeenCalledWith('/api/ai/status');
    expect(res.data.ok).toBe(true);
  });
});
