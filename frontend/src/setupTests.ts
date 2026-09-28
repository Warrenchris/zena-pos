// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = window.ResizeObserver || ResizeObserverMock;
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;