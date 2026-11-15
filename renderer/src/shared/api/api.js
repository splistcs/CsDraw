const CODE_PATTERN = /^\[\[([A-Z_]+)\]\]\s?/;

export function decodeError(error) {
  const message = String(error?.message ?? '');
  const match = CODE_PATTERN.exec(message);
  const decoded = new Error(match ? message.slice(match[0].length) : message);
  decoded.code = match ? match[1] : 'UNEXPECTED';
  return decoded;
}

function wrap(node) {
  if (typeof node === 'function') {
    return (...args) => {
      const result = node(...args);
      return typeof result?.then === 'function' ? result.catch((error) => { throw decodeError(error); }) : result;
    };
  }
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, wrap(value)]));
  return node;
}

export const api = window.csdraw ? wrap(window.csdraw) : undefined;

export const mediaUrl = (id) => `csdraw-media://media/${id}`;
