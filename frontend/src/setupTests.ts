// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = window.ResizeObserver || ResizeObserverMock;
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

if (typeof global.TextEncoder === 'undefined' || typeof window.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  window.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  window.TextDecoder = TextDecoder;
}
