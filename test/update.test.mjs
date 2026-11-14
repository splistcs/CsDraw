import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mock, test } from 'node:test';
import { UpdateService, UpdateStatus, releasesUrlFrom, shortError } from '../electron/core/update/UpdateService.js';

/** autoUpdater falso: `script(updater)` emite os eventos que o electron-updater emitiria durante a verificacao. */
function fakeUpdater(script = () => {}) {
  const updater = Object.assign(new EventEmitter(), {
    checks: 0,
    installs: [],
    async checkForUpdates() {
      this.checks += 1;
      this.emit('checking-for-update');
      await script(this);
    },
    quitAndInstall(...args) { this.installs.push(args); }
  });
  return updater;
}
const make = (updater, extra = {}) => new UpdateService({ updater, currentVersion: '2.0.0', releasesUrl: 'https://github.com/o/r/releases/latest', ...extra });
const quiet = () => mock.method(console, 'error', () => {});

test('sem updater (app nao empacotado) fica desativado e nunca verifica', async () => {
  const service = new UpdateService({ updater: null, currentVersion: '2.0.0' });
  assert.equal(service.state.status, UpdateStatus.DISABLED);
  assert.equal((await service.check()).status, UpdateStatus.DISABLED);
  const off = new UpdateService({ updater: fakeUpdater(), enabled: false, currentVersion: '2.0.0' });
  assert.equal(off.state.status, UpdateStatus.DISABLED);
  service.start(); service.stop();
});

test('configura o updater: baixa sozinho, instala ao fechar, ignora prereleases', () => {
  const updater = fakeUpdater();
  make(updater);
  assert.deepEqual([updater.autoDownload, updater.autoInstallOnAppQuit, updater.allowPrerelease], [true, true, false]);
});

test('fluxo completo: nova versao -> baixando -> pronta -> instalar', async () => {
  const updater = fakeUpdater((u) => {
    u.emit('update-available', { version: '2.1.0' });
    u.emit('download-progress', { percent: 41.6 });
  });
  const service = make(updater);
  const seen = [];
  service.onChange((state) => seen.push(`${state.status}:${state.version}:${state.percent}`));

  const state = await service.check();
  assert.deepEqual([state.status, state.version, state.percent], [UpdateStatus.DOWNLOADING, '2.1.0', 42]);

  assert.throws(() => service.install(), { code: 'NOT_FOUND' });
  updater.emit('update-downloaded', { version: '2.1.0' });
  assert.deepEqual([service.state.status, service.state.percent], [UpdateStatus.READY, 100]);

  service.install();
  assert.deepEqual(updater.installs, [[false, true]]);
  assert.deepEqual(seen, ['checking:null:0', 'downloading:2.1.0:0', 'downloading:2.1.0:42', 'ready:2.1.0:100']);
});

test('sem versao nova: em dia, e a versao instalada fica no estado', async () => {
  const service = make(fakeUpdater((u) => u.emit('update-not-available', { version: '2.0.0' })));
  const state = await service.check();
  assert.deepEqual([state.status, state.currentVersion, state.version], [UpdateStatus.UP_TO_DATE, '2.0.0', null]);
});

test('erro: estado de erro com mensagem curta, sem lancar; permite tentar de novo', async () => {
  quiet();
  let fail = true;
  const updater = fakeUpdater((u) => {
    if (fail) throw new Error(`404 latest.yml\n<html>${'x'.repeat(500)}</html>`);
    u.emit('update-not-available', {});
  });
  const service = make(updater);
  const state = await service.check();
  assert.equal(state.status, UpdateStatus.ERROR);
  assert.equal(state.error, '404 latest.yml');

  fail = false; // o erro nao trava o servico: a proxima verificacao roda normalmente
  const retry = await service.check();
  assert.equal(updater.checks, 2);
  assert.deepEqual([retry.status, retry.error], [UpdateStatus.UP_TO_DATE, null]);
  mock.restoreAll();
});

test('erro emitido pelo evento e pela promessa notifica uma vez so', async () => {
  quiet();
  const updater = fakeUpdater((u) => {
    const error = new Error('sem rede');
    u.emit('error', error);
    throw error;
  });
  const service = make(updater);
  const statuses = [];
  service.onChange((state) => statuses.push(state.status));
  await service.check();
  assert.deepEqual(statuses, ['checking', 'error']);
  mock.restoreAll();
});

test('verificacoes simultaneas viram uma so; durante download/pronta nao verifica de novo', async () => {
  let release;
  const updater = fakeUpdater(() => new Promise((resolve) => { release = resolve; }));
  const service = make(updater);
  const first = service.check();
  const second = service.check();
  assert.equal(first, second);
  assert.equal(updater.checks, 1);
  updater.emit('update-available', { version: '2.1.0' });
  release();
  await first;

  await service.check();
  assert.equal(updater.checks, 1, 'baixando: nao verifica');
  updater.emit('update-downloaded', { version: '2.1.0' });
  await service.check();
  assert.equal(updater.checks, 1, 'pronta: nao verifica');
});

test('start agenda a primeira verificacao e as periodicas; stop cancela', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const updater = fakeUpdater((u) => u.emit('update-not-available', {}));
  const service = make(updater, { startDelayMs: 1000, intervalMs: 5000 });
  service.start();
  service.start(); // idempotente
  assert.equal(updater.checks, 0);
  mock.timers.tick(1000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.checks, 1);
  mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.checks, 2);
  service.stop();
  mock.timers.tick(20000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.checks, 2);
  mock.timers.reset();
});

test('onChange: o retorno cancela a assinatura', async () => {
  const updater = fakeUpdater();
  const service = make(updater);
  let calls = 0;
  const off = service.onChange(() => { calls += 1; });
  updater.emit('checking-for-update');
  off();
  updater.emit('update-not-available', {});
  assert.equal(calls, 1);
});

test('releasesUrlFrom: so GitHub configurado de verdade', () => {
  const github = { provider: 'github', owner: 'fulano', repo: 'csdraw' };
  assert.equal(releasesUrlFrom(github), 'https://github.com/fulano/csdraw/releases/latest');
  assert.equal(releasesUrlFrom([{ provider: 's3' }, github]), 'https://github.com/fulano/csdraw/releases/latest');
  assert.equal(releasesUrlFrom({ ...github, owner: 'SEU-USUARIO' }), null, 'valor de exemplo nao conta');
  assert.equal(releasesUrlFrom({ ...github, repo: 'a/b' }), null);
  assert.equal(releasesUrlFrom({ provider: 'generic', url: 'https://x' }), null);
  assert.equal(releasesUrlFrom(undefined), null);
});

test('shortError: primeira linha, limitada', () => {
  assert.equal(shortError(new Error('a\nb')), 'a');
  assert.equal(shortError('x'.repeat(300)).length, 198);
  assert.equal(shortError(null), 'unknown');
});
