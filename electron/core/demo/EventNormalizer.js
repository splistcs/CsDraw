/** Agrupa a saida do parser por nome de evento, aceitando os formatos conhecidos. */
export class EventNormalizer {
  static group(raw) {
    const grouped = {};
    const push = (name, event) => {
      if (name && event && typeof event === 'object') (grouped[name] ??= []).push(event);
    };
    for (const item of Array.isArray(raw) ? raw : []) {
      if (Array.isArray(item)) {
        const [name, list] = item;
        (Array.isArray(list) ? list : []).forEach((event) => push(name, event));
      } else if (item?.event_name) {
        const nested = item.data ?? item.events ?? item.event;
        if (Array.isArray(nested)) nested.forEach((event) => push(item.event_name, event));
        else push(item.event_name, item);
      }
    }
    return grouped;
  }
}
