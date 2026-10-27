import { IDBFactory } from 'fake-indexeddb';
import {
  getDeviceId,
  getNextReceiptNumber,
  bumpAndGetNextReceiptNumber,
  bumpReceiptCounter,
  DEVICE_ID_KEY,
} from '../../offline/offlineNumbering';
import { closeDb } from '../../offline/idb';
import { classifyError } from '../../offline/salesSync';

describe('Offline Receipt Numbering & Collision Handling', () => {
  let fakeStorage;

  beforeEach(async () => {
    await closeDb();
    global.indexedDB = new IDBFactory();
    const data = {};
    fakeStorage = {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
      removeItem: (k) => {
        delete data[k];
      },
      clear: () => {
        Object.keys(data).forEach((k) => delete data[k]);
      },
    };
  });

  afterEach(async () => {
    await closeDb();
  });

  it('generates a 4-character uppercase alphanumeric deviceId and persists it', () => {
    const id1 = getDeviceId(fakeStorage);
    expect(id1).toMatch(/^[0-9A-Z]{4}$/);

    // Reading again returns the exact same persisted deviceId
    const id2 = getDeviceId(fakeStorage);
    expect(id2).toBe(id1);
    expect(fakeStorage.getItem(DEVICE_ID_KEY)).toBe(id1);
  });

  it('1,000 rapid concurrent calls produce 1,000 strictly unique, sequential receipt numbers', async () => {
    const deviceId = 'K8M2';
    const promises = Array.from({ length: 1000 }, () =>
      getNextReceiptNumber({ deviceId, storage: fakeStorage })
    );

    const numbers = await Promise.all(promises);
    expect(numbers.length).toBe(1000);

    const uniqueSet = new Set(numbers);
    expect(uniqueSet.size).toBe(1000);

    // Verify ordering and formatting: R-K8M2-000001 to R-K8M2-001000
    expect(numbers[0]).toBe('R-K8M2-000001');
    expect(numbers[999]).toBe('R-K8M2-001000');
  }, 15000);

  it('counter survives database reload / session restart', async () => {
    const deviceId = 'REL1';
    const n1 = await getNextReceiptNumber({ deviceId, storage: fakeStorage });
    const n2 = await getNextReceiptNumber({ deviceId, storage: fakeStorage });
    expect(n1).toBe('R-REL1-000001');
    expect(n2).toBe('R-REL1-000002');

    // Simulate page reload: close DB connection
    await closeDb();

    // Reopen and request next receipt number
    const n3 = await getNextReceiptNumber({ deviceId, storage: fakeStorage });
    expect(n3).toBe('R-REL1-000003');
  });

  it('falls back to storage adapter and triggers warning callback when IndexedDB is unavailable', async () => {
    const originalIDB = global.indexedDB;
    try {
      delete global.indexedDB;
      const deviceId = 'FLBK';
      const onFallback = jest.fn();

      const r1 = await getNextReceiptNumber({ deviceId, storage: fakeStorage, onFallback });
      const r2 = await getNextReceiptNumber({ deviceId, storage: fakeStorage, onFallback });

      expect(r1).toBe('R-FLBK-000001');
      expect(r2).toBe('R-FLBK-000002');
      expect(onFallback).toHaveBeenCalledWith(expect.stringContaining('IndexedDB is unavailable'));
    } finally {
      global.indexedDB = originalIDB;
    }
  });

  it('bumps counter past collision and retries with new sequence number', async () => {
    const deviceId = 'BUMP';
    const r1 = await getNextReceiptNumber({ deviceId, storage: fakeStorage });
    expect(r1).toBe('R-BUMP-000001');

    // Simulate server 409 collision on R-BUMP-000001: bump past it
    const rFresh = await bumpAndGetNextReceiptNumber({ deviceId, storage: fakeStorage });
    // Counter bumped by 1 and incremented to 3
    expect(rFresh).toBe('R-BUMP-000003');
  });

  describe('Offline Queue Sync Conflict Handling', () => {
    it('classifies 409 RECEIPT_NUMBER_ALREADY_EXISTS as conflict', () => {
      const err = {
        response: {
          status: 409,
          data: {
            code: 'RECEIPT_NUMBER_ALREADY_EXISTS',
            error: "Receipt number 'R-TEST-000001' already exists for this shop",
          },
        },
      };

      const outcome = classifyError(err);
      expect(outcome.kind).toBe('conflict');
      expect(outcome.status).toBe(409);
    });

    it('classifies general 400 errors as rejected', () => {
      const err = {
        response: {
          status: 400,
          data: { error: 'Invalid items payload' },
        },
      };

      const outcome = classifyError(err);
      expect(outcome.kind).toBe('rejected');
    });
  });
});
