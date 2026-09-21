import { browserPrintAdapter } from '../adapters/browserPrintAdapter';

const job = { html: () => '<html><body>receipt</body></html>' };

/** Make the next created <iframe> report a controllable contentWindow. */
function stubIframe(fakeWindow) {
  const realCreate = document.createElement.bind(document);
  let created = null;
  jest.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
    const el = realCreate(tag, ...rest);
    if (tag === 'iframe') {
      Object.defineProperty(el, 'contentWindow', { value: fakeWindow });
      created = el;
    }
    return el;
  });
  return () => created;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('browserPrintAdapter', () => {
  it('is supported wherever window.print exists', () => {
    expect(browserPrintAdapter.id).toBe('browser');
    expect(browserPrintAdapter.isSupported()).toBe(true);
  });

  it('prints the receipt HTML from a hidden iframe, then removes it after printing', async () => {
    const listeners = {};
    const fakeWindow = {
      focus: jest.fn(),
      print: jest.fn(),
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
    };
    const getIframe = stubIframe(fakeWindow);

    const promise = browserPrintAdapter.print(job);
    const iframe = getIframe();
    expect(iframe.srcdoc).toBe(job.html());
    expect(document.body.contains(iframe)).toBe(true);
    expect(iframe.style.width).toBe('0px');

    iframe.onload();
    await promise;

    expect(fakeWindow.print).toHaveBeenCalledTimes(1);
    listeners.afterprint();
    expect(document.body.contains(iframe)).toBe(false);
  });

  it('rejects and cleans up when print() throws', async () => {
    const fakeWindow = {
      focus: jest.fn(),
      print: jest.fn(() => {
        throw new Error('print blocked');
      }),
      addEventListener: jest.fn(),
    };
    const getIframe = stubIframe(fakeWindow);

    const promise = browserPrintAdapter.print(job);
    const iframe = getIframe();
    iframe.onload();

    await expect(promise).rejects.toThrow('print blocked');
    expect(document.body.contains(iframe)).toBe(false);
  });

  it('rejects if the receipt frame never loads', async () => {
    jest.useFakeTimers();
    const getIframe = stubIframe({ focus: jest.fn(), print: jest.fn(), addEventListener: jest.fn() });

    const promise = browserPrintAdapter.print(job);
    const iframe = getIframe();
    jest.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow('failed to load');
    expect(document.body.contains(iframe)).toBe(false);
  });

  it('prints without waiting for a slow logo once the receipt text has loaded', async () => {
    jest.useFakeTimers();
    const fakeWindow = {
      focus: jest.fn(),
      print: jest.fn(),
      addEventListener: jest.fn(),
      document: { body: { childElementCount: 12 } }, // receipt text is there, load event still pending
    };
    const getIframe = stubIframe(fakeWindow);

    const promise = browserPrintAdapter.print(job);
    jest.advanceTimersByTime(5000);

    await expect(promise).resolves.toBeUndefined();
    expect(fakeWindow.print).toHaveBeenCalledTimes(1);
    expect(getIframe()).not.toBeNull();
  });
});
