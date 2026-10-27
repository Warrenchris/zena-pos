const elements = new Set();

if (typeof window === 'undefined') {
  global.window = global;
}
if (!global.window.location) {
  global.window.location = { href: 'http://localhost/', origin: 'http://localhost' };
}
if (!global.window.navigator) {
  global.window.navigator = {};
}
if (!global.document) {
  function createStyle() {
    const s = { width: '', height: '', border: '', visibility: '', position: '', right: '', bottom: '' };
    Object.defineProperty(s, 'cssText', {
      get() { return ''; },
      set(val) {
        val.split(';').forEach(rule => {
          const parts = rule.split(':').map(str => str && str.trim());
          if (parts[0] && parts[1] !== undefined) {
            s[parts[0]] = parts[1] === '0' ? '0px' : parts[1];
          }
        });
      }
    });
    return s;
  }

  global.document = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        style: createStyle(),
        srcdoc: '',
        onload: null,
        parentNode: null,
        setAttribute: jest.fn(),
        getAttribute: jest.fn(() => null),
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        remove() {
          elements.delete(this);
          if (this.parentNode) {
            this.parentNode.removeChild(this);
          }
        },
        contentWindow: {
          focus: jest.fn(),
          print: jest.fn(),
          addEventListener: jest.fn(),
          document: { open: jest.fn(), write: jest.fn(), close: jest.fn(), body: { childElementCount: 0 } }
        }
      };
      return el;
    },
    body: {
      appendChild(child) {
        elements.add(child);
        child.parentNode = global.document.body;
        return child;
      },
      removeChild(child) {
        elements.delete(child);
        child.parentNode = null;
        return child;
      },
      contains(child) {
        return elements.has(child);
      },
      get innerHTML() {
        return '';
      },
      set innerHTML(val) {
        if (!val) elements.clear();
      }
    }
  };
}
if (!global.localStorage) {
  const storage = {};
  global.localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };
}
if (!global.window.print) {
  global.window.print = jest.fn();
}
