/* eslint-env jest */
import { freshDatabase } from '../testing/testDb';
import { createEntry, listQueue, saveEntry } from '../salesQueue';
import { MAX_SERVER_ERROR_ATTEMPTS, classifyError, flushSales, hasQueueOwner, registerQueueOwner, requeueEntry } from '../salesSync';

const sale = (n) => ({ items: [{ productId: n, quantity: 1, price: 100 }], total: 100, paymentMethod: 'cash' });
const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

async function queue(count, cashierId = 7) {
  const entries = [];
  for (let i = 1; i <= count; i += 1) {
    const entry = { ...createEntry(sale(i), cashierId), queuedAt: 1000 * i };
    await saveEntry(entry);
    entries.push(entry);
  }
  return entries;
}

const apiWith = (post) => ({ post: jest.fn(post) });
const statusOf = async (id) => (await listQueue(7)).find((e) => e.id === id);

beforeEach(freshDatabase);

describe('classifyError', () => {
  it('sorts server answers into what to do next', () => {
    expect(classifyError(networkError()).kind).toBe('offline');
    expect(classifyError(httpError(401)).kind).toBe('auth');
    expect(classifyError(httpError(403)).kind).toBe('blocked');
    expect(classifyError(httpError(402)).kind).toBe('blocked');
    [408, 425, 429].forEach((s) => expect(classifyError(httpError(s)).kind).toBe('busy'));
    [500, 502, 503].forEach((s) => expect(classifyError(httpError(s)).kind).toBe('server'));
    [400, 404, 409, 422].forEach((s) => expect(classifyError(httpError(s)).kind).toBe('rejected'));
  });

  it('uses the server’s own message when it sends one', () => {
    expect(classifyError(httpError(400, { error: 'Insufficient stock for Sugar' })).message).toBe('Insufficient stock for Sugar');
    expect(classifyError(httpError(400, { message: 'Bad sale' })).message).toBe('Bad sale');
  });
});

describe('flushSales', () => {
  it('sends each sale oldest first, with its idempotency key, and removes it once accepted', async () => {
    const [first, second] = await queue(2);
    const api = apiWith(async () => ({ data: { id: 'sale-1' } }));

    const summary = await flushSales({ cashierId: 7, api });

    expect(api.post.mock.calls.map((c) => c[0])).toEqual(['/api/sales', '/api/sales']);
    expect(api.post.mock.calls[0][1].idempotencyKey).toBe(first.id);
    expect(api.post.mock.calls[1][1].idempotencyKey).toBe(second.id);
    expect(summary).toMatchObject({ synced: 2, failed: 0, remaining: 0, offline: false, blocked: null });
    expect(summary.syncedResponses).toHaveLength(2);
    expect(await listQueue(7)).toEqual([]);
  });

  it('keeps every sale when there is no connection, and does not count it as an attempt', async () => {
    const [a, b] = await queue(2);
    const api = apiWith(async () => {
      throw networkError();
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(api.post).toHaveBeenCalledTimes(1); // no point trying the rest
    expect(summary).toMatchObject({ synced: 0, offline: true, remaining: 2 });
    expect((await statusOf(a.id)).attempts).toBe(0);
    expect(await statusOf(b.id)).toBeDefined();
  });

  it('keeps sales when the session has expired (401) and asks for a new sign-in; nothing is lost', async () => {
    const [a] = await queue(2);
    const api = apiWith(async () => {
      throw httpError(401, { error: 'Token expired' });
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ blocked: 'auth', remaining: 2, failed: 0 });
    expect(await statusOf(a.id)).toMatchObject({ status: 'pending', lastError: 'Token expired' });
    expect(await listQueue(7)).toHaveLength(2);
  });

  it.each([
    [403, 'blocked'],
    [429, 'busy'],
  ])('keeps sales and stops on %i', async (status, kind) => {
    await queue(2);
    const api = apiWith(async () => {
      throw httpError(status, { error: 'Try later' });
    });
    const summary = await flushSales({ cashierId: 7, api });
    expect(summary).toMatchObject({ blocked: kind, remaining: 2 });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('marks a sale the server refuses as failed, keeps it, and carries on with the others', async () => {
    const [bad, good] = await queue(2);
    const api = apiWith(async (url, body) => {
      if (body.idempotencyKey === bad.id) throw httpError(400, { error: 'Insufficient stock for Sugar' });
      return { data: { id: 'ok' } };
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(summary).toMatchObject({ synced: 1, failed: 1, remaining: 0 });
    expect(await statusOf(bad.id)).toMatchObject({ status: 'failed', lastError: 'Insufficient stock for Sugar', attempts: 1 });
    expect(await statusOf(good.id)).toBeUndefined();
  });

  it('does NOT treat a 409 as success (it is a conflict a person must look at) and never drops the sale', async () => {
    const [entry] = await queue(1);
    const api = apiWith(async () => {
      throw httpError(409, { error: 'Idempotency key was already used for a different sale' });
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(await statusOf(entry.id)).toMatchObject({ status: 'failed' });
  });

  it('retries a server error later but does not let one bad sale block the rest', async () => {
    const [bad, good] = await queue(2);
    const api = apiWith(async (url, body) => {
      if (body.idempotencyKey === bad.id) throw httpError(500);
      return { data: {} };
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(summary).toMatchObject({ synced: 1, failed: 0, remaining: 1 });
    expect(await statusOf(bad.id)).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await statusOf(good.id)).toBeUndefined();
  });

  it(`gives up on a sale that keeps hitting server errors after ${MAX_SERVER_ERROR_ATTEMPTS} tries, but keeps it for review`, async () => {
    const [entry] = await queue(1);
    await saveEntry({ ...entry, attempts: MAX_SERVER_ERROR_ATTEMPTS - 1 });
    const api = apiWith(async () => {
      throw httpError(500);
    });

    const summary = await flushSales({ cashierId: 7, api });

    expect(summary.failed).toBe(1);
    expect(await statusOf(entry.id)).toMatchObject({ status: 'failed', attempts: MAX_SERVER_ERROR_ATTEMPTS });
  });

  it('leaves failed sales alone (they wait for a person) and only sends pending ones', async () => {
    const [entry] = await queue(1);
    await saveEntry({ ...entry, status: 'failed', lastError: 'Out of stock' });
    const api = apiWith(async () => ({ data: {} }));

    const summary = await flushSales({ cashierId: 7, api });

    expect(api.post).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ synced: 0, remaining: 0 });
  });

  it('only sends the given cashier’s sales', async () => {
    await queue(1, 7);
    await queue(1, 8);
    const api = apiWith(async () => ({ data: {} }));
    await flushSales({ cashierId: 7, api });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await listQueue(8)).toHaveLength(1);
  });

  it('runs one flush at a time; a second caller shares the result and is told it joined', async () => {
    await queue(1);
    let release;
    const api = apiWith(() => new Promise((resolve) => (release = () => resolve({ data: {} }))));

    const first = flushSales({ cashierId: 7, api });
    const second = flushSales({ cashierId: 7, api });
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(api.post).toHaveBeenCalledTimes(1); // the sale is sent once, not twice
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(true);
    expect(b.synced).toBe(1);
  });

  it('puts a failed sale back in the queue for another try', async () => {
    const [entry] = await queue(1);
    await saveEntry({ ...entry, status: 'failed', attempts: 3, lastError: 'Out of stock' });

    await requeueEntry(await statusOf(entry.id));

    expect(await statusOf(entry.id)).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
  });
});

describe('queue owner registration', () => {
  it('tracks whether the dashboard is currently looking after the queue', () => {
    expect(hasQueueOwner()).toBe(false);
    const release = registerQueueOwner();
    expect(hasQueueOwner()).toBe(true);
    release();
    expect(hasQueueOwner()).toBe(false);
  });
});
