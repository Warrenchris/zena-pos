/**
 * Browser print adapter: universal fallback that works on every device.
 *
 * Prints the receipt HTML from a hidden iframe, so the app UI behind it never
 * ends up on paper and no global print CSS is needed. The output goes through
 * whatever printer the OS/browser has selected (driver-based thermal printers,
 * office printers, "Save as PDF").
 */

const LOAD_TIMEOUT_MS = 5000;
const CLEANUP_DELAY_MS = 60000;

function printHtmlInIframe(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

    let settled = false;
    const cleanup = () => iframe.parentNode && iframe.parentNode.removeChild(iframe);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const timeout = setTimeout(() => fail(new Error('Receipt failed to load for printing')), LOAD_TIMEOUT_MS);

    iframe.onload = () => {
      if (settled) return;
      clearTimeout(timeout);
      try {
        const win = iframe.contentWindow;
        win.focus();
        win.print();
        settled = true;
        resolve();
        // print() returns once the dialog opens; keep the frame until it is done.
        win.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, CLEANUP_DELAY_MS);
      } catch (error) {
        fail(error);
      }
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

export const browserPrintAdapter = {
  id: 'browser',
  label: 'Browser / system printer',

  isSupported() {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.print === 'function';
  },

  /** @param {import('../printService').PrintJob} job */
  async print(job) {
    await printHtmlInIframe(job.html());
  },
};
