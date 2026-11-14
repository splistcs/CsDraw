/** Acesso unico a ponte do Electron (window.csdraw, definida no preload). */
const CODE_PATTERN = /^\[\[([A-Z_]+)\]\]\s?/;

/** Restaura `error.code` (enviado no prefixo da mensagem pelo preload). */
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

/** URL de uma midia do cofre, servida (e descriptografada) pelo protocolo csdraw-media. */
export const mediaUrl = (id) => `csdraw-media://media/${id}`;
