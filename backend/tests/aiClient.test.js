const axios = require('axios');

jest.mock('axios');

// Mock jsonwebtoken so RS256 tests don't need a real RSA key pair in CI.
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'eyJmYWtlSldU.payload.signature'),
  verify: jest.requireActual('jsonwebtoken').verify,
  decode: jest.requireActual('jsonwebtoken').decode,
}));

const aiClient = require('../src/utils/aiClient');

describe('aiClient', () => {
  let prevApiKey;

  beforeAll(() => {
    prevApiKey = process.env.AI_SERVICE_API_KEY;
  });

  afterAll(() => {
    process.env.AI_SERVICE_API_KEY = prevApiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should inject Authorization header if AI_SERVICE_API_KEY is defined', async () => {
    process.env.AI_SERVICE_API_KEY = 'test-secret-token';
    axios.post.mockResolvedValue({ data: { success: true } });

    await aiClient.post('/api/test', { data: 123 });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      { data: 123 },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-secret-token'
        })
      })
    );
  });

  it('should fallback to signing a dynamic JWT if AI_SERVICE_API_KEY is not defined', async () => {
    delete process.env.AI_SERVICE_API_KEY;
    // Value doesn't matter — jwt.sign is mocked to return a fake token.
    process.env.JWT_PRIVATE_KEY = 'mock-private-key';

    axios.post.mockResolvedValue({ data: { success: true } });

    await aiClient.post('/api/test', { data: 123 }, { shopId: 5, userId: 101 });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      { data: 123 },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer eyJ/)
        })
      })
    );
  });

  it('should map 401 error to a 503 error', async () => {
    process.env.AI_SERVICE_API_KEY = 'test-token';
    const mockError = new Error('Request failed with status code 401');
    mockError.response = { status: 401, data: { detail: 'Unauthorized' } };
    axios.post.mockRejectedValue(mockError);

    await expect(aiClient.post('/api/test', {})).rejects.toThrow(
      'AI service authentication failed — check server configuration'
    );
  });

  it('should throw an error if userId is missing when signing a dynamic JWT', async () => {
    delete process.env.AI_SERVICE_API_KEY;
    process.env.JWT_PRIVATE_KEY = 'mock-private-key';

    await expect(aiClient.post('/api/test', {})).rejects.toThrow(
      '[aiClient] Cannot sign dynamic JWT token: userId is missing or invalid.'
    );
  });
});
