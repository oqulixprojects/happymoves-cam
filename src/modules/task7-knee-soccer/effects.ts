// Small sound effects made in the browser. No audio files needed.

export function createAudioContext(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    return new AC();
  } catch {
    return null;
  }
}

export function playGoalSound(ctx: AudioContext) {
  const t0 = ctx.currentTime;

  // rising notes
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.09 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + i * 0.09);
    osc.stop(t0 + i * 0.09 + 0.4);
  });

  // stadium crowd: filtered noise
  const length = Math.floor(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t0);
}

export function playMissSound(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(110, t0 + 0.3);
  gain.gain.setValueAtTime(0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.4);
}