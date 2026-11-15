export class DemoPlayback {
  static SPEEDS = [0.5, 1, 2, 4, 8];

  #min = 0;
  #max = 0;
  #time = 0;
  #speed = 1;
  #playing = false;
  #frame = null;
  #lastStamp = 0;
  #listeners = new Set();
  onEnded = () => {};

  get time() { return this.#time; }
  get duration() { return this.#max; }
  get min() { return this.#min; }
  get speed() { return this.#speed; }
  get playing() { return this.#playing; }

  snapshot() {
    return { time: this.#time, min: this.#min, duration: this.#max, playing: this.#playing, speed: this.#speed };
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  load(duration, { min = 0 } = {}) {
    this.pause();
    this.#max = Math.max(0, duration);
    this.#min = Math.min(Math.max(0, min), this.#max);
    this.#time = this.#min;
    this.#emit();
  }

  setMin(min) {
    this.#min = Math.min(Math.max(0, min), this.#max);
    this.#time = Math.max(this.#time, this.#min);
    this.#emit();
  }

  play() {
    if (this.#playing || this.#max === 0) return;
    if (this.#time >= this.#max) this.#time = this.#min;
    this.#playing = true;
    this.#lastStamp = performance.now();
    this.#frame = requestAnimationFrame(this.#tick);
    this.#emit();
  }

  pause() {
    if (!this.#playing) return;
    this.#playing = false;
    cancelAnimationFrame(this.#frame);
    this.#emit();
  }

  toggle() {
    if (this.#playing) this.pause(); else this.play();
  }

  seek(seconds) {
    this.#time = Math.min(this.#max, Math.max(this.#min, seconds));
    this.#emit();
  }

  setSpeed(speed) {
    this.#speed = speed;
    this.#emit();
  }

  stepSpeed(direction) {
    const index = DemoPlayback.SPEEDS.indexOf(this.#speed);
    const next = Math.min(DemoPlayback.SPEEDS.length - 1, Math.max(0, index + direction));
    this.setSpeed(DemoPlayback.SPEEDS[next]);
  }

  dispose() {
    this.pause();
    this.#listeners.clear();
  }

  #tick = (stamp) => {
    const elapsed = (stamp - this.#lastStamp) / 1000;
    this.#lastStamp = stamp;
    this.#time = Math.min(this.#max, this.#time + elapsed * this.#speed);
    if (this.#time >= this.#max) {
      this.#playing = false;
      this.#emit();
      this.onEnded();
      return;
    }
    this.#emit();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #emit() {
    this.#listeners.forEach((listener) => listener());
  }
}
