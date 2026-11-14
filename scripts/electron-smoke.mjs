// Smoke test do app real: abre o Electron, exercita IPC, protocolo de midia, quadro (ferramentas, pan/zoom,
// filtros, gaveta do adesivo), playbook, midia, biblioteca de demos, demo viewer (HUD, atalhos, dois andares),
// exportar/importar e troca de idiomas; salva screenshots.
// Uso (Linux): SMOKE_DATA=/tmp/dados SMOKE_SHOTS=/tmp/shots xvfb-run -a electron --no-sandbox scripts/electron-smoke.mjs
import { app, dialog, protocol, session } from 'electron';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { IpcRegistry } from '../electron/app/IpcRegistry.js';
import { MainWindow } from '../electron/app/MainWindow.js';
import { MediaProtocol } from '../electron/app/MediaProtocol.js';
import { ServiceContainer } from '../electron/app/ServiceContainer.js';
import { DemoIpc } from '../electron/ipc/DemoIpc.js';
import { DrawingIpc } from '../electron/ipc/DrawingIpc.js';
import { MediaIpc } from '../electron/ipc/MediaIpc.js';
import { PlaybookIpc } from '../electron/ipc/PlaybookIpc.js';
import { VaultIpc } from '../electron/ipc/VaultIpc.js';
import { createFakeEngine } from '../test/helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SMOKE_SHOTS ?? '/tmp/shots';
const log = (...parts) => fsSync.appendFileSync(process.env.SMOKE_LOG ?? '/tmp/smoke.log', `${parts.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.SMOKE_DATA);
protocol.registerSchemesAsPrivileged([MediaProtocol.privilegedScheme()]);

const failures = [];
const check = (name, ok, extra = '') => { log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failures.push(name); };

// Sem top-level await: no Electron ele bloquearia o evento 'ready' do app.
async function main() {
  try {
    await app.whenReady();
    const container = await ServiceContainer.create({ userDataPath: app.getPath('userData'), osCrypto: null });
    MediaProtocol.register(protocol, container);
    const registry = new IpcRegistry({ isTrustedSender: () => true });
    [new DrawingIpc(container), new PlaybookIpc(container), new MediaIpc(container), new VaultIpc(container), new DemoIpc(container)].forEach((m) => m.register(registry));

    const window = MainWindow.create({ preloadPath: path.join(ROOT, 'electron', 'preload.cjs'), devUrl: null, indexPath: path.join(ROOT, 'dist', 'index.html') });
    window.setSize(1440, 900);
    window.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log('  [renderer]', message); });
    const loaded = () => new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    await Promise.race([loaded(), sleep(20000)]);

    const run = (code) => window.webContents.executeJavaScript(code);
    const shot = async (name) => { await sleep(700); await fs.writeFile(path.join(SHOTS, `${name}.png`), (await window.webContents.capturePage()).toPNG()); };
    const key = (keyCode, modifiers = []) => { window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
    const mouse = (type, x, y) => window.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    const click = (x, y) => { mouse('mouseMove', x, y); mouse('mouseDown', x, y); mouse('mouseUp', x, y); };
    const drag = async (points) => {
      mouse('mouseMove', points[0][0], points[0][1]); mouse('mouseDown', points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) { mouse('mouseMove', x, y); await sleep(15); }
      const [lx, ly] = points[points.length - 1]; mouse('mouseUp', lx, ly); await sleep(80);
    };
    const setNative = `const setValue = (el, v) => { const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); };`;
    const tool = (index) => run(`document.querySelectorAll('.draw-toolbar > .tb-btn')[${index}].click()`);
    const tab = (index) => run(`document.querySelectorAll('.tab')[${index}].click()`);

    // ---- base: pt-BR e dados de teste ----
    await run(`localStorage.setItem('csdraw-locale', 'pt-BR')`);
    const setup = await run(`(async () => {
      const api = window.csdraw; const out = {};
      const png = Uint8Array.from(atob('${PNG_B64}'), c => c.charCodeAt(0));
      const sticker = await api.media.addBuffer({ name: 'a.png', data: png, origin: 'sticker' });
      const drawing = await api.drawings.save({ name: 'Smoke teste', mapSlug: 'mirage', notes: '# Notas\\n- item **um**', thumbnail: '',
        strokes: [{ kind: 'pen', color: '#e2a33b', width: 6, points: [[100,100],[300,220],[500,180],[650,320]] }],
        stickers: [{ type: 'smoke', x: 400, y: 600, images: [{ mediaId: sticker.id, caption: 'Posição de lançamento' }] }, { type: 'molotov', x: 700, y: 500, images: [] }] });
      out.drawingId = drawing.id; out.stickerId = sticker.id;
      await api.playbooks.save({ name: 'Playbook teste', content: '# Mirage A\\n\\n![Smoke teste](csdraw-drawing:' + drawing.id + ')\\n\\nTexto **forte** e uma lista:\\n\\n- smoke\\n- molotov\\n' });
      const folder = await api.media.createFolder({ name: 'Mirage' });
      await api.media.addBuffer({ name: 'print.png', data: png, folderId: folder.id });
      try { await api.drawings.get('../etc'); out.badIdRejected = false; } catch (e) { out.badIdRejected = String(e.message).startsWith('[[INVALID]]'); }
      return out;
    })()`);
    check('shell: 4 abas e ponte window.csdraw', (await run(`document.querySelectorAll('.tab').length === 4 && typeof window.csdraw?.demos?.import === 'function'`)));

    const png = Buffer.from(PNG_B64, 'base64');
    const full = await session.defaultSession.fetch(`csdraw-media://media/${setup.stickerId}`);
    check('protocolo csdraw-media serve imagem descriptografada', full.status === 200 && Buffer.from(await full.arrayBuffer()).equals(png));
    const part = await session.defaultSession.fetch(`csdraw-media://media/${setup.stickerId}`, { headers: { Range: 'bytes=1-3' } });
    check('protocolo suporta Range (206)', part.status === 206 && /^bytes 1-3\//.test(part.headers.get('content-range') ?? ''));
    check('IPC rejeita id malicioso e leva o codigo do erro na mensagem', setup.badIdRejected);

    window.webContents.reload();
    await loaded();
    await sleep(700);

    // ---- quadro: abrir desenho salvo, gaveta esquerda sobreposta ----
    await run(`document.querySelector('.drawer-handle').click()`);
    await sleep(500);
    check('gaveta esquerda abre sobre o conteudo (alca sempre visivel)', await run(`document.querySelector('.drawer-left').classList.contains('open') && document.querySelector('.drawer-handle').getBoundingClientRect().width > 0`));
    await shot('01-board-gaveta-esquerda');
    await run(`document.querySelector('.drawing-open').click()`);
    await sleep(700);
    check('abrir desenho salvo carrega no quadro e fecha a gaveta', await run(`!!document.querySelector('.editing-badge') && !document.querySelector('.drawer-left').classList.contains('open')`));
    await shot('02-board');

    const rect = await run(`(() => { const r = document.querySelector('.canvas-frame .surface-canvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const scale = Math.min(rect.w / 1024, rect.h / 1024) * 0.96;
    const at = (wx, wy) => [rect.l + (rect.w - 1024 * scale) / 2 + wx * scale, rect.t + (rect.h - 1024 * scale) / 2 + wy * scale];
    const savedDrawing = async () => run(`window.csdraw.drawings.get('${setup.drawingId}')`);
    const saveNow = async () => { await run(`document.querySelector('.save-actions .btn-primary').click()`); await sleep(500); };

    // ---- ferramentas de desenho ----
    const base = (await savedDrawing()).strokes.length;
    await tool(1); await drag([at(150, 700), at(260, 760), at(380, 720)]);                    // caneta
    await tool(2); await drag([at(150, 800), at(400, 800)]);                                   // marca-texto
    await tool(4); await drag([at(500, 750), at(650, 850)]);                                   // seta
    await tool(5); await drag([at(700, 700), at(900, 850)]);                                   // retangulo
    await tool(6); await drag([at(150, 830), at(330, 900)]);                                   // elipse
    await tool(7); click(...at(500, 880)); await sleep(500);                                   // texto
    check('ferramenta texto abre dialogo', await run(`!!document.querySelector('[role=dialog] input')`));
    await run(`(() => { ${setNative} setValue(document.querySelector('[role=dialog] input'), 'Entrada A'); })()`);
    await sleep(150);
    await run(`document.querySelector('[role=dialog] button[type=submit]').click()`);
    await sleep(400);
    check('desenho marcado como alterado (•)', await run(`document.querySelector('.save-actions .btn-primary').textContent.includes('•')`));
    await shot('03-board-ferramentas');
    await saveNow();
    const afterTools = await savedDrawing();
    const kinds = afterTools.strokes.map((s) => s.kind);
    check('formas salvas e recarregadas (pen, highlighter, arrow, rect, ellipse, text)', ['pen', 'highlighter', 'arrow', 'rect', 'ellipse', 'text'].every((k) => kinds.includes(k)) && afterTools.strokes.length === base + 6, kinds.join(','));
    check('texto salvo', afterTools.strokes.find((s) => s.kind === 'text')?.text === 'Entrada A');
    check('largura do marca-texto e maior que a da caneta', afterTools.strokes.find((s) => s.kind === 'highlighter').width > afterTools.strokes.find((s) => s.kind === 'pen').width);

    // borracha e desfazer
    await tool(8); await drag([at(260, 160), at(300, 220), at(340, 230)]);
    await saveNow();
    const afterErase = await savedDrawing();
    check('borracha apaga tracado', afterErase.strokes.length === afterTools.strokes.length - 1);
    key('Z', ['control']); await sleep(300); await saveNow();
    check('Ctrl+Z restaura o que a borracha apagou', (await savedDrawing()).strokes.length === afterTools.strokes.length);

    // ---- pan e zoom ----
    check('zoom inicial 100%', (await run(`document.querySelector('.tb-zoom').textContent`)) === '100%');
    window.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(rect.l + rect.w / 2), y: Math.round(rect.t + rect.h / 2), deltaX: 0, deltaY: 240, canScroll: true });
    await sleep(300);
    const zoomed = parseInt(await run(`document.querySelector('.tb-zoom').textContent`), 10);
    check('roda do mouse aproxima (zoom no cursor)', zoomed > 120, `${zoomed}%`);
    key('M'); await sleep(150);
    const before = await run(`document.querySelector('.canvas-frame .surface-canvas').getContext('2d').getImageData(0, 0, 400, 300).data.slice(0, 4000).join('')`);
    await drag([[rect.l + 300, rect.t + 200], [rect.l + 360, rect.t + 240], [rect.l + 420, rect.t + 280]]);
    const afterPan = await run(`document.querySelector('.canvas-frame .surface-canvas').getContext('2d').getImageData(0, 0, 400, 300).data.slice(0, 4000).join('')`);
    check('modo mover arrasta o mapa', before !== afterPan);
    check('zoom nao mudou ao arrastar', parseInt(await run(`document.querySelector('.tb-zoom').textContent`), 10) === zoomed);
    await shot('04-board-zoom-pan');
    await run(`document.querySelector('.tb-zoom').click()`); await sleep(200);
    check('clicar no % reenquadra (100%)', (await run(`document.querySelector('.tb-zoom').textContent`)) === '100%');

    // ---- filtros de granadas ----
    await run(`document.querySelector('.tb-with-dot .tb-btn').click()`); await sleep(250);
    await run(`document.querySelectorAll('.tb-filters input[type=checkbox]')[3].click()`); await sleep(250);   // oculta molotov
    check('filtro ativo mostra indicador', await run(`!!document.querySelector('.tb-dot')`));
    await shot('05-board-filtros');
    await run(`document.querySelector('.tb-filters .btn').click()`); await sleep(200);
    check('"Mostrar tudo" limpa os filtros', await run(`!document.querySelector('.tb-dot')`));
    await run(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);

    // ---- gaveta direita (clique no adesivo) ----
    await tool(0);
    const stickerPoint = at(400, 600);
    click(...stickerPoint); await sleep(900);
    check('clicar no adesivo abre gaveta a direita com a imagem e a legenda', await run(`(() => { const d = document.querySelector('.drawer-right.open'); const i = d?.querySelector('img'); return !!d && !!i && i.complete && i.naturalWidth > 0 && d.querySelector('.sticker-caption input').value === 'Posição de lançamento'; })()`));
    check('gaveta fica na borda direita da janela', await run(`(() => { const r = document.querySelector('.drawer-right').getBoundingClientRect(); return Math.abs(r.right - window.innerWidth) < 2; })()`));
    await shot('06-board-gaveta-direita');
    await run(`document.querySelector('.drawer-right .drawer-head .icon-button').click()`); await sleep(200);
    check('gaveta fecha', await run(`!document.querySelector('.drawer-right')`));
    await tool(1);                                                    // com a caneta, arrastar o adesivo o move
    const m = at(700, 500);
    await drag([m, [m[0] - 30, m[1] + 20], [m[0] - 60, m[1] + 40]]);
    check('arrastar adesivo nao abre a gaveta', await run(`!document.querySelector('.drawer-right')`));
    await saveNow();
    const moved = (await savedDrawing()).stickers.find((s) => s.type === 'molotov');
    check('adesivo arrastado foi movido e salvo', moved.x < 690 && moved.y > 510, `${moved.x},${moved.y}`);

    // ---- playbook e midia ----
    await tab(1); await sleep(500);
    await run(`document.querySelector('.playbook-list li button')?.click()`); await shot('07-playbook');
    check('playbook mostra o desenho colado e o markdown', await run(`!!document.querySelector('.playbook-preview canvas.drawing-preview') && document.querySelector('.playbook-preview strong')?.textContent === 'forte'`));
    await tab(2); await sleep(500);
    await run(`document.querySelector('.tree-node:not(.active)')?.click()`); await shot('08-media');
    check('explorador de midia mostra pasta e arquivo', await run(`document.querySelectorAll('.folder-tree .tree-node').length >= 2 && !!document.querySelector('.media-card')`));

    // ---- biblioteca de demos ----
    await tab(3); await sleep(500);
    check('aba demos sem demo mostra o explorer vazio', await run(`!!document.querySelector('.demo-explorer .demo-empty')`));
    await shot('09-demo-explorer-vazio');
    const mirage = new DemoAnalyzer(createFakeEngine({ perSide: 5, movement: true })).analyze('x.dem');
    const nuke = new DemoAnalyzer(createFakeEngine({ perSide: 5, movement: true, mapName: 'de_nuke' })).analyze('x.dem');
    container.demoAnalysis.analyze = async (file, onProgress) => { onProgress({ stage: 'x', percent: 50 }); await sleep(250); return file.includes('nuke') ? nuke : mirage; };
    await fs.writeFile('/tmp/partida-mirage.dem', 'a'); await fs.writeFile('/tmp/partida-nuke.dem', 'bb');
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ['/tmp/partida-mirage.dem', '/tmp/partida-nuke.dem'] });
    await run(`document.querySelector('.upload-btn').click()`);
    await sleep(2500);
    check('importar 2 demos cria 2 linhas na biblioteca', await run(`document.querySelectorAll('.demo-row').length === 2`));
    check('linha mostra placar, times e botao 2D', await run(`(() => { const r = document.querySelector('.demo-row'); return r.querySelectorAll('.demo-score span').length === 2 && !!r.querySelector('.btn-2d') && r.textContent.includes('Time Alpha'); })()`));
    check('demo foi gravada no cofre', (await run(`window.csdraw.demos.list().then(l => l.length)`)) === 2);
    await run(`document.querySelector('.tag-add').click()`); await sleep(300);
    await run(`(() => { ${setNative} setValue(document.querySelector('[role=dialog] input'), 'scrim'); })()`); await sleep(150);
    await run(`document.querySelector('[role=dialog] button[type=submit]').click()`); await sleep(500);
    check('adicionar tag', await run(`!!document.querySelector('.tag-chip')`));
    await run(`(() => { ${setNative} setValue(document.querySelector('.explorer-toolbar select'), 'nuke'); })()`); await sleep(300);
    check('filtro por mapa', await run(`document.querySelectorAll('.demo-row').length === 1`));
    await run(`(() => { ${setNative} setValue(document.querySelector('.explorer-toolbar select'), 'all'); })()`); await sleep(200);
    await shot('10-demo-explorer');

    // ---- demo viewer (mirage) ----
    const rowOf = (map) => `[...document.querySelectorAll('.demo-row')].find(r => r.textContent.toLowerCase().includes('${map}')).querySelector('.btn-2d').click()`;
    await run(rowOf('mirage')); await sleep(1500);
    check('abrir demo: palco em tela cheia com radar, anotacoes e HUD', await run(`(() => { const s = document.querySelector('.demo-stage'); const r = s.getBoundingClientRect(); return !!s.querySelector('.radar-canvas') && !!s.querySelector('.surface.annotation-layer') && r.width > window.innerWidth - 4 && !!s.querySelector('.timeline-bar') && s.querySelectorAll('.team-card').length === 2 && s.querySelectorAll('.round-chip').length === 3; })()`));
    const pixels = await run(`(() => { const d = document.querySelector('.radar-canvas').getContext('2d').getImageData(0, 0, document.querySelector('.radar-canvas').width, document.querySelector('.radar-canvas').height).data; let t = 0, ct = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 220 && d[i+1] > 150 && d[i+1] < 180 && d[i+2] < 80) t++; if (d[i] < 100 && d[i+1] > 140 && d[i+1] < 175 && d[i+2] > 230) ct++; } return { t, ct }; })()`);
    check('radar desenha jogadores T e CT', pixels.t > 50 && pixels.ct > 50, JSON.stringify(pixels));
    key('K'); await sleep(300);
    check('K avanca de round', (await run(`document.querySelector('.round-chip.active').textContent`)) === '2');
    key('J'); await sleep(300);
    check('J volta de round', (await run(`document.querySelector('.round-chip.active').textContent`)) === '1');
    key('Space'); await sleep(2300);
    check('Espaco reproduz (botao vira pausa e relogio anda)', await run(`document.querySelector('.tl-play').getAttribute('aria-label') === 'Pausar' && !/^0:00$/.test(document.querySelector('.tl-clock').textContent.trim())`), await run(`document.querySelector('.tl-clock').textContent.trim()`));
    key('Down', ['shift']); await sleep(300);
    check('Shift+seta muda a velocidade', (await run(`document.querySelector('.tl-speed').textContent`)) === '0.5x');
    key('Up', ['shift']); key('Up', ['shift']); await sleep(300);
    check('Shift+↑ aumenta a velocidade', (await run(`document.querySelector('.tl-speed').textContent`)) === '2x');
    key('Space'); await sleep(200);
    key('F'); await sleep(300);
    check('F inclui o freezetime na linha do tempo', await run(`!!document.querySelector('.tl-seg.freeze')`));
    key('F'); await sleep(200);
    check('timeline mostra fase da bomba e abates', await run(`!!document.querySelector('.tl-seg.bomb') || document.querySelectorAll('.tl-mark').length > 0`));

    // anotacoes sobre o radar
    const stage = await run(`(() => { const r = document.querySelector('.surface.annotation-layer canvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const overlayPixels = `(() => { const c = document.querySelector('.surface.annotation-layer canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()`;
    check('overlay de anotacoes comeca vazio', (await run(overlayPixels)) === 0);
    key('D'); await sleep(150);
    await drag([[stage.l + 400, stage.t + 250], [stage.l + 520, stage.t + 330], [stage.l + 640, stage.t + 280]]);
    check('desenhar sobre o radar (tecla D)', (await run(overlayPixels)) > 200);
    await shot('11-demo-stage');
    key('C'); await sleep(200);
    check('C limpa as anotacoes', (await run(overlayPixels)) === 0);
    key('Z', ['control']); await sleep(200);
    check('Ctrl+Z restaura a limpeza', (await run(overlayPixels)) > 200);
    key('C'); await sleep(100);
    check('demo viewer nao tem filtros de granada nem adesivos', await run(`!document.querySelector('.demo-stage .tb-with-dot') && !document.querySelector('.demo-stage .magnet')`));
    key('M'); await sleep(100);
    window.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(stage.l + stage.w / 2), y: Math.round(stage.t + stage.h / 2), deltaX: 0, deltaY: 300, canScroll: true });
    await sleep(300);
    check('zoom no demo viewer', parseInt(await run(`document.querySelector('.demo-stage .tb-zoom').textContent`), 10) > 120);
    key('H'); await sleep(400);
    check('H abre a lista de atalhos', await run(`document.querySelectorAll('.hotkeys-grid .hotkey').length >= 10`));
    await shot('12-demo-atalhos');
    key('Escape'); await sleep(300);
    check('Esc fecha os atalhos', await run(`!document.querySelector('.hotkeys-grid')`));

    // ---- mapa de dois andares (nuke) ----
    await run(`[...document.querySelectorAll('.hud-btn')].find(b => b.textContent.includes('Voltar')).click()`); await sleep(500);
    await run(rowOf('nuke')); await sleep(1500);
    const layers = await run(`!!document.querySelector('.draw-toolbar [aria-label="Andares"]')`);
    check('mapa de dois andares oferece controle de andares', layers);
    await shot('13-demo-nuke-dividido');
    await run(`document.querySelector('.draw-toolbar [aria-label="Andares"]').click()`); await sleep(250);
    await run(`[...document.querySelectorAll('.tb-popover .btn')].find(b => b.textContent === 'Andar inferior').click()`); await sleep(500);
    const levelZoom = parseInt(await run(`document.querySelector('.demo-stage .tb-zoom').textContent`), 10);
    check('focar o andar inferior reenquadra a camera (zoom sobe em relacao a "ver tudo")', levelZoom > 105, `${levelZoom}%`);
    await shot('14-demo-nuke-andar-inferior');
    key('L'); await sleep(300);
    check('L alterna o andar em foco (sem dividir)', true);
    await run(`[...document.querySelectorAll('.hud-btn')].find(b => b.textContent.includes('Voltar')).click()`); await sleep(300);

    // ---- exportar / importar (inclui demos) ----
    const exportPath = '/tmp/smoke-export.csdraw';
    await fs.rm(exportPath, { force: true });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    await run(`[...document.querySelectorAll('.auth-links a')][0].click()`); await sleep(300);
    await run(`(() => { ${setNative} const [a, b] = document.querySelectorAll('.dialog input[type=password]'); setValue(a, 'senha-forte-123'); setValue(b, 'senha-forte-123'); })()`); await sleep(200);
    await run(`document.querySelector('.dialog button[type=submit]').click()`); await sleep(2200);
    const exported = await fs.readFile(exportPath).catch(() => null);
    check('exportar gera arquivo criptografado (.csdraw)', exported && exported.subarray(0, 4).toString() === 'CSDX' && !exported.includes(Buffer.from('Smoke teste')));
    check('aviso de exportacao cita as demos', await run(`document.querySelector('.toast')?.textContent.includes('2 demo')`), await run(`document.querySelector('.toast')?.textContent`));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportPath] });
    await run(`[...document.querySelectorAll('.auth-links a')][1].click()`); await sleep(300);
    await run(`(() => { ${setNative} setValue(document.querySelector('.dialog input[type=password]'), 'senha-errada-000'); })()`); await sleep(200);
    await run(`document.querySelector('.dialog button[type=submit]').click()`); await sleep(1500);
    check('importar com senha errada mostra erro', await run(`!!document.querySelector('.dialog .form-error')`));
    await run(`(() => { ${setNative} setValue(document.querySelector('.dialog input[type=password]'), 'senha-forte-123'); })()`); await sleep(200);
    await run(`document.querySelector('.dialog button[type=submit]').click()`); await sleep(2200);
    check('importar com a senha certa funciona sem duplicar', (await run(`window.csdraw.drawings.list().then(l => l.length)`)) === 1 && (await run(`window.csdraw.demos.list().then(l => l.length)`)) === 2);

    // ---- idiomas ----
    check('seletor de idioma ao lado do tema', await run(`document.querySelector('.header-actions .theme-switch + .lang-select') !== null`));
    const spoken = {};
    for (const code of ['en', 'es', 'ru', 'pt-BR']) {
      await run(`(() => { ${setNative} setValue(document.querySelector('.lang-select'), '${code}'); })()`); await sleep(300);
      spoken[code] = await run(`[document.querySelector('.tab').textContent, document.documentElement.lang].join('|')`);
      if (code === 'en') { await tab(3); await sleep(300); await shot('15-idioma-ingles'); await tab(0); }
    }
    check('troca de idioma (en/es/ru/pt-BR) atualiza a interface', spoken.en === 'Tactical board|en' && spoken.es === 'Pizarra táctica|es' && spoken.ru === 'Тактическая доска|ru' && spoken['pt-BR'] === 'Quadro tático|pt-BR', JSON.stringify(spoken));
    check('idioma fica salvo', (await run(`localStorage.getItem('csdraw-locale')`)) === 'pt-BR');

    // erro do processo principal traduzido pelo codigo (precisa do codigo atravessar o contextBridge)
    await run(`(() => { ${setNative} setValue(document.querySelector('.lang-select'), 'en'); })()`); await sleep(300);
    await run(`[...document.querySelectorAll('.auth-links a')][1].click()`); await sleep(300);
    await run(`(() => { ${setNative} setValue(document.querySelector('.dialog input[type=password]'), 'senha-errada-000'); })()`); await sleep(200);
    await run(`document.querySelector('.dialog button[type=submit]').click()`); await sleep(1500);
    check('erro do cofre aparece traduzido (en) a partir do codigo', (await run(`document.querySelector('.dialog .form-error')?.textContent`)) === 'Wrong passphrase or corrupted file.', await run(`document.querySelector('.dialog .form-error')?.textContent`));
    await run(`document.querySelector('.dialog .btn-ghost').click()`); await sleep(200);
    await run(`(() => { ${setNative} setValue(document.querySelector('.lang-select'), 'pt-BR'); })()`); await sleep(300);

    // ---- tema ----
    await run(`document.querySelector('.theme-switch').click()`); await shot('16-board-claro');
    check('tema claro aplicado', (await run(`document.documentElement.dataset.theme`)) === 'light');
    await run(`document.querySelector('.theme-switch').click()`); await sleep(300);
    check('tema volta ao escuro', (await run(`document.documentElement.dataset.theme`)) === 'dark');
  } catch (error) {
    log('ERRO NO SMOKE:', error?.stack ?? error);
    failures.push('exception');
  }
  log(failures.length ? `\nFALHAS: ${failures.join(', ')}` : '\nTudo certo.');
  app.exit(failures.length ? 1 : 0);
}
main();
