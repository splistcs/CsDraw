import { AppError } from '../errors/AppError.js';

export const UpdateStatus = Object.freeze({
  DISABLED: 'disabled',
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  UP_TO_DATE: 'up-to-date',
  ERROR: 'error'
});

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const BUSY = new Set([UpdateStatus.CHECKING, UpdateStatus.DOWNLOADING, UpdateStatus.READY]);

export function shortError(error) {
  const first = String(error?.message ?? error ?? '').split('\n')[0].trim();
  if (!first) return 'unknown';
  return first.length > 200 ? `${first.slice(0, 197)}…` : first;
}

export function releasesUrlFrom(publish) {
  const entry = (Array.isArray(publish) ? publish : [publish]).find((item) => item?.provider === 'github');
  const valid = (value) => typeof value === 'string' && /^[\w.-]+$/.test(value);
  if (!entry || !valid(entry.owner) || !valid(entry.repo) || /^SEU[-_]/i.test(entry.owner)) return null;
  return `https://github.com/${entry.owner}/${entry.repo}/releases/latest`;
}

export class UpdateService {
  #updater;
  #state;
  #listeners = new Set();
  #inflight = null;
  #timers = [];
  #intervalMs;
  #startDelayMs;

  constructor({ updater = null, enabled = true, currentVersion, releasesUrl = null, intervalMs = FOUR_HOURS, startDelayMs = 10_000 }) {
    this.#updater = enabled && updater ? updater : null;
    this.#intervalMs = intervalMs;
    this.#startDelayMs = startDelayMs;
    this.#state = Object.freeze({
      status: this.#updater ? UpdateStatus.IDLE : UpdateStatus.DISABLED,
      currentVersion,
      version: null,
      percent: 0,
      error: null,
      releasesUrl
    });
    if (this.#updater) this.#bind();
  }

  get state() {
    return this.#state;
  }

  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start() {
    if (!this.#updater || this.#timers.length) return;
    const first = setTimeout(() => void this.check(), this.#startDelayMs);
    const every = setInterval(() => void this.check(), this.#intervalMs);
    this.#timers = [first, every];
    this.#timers.forEach((timer) => timer.unref?.());
  }

  stop() {
    this.#timers.forEach((timer) => { clearTimeout(timer); clearInterval(timer); });
    this.#timers = [];
  }

  check() {
    if (!this.#updater) return Promise.resolve(this.#state);
    if (this.#inflight) return this.#inflight;
    if (BUSY.has(this.#state.status)) return Promise.resolve(this.#state);
    this.#inflight = (async () => {
      try {
        await this.#updater.checkForUpdates();
      } catch (error) {
        this.#fail(error);
      } finally {
        this.#inflight = null;
      }
      return this.#state;
    })();
    return this.#inflight;
  }

  install() {
    if (this.#state.status !== UpdateStatus.READY) throw new AppError('No update is ready to install.', 'NOT_FOUND');
    this.#updater.quitAndInstall(false, true);
  }

  #bind() {
    const u = this.#updater;
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.allowPrerelease = false;
    u.on('checking-for-update', () => this.#set({ status: UpdateStatus.CHECKING, error: null }));
    u.on('update-available', (info) => this.#set({ status: UpdateStatus.DOWNLOADING, version: info?.version ?? null, percent: 0, error: null }));
    u.on('update-not-available', () => this.#set({ status: UpdateStatus.UP_TO_DATE, version: null, percent: 0, error: null }));
    u.on('download-progress', (progress) => this.#set({ status: UpdateStatus.DOWNLOADING, percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))) }));
    u.on('update-downloaded', (info) => this.#set({ status: UpdateStatus.READY, version: info?.version ?? this.#state.version, percent: 100, error: null }));
    u.on('error', (error) => this.#fail(error));
  }

  #fail(error) {
    console.error('[update]', error);
    this.#set({ status: UpdateStatus.ERROR, error: shortError(error) });
  }

  #set(patch) {
    const next = { ...this.#state, ...patch };
    if (Object.keys(next).every((key) => next[key] === this.#state[key])) return;
    this.#state = Object.freeze(next);
    this.#listeners.forEach((listener) => listener(this.#state));
  }
}
