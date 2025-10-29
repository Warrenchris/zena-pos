// Lightweight toast system with improved visuals, stacking and accessibility
let toastContainer = null;
let isMobileLayout = false;

const ensureContainer = () => {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    left: auto;
    bottom: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 2147483647;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);

  const applyResponsive = () => {
    const wasMobile = isMobileLayout;
    isMobileLayout = window.innerWidth < 640; // tailwind sm breakpoint
    if (isMobileLayout !== wasMobile) {
      if (isMobileLayout) {
        toastContainer.style.top = 'auto';
        toastContainer.style.right = '16px';
        toastContainer.style.left = '16px';
        toastContainer.style.bottom = '16px';
        toastContainer.style.alignItems = 'center';
      } else {
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.left = 'auto';
        toastContainer.style.bottom = 'auto';
        toastContainer.style.alignItems = 'flex-end';
      }
    }
  };
  applyResponsive();
  window.addEventListener('resize', applyResponsive);
  return toastContainer;
};

const COLORS = {
  success: { bg: '#10b981', border: '#34d399', icon: '✔' },
  error: { bg: '#ef4444', border: '#f87171', icon: '✖' },
  info: { bg: '#3b82f6', border: '#60a5fa', icon: 'ℹ' },
  warning: { bg: '#f59e0b', border: '#fbbf24', icon: '⚠' }
};

const createToast = (message, type = 'success', opts = {}) => {
  const container = ensureContainer();
  const { duration = 3500, maxWidth = 380 } = opts;
  const palette = COLORS[type] || COLORS.info;

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
    pointer-events: auto;
    background: ${palette.bg};
    color: #0b1220;
    border: 1px solid ${palette.border};
    border-radius: 12px;
    padding: 10px 12px;
    max-width: ${Math.max(260, Math.min(560, maxWidth))}px;
    width: ${isMobileLayout ? '100%' : 'auto'};
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
    backdrop-filter: saturate(120%) blur(6px);
    transform: translateX(120%);
    transition: transform 0.3s ease, opacity 0.2s linear;
    opacity: 0.98;
  `;

  const content = document.createElement('div');
  content.style.cssText = 'display:flex; align-items:center; gap:10px;';

  const icon = document.createElement('span');
  icon.textContent = palette.icon;
  icon.style.cssText = 'font-size:14px; line-height:1;';

  const text = document.createElement('div');
  text.textContent = String(message);
  text.style.cssText = 'font-size:14px; line-height:1.4; color:#0b1220; word-break:break-word; overflow-y:auto; max-height: 120px;';

  const close = document.createElement('button');
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.style.cssText = `
    margin-left: 6px;
    background: transparent;
    border: 0;
    color: #0b1220;
    font-size: 16px;
    cursor: pointer;
    opacity: 0.8;
  `;
  close.onclick = () => removeToast(toast);

  const bar = document.createElement('div');
  bar.style.cssText = `
    position: relative;
    height: 3px;
    margin-top: 8px;
    background: rgba(0,0,0,0.15);
    border-radius: 999px;
    overflow: hidden;
  `;
  const fill = document.createElement('div');
  fill.style.cssText = `
    width: 100%; height: 100%; background: rgba(0,0,0,0.35); transform: translateX(0);
    transition: transform ${duration}ms linear;
  `;
  // start progress after mount
  setTimeout(() => { fill.style.transform = 'translateX(-100%)'; }, 30);

  bar.appendChild(fill);
  content.appendChild(icon);
  content.appendChild(text);
  content.appendChild(close);
  toast.appendChild(content);
  toast.appendChild(bar);

  // Insert at top
  if (container.firstChild) container.insertBefore(toast, container.firstChild); else container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  const timeout = setTimeout(() => removeToast(toast), duration + 200);
  toast._timeout = timeout;
  return toast;
};

const removeToast = (node) => {
  if (!node) return;
  try { clearTimeout(node._timeout); } catch (_) {}
  node.style.transform = 'translateX(120%)';
  setTimeout(() => node.parentNode && node.parentNode.removeChild(node), 250);
};

export const toast = {
  success: (message, opts) => createToast(message, 'success', opts),
  error: (message, opts) => createToast(message, 'error', opts),
  info: (message, opts) => createToast(message, 'info', opts),
  warning: (message, opts) => createToast(message, 'warning', opts),
  loading: (message, opts) => createToast(message, 'info', { duration: 60000, ...(opts || {}) }),
  promise: (promise, messages) => {
    const loadingToast = createToast(messages.loading || 'Loading...', 'info', { duration: 60000 });
    const cleanup = () => loadingToast && removeToast(loadingToast);
    return promise
      .then((result) => { cleanup(); createToast(messages.success || 'Success!', 'success'); return result; })
      .catch((error) => { cleanup(); createToast(messages.error || 'Error occurred', 'error'); throw error; });
  }
};
