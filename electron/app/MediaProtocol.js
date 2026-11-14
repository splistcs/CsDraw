import { Readable } from 'node:stream';

/**
 * Protocolo csdraw-media://media/<id>: serve midias do cofre descriptografando sob demanda,
 * com suporte a Range (permite avancar/retroceder em videos).
 */
export class MediaProtocol {
  static SCHEME = 'csdraw-media';

  static privilegedScheme() {
    return {
      scheme: MediaProtocol.SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    };
  }

  static register(protocol, { blobStore, mediaRepository }) {
    protocol.handle(MediaProtocol.SCHEME, async (request) => {
      try {
        const id = decodeURIComponent(new URL(request.url).pathname.slice(1));
        const item = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? mediaRepository.findItem(id) : null;
        if (!item) return new Response('Não encontrado', { status: 404 });

        const size = await blobStore.plainSize(id);
        const headers = { 'Content-Type': item.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
        if (size === 0) return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } });

        let start = 0;
        let end = size - 1;
        let status = 200;
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
        if (range && (range[1] || range[2])) {
          if (range[1] === '') {
            start = Math.max(0, size - Number(range[2]));
          } else {
            start = Number(range[1]);
            end = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
          }
          if (start > end || start >= size) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          }
          status = 206;
          headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        }
        headers['Content-Length'] = String(end - start + 1);
        return new Response(Readable.toWeb(blobStore.rangeStream(id, start, end)), { status, headers });
      } catch (error) {
        console.error('[csdraw-media]', error);
        return new Response('Erro ao ler a mídia', { status: 500 });
      }
    });
  }
}
