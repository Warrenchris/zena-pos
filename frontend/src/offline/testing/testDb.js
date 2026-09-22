/* Test helper: an in-memory IndexedDB for jsdom (which has none), plus a clean slate per test. */
if (typeof global.structuredClone !== 'function') {
  // fake-indexeddb needs structuredClone, which jsdom's environment doesn't expose.
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}
require('fake-indexeddb/auto');

const { IDBFactory } = require('fake-indexeddb');
const { closeDb } = require('../idb');
const { resetQueueBackend } = require('../salesQueue');

/** Call from beforeEach: brand-new empty database and localStorage. */
export async function freshDatabase() {
  await closeDb();
  global.indexedDB = new IDBFactory();
  resetQueueBackend();
  window.localStorage.clear();
}
