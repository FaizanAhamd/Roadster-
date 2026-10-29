/**
 * Procedural Web Audio synthesizer for Roadster Loop.
 * Zero external audio files or network dependencies.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private thrusterNode: { osc: OscillatorNode; noise: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem('roadster_sound_enabled');
      if (saved !== null) {
        this.soundEnabled = saved === 'true';
      }
    } catch {
      this.soundEnabled = true;
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public toggle(): boolean {
    this.soundEnabled = !this.soundEnabled;
    try {
      localStorage.setItem('roadster_sound_enabled', String(this.soundEnabled));
    } catch {}
    if (this.soundEnabled) {
      this.beep(660, 0.08, 'sine', 0.05);
    } else {
      this.stopThruster();
    }
    return this.soundEnabled;
  }

  public beep(freq = 600, dur = 0.08, type: OscillatorType = 'sine', vol = 0.05) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch {}
  }

  public playLightBeep(stage: number) {
    if (stage < 4) {
      // Amber / red staging tone
      this.beep(460 + stage * 60, 0.09, 'sine', 0.08);
    } else {
      // Green / GO chime: higher dual chime
      this.beep(980, 0.22, 'triangle', 0.12);
      setTimeout(() => this.beep(1318, 0.25, 'sine', 0.1), 60);
    }
  }

  public playEarlyBuzzer() {
    this.beep(150, 0.16, 'sawtooth', 0.1);
  }

  public playLaunch() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.35);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.4);
    } catch {}
  }

  public startThruster() {
    if (!this.soundEnabled || this.thrusterNode) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      // Procedural white noise buffer for gas jet hiss
      const bufferSize = this.ctx.sampleRate * 1.5;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter noise to sound like pressurized cold-gas jet
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      // Low frequency rumble oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(85, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(gain);
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      osc.start();

      this.thrusterNode = { osc, noise: whiteNoise, gain };
    } catch {}
  }

  public stopThruster() {
    if (this.thrusterNode) {
      try {
        const now = this.ctx ? this.ctx.currentTime : 0;
        if (this.ctx && this.thrusterNode.gain) {
          this.thrusterNode.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        }
        setTimeout(() => {
          try {
            this.thrusterNode?.osc.stop();
            this.thrusterNode?.noise.stop();
            this.thrusterNode?.osc.disconnect();
            this.thrusterNode?.noise.disconnect();
            this.thrusterNode?.gain.disconnect();
          } catch {}
          this.thrusterNode = null;
        }, 60);
      } catch {
        this.thrusterNode = null;
      }
    }
  }

  public playFlip() {
    this.beep(520, 0.09, 'sine', 0.04);
  }

  public playRing() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(1046, now); // C6
      osc2.frequency.setValueAtTime(1318, now); // E6

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch {}
  }

  public playTouchdown(isClean: boolean) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    if (isClean) {
      // Victorious major chord
      [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
        setTimeout(() => this.beep(f, 0.32, 'triangle', 0.08), idx * 70);
      });
    } else {
      // Crash wipeout crunch
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.45);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.5);
      } catch {}
    }
  }
}

export const soundManager = new SoundManager();
