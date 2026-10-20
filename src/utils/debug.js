// Development-only logger. In a production build `import.meta.env.DEV` is
// false, so nothing is ever written to a visitor's browser console.
const enabled = import.meta.env.DEV;

export const debug = {
  log: (...args) => {
    if (enabled) console.log(...args);
  },
  info: (...args) => {
    if (enabled) console.info(...args);
  },
  warn: (...args) => {
    if (enabled) console.warn(...args);
  },
  error: (...args) => {
    if (enabled) console.error(...args);
  },
};
