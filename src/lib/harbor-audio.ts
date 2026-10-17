/**
 * Harbor sound, synthesized live with the Web Audio API (no audio files, so nothing to license).
 *  - waves(): soft surf. Filtered noise with slow, randomly timed swells panned across the stereo field.
 *  - lamp(on): a heavy mechanical switch, then the lamp warming up (or cooling down).
 * Browsers only allow audio after a user gesture, so nothing plays until start() is called from a click.
 */
export class HarborAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private swellTimer: ReturnType<typeof setTimeout> | null = null;
  private hum: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private _muted = false;

  get muted() {
    return this._muted;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  start() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this.noise = this.makeNoise(4);
      this.startSurf();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  }

  dispose() {
    if (this.swellTimer) clearTimeout(this.swellTimer);
    void this.ctx?.close();
    this.ctx = null;
  }

  // ------------------------------------------------------------ building blocks
  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // pink-ish noise (Paul Kellet's filter): fuller and softer than white noise, like water
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random() * 2;
    return src;
  }

  /** A low, constant wash plus individual swells that rise and break. */
  private startSurf() {
    const ctx = this.ctx!;
    // distant bed
    const bed = this.noiseSource();
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = "lowpass";
    bedLp.frequency.value = 420;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedGain.gain.setTargetAtTime(0.16, ctx.currentTime, 1.5);
    bed.connect(bedLp).connect(bedGain).connect(this.master!);
    bed.start();
    // slow breathing on the bed
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(bedGain.gain);
    lfo.start();

    const swell = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime + 0.05;
      const rise = 1.6 + Math.random() * 1.4;
      const fall = 2.6 + Math.random() * 2.2;
      const peak = 0.16 + Math.random() * 0.14;
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.4;
      lp.frequency.setValueAtTime(280, t);
      lp.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 900, t + rise); // the break brightens
      lp.frequency.exponentialRampToValueAtTime(300, t + rise + fall);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + rise);
      g.gain.exponentialRampToValueAtTime(0.0001, t + rise + fall);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(Math.random() * 1.2 - 0.6, t);
      pan.pan.linearRampToValueAtTime(Math.random() * 1.2 - 0.6, t + rise + fall);
      src.connect(lp).connect(g).connect(pan).connect(this.master!);
      src.start(t);
      src.stop(t + rise + fall + 0.1);
      this.swellTimer = setTimeout(swell, (rise + fall * 0.55 + Math.random() * 2.5) * 1000);
    };
    this.swellTimer = setTimeout(swell, 600);
  }

  /** Heavy brass switch, then the lamp warming up (on) or ticking as it cools (off). */
  lamp(on: boolean) {
    this.start();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + 0.01;

    // 1. the switch: a sharp click (band-passed noise burst) and a low mechanical thunk
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = on ? 2600 : 2100;
    bp.Q.value = 1.4;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.9, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    clickSrc.connect(bp).connect(cg).connect(this.master);
    clickSrc.start(t, Math.random());
    clickSrc.stop(t + 0.06);

    const thunk = ctx.createOscillator();
    thunk.type = "sine";
    thunk.frequency.setValueAtTime(on ? 150 : 120, t);
    thunk.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.55, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    thunk.connect(tg).connect(this.master);
    thunk.start(t);
    thunk.stop(t + 0.2);

    if (on) {
      // 2. ignition: a soft airy whoomp as the lamp catches
      const air = ctx.createBufferSource();
      air.buffer = this.noise;
      const alp = ctx.createBiquadFilter();
      alp.type = "lowpass";
      alp.frequency.setValueAtTime(200, t + 0.08);
      alp.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
      alp.frequency.exponentialRampToValueAtTime(250, t + 1.2);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.0001, t + 0.08);
      ag.gain.exponentialRampToValueAtTime(0.32, t + 0.3);
      ag.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      air.connect(alp).connect(ag).connect(this.master);
      air.start(t + 0.08, Math.random());
      air.stop(t + 1.4);
      // 3. a warm, very quiet hum that settles while the light is on
      this.stopHum(t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
      gain.gain.setTargetAtTime(0.018, t + 1.2, 1.2);
      const osc = [110, 220.4, 330.9].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = [1, 0.25, 0.08][i];
        o.connect(og).connect(gain);
        o.start(t + 0.1);
        return o;
      });
      gain.connect(this.master);
      this.hum = { osc, gain };
    } else {
      this.stopHum(t);
      // cooling ticks
      for (let i = 0; i < 3; i++) {
        const at = t + 0.35 + i * (0.22 + Math.random() * 0.25);
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 3800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12 - i * 0.03, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.02);
        s.connect(f).connect(g).connect(this.master);
        s.start(at, Math.random());
        s.stop(at + 0.03);
      }
    }
  }

  private stopHum(t: number) {
    if (!this.hum) return;
    const { osc, gain } = this.hum;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.25);
    osc.forEach((o) => o.stop(t + 1.5));
    this.hum = null;
  }
}
