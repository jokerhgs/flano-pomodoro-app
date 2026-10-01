// Fully offline sound cue: WebAudio oscillator beeps (no network, no streaming).
// If the user drops files into public/sounds, <audio> files take precedence.

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

export type CueKind = "start" | "pause" | "resume" | "end";

async function tryFile(kind: CueKind, volume: number): Promise<boolean> {
  const candidates = [`/sounds/${kind}.wav`, `/sounds/${kind}.mp3`];
  for (const src of candidates) {
    try {
      const res = await fetch(src, { method: "HEAD" });
      if (!res.ok) continue;
      const el = new Audio(src);
      el.volume = volume;
      await el.play();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export type SoundPreset = "alarm" | "digital" | "chime" | "gong";

function beep(freqs: number[], volume: number, stepMs = 180) {
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t0 + (i * stepMs) / 1000);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t0 + (i * stepMs) / 1000 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ((i + 1) * stepMs) / 1000);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + (i * stepMs) / 1000);
    osc.stop(t0 + ((i + 1) * stepMs) / 1000 + 0.05);
  });
}

function playPresetSound(preset: SoundPreset, volume: number) {
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;

  if (preset === "alarm") {
    // Energetic 3-burst alarm ring pattern
    const pattern = [880, 1174, 880, 1174, 880, 1174, 1318, 0, 880, 1174, 880, 1174, 1318];
    const stepMs = 120;
    pattern.forEach((f, i) => {
      if (f === 0) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = t0 + (i * stepMs) / 1000;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.11);
    });
  } else if (preset === "digital") {
    // Digital watch alarm beeps
    const freqs = [1046, 1318, 1046, 1318, 1046, 1318, 1568];
    const stepMs = 140;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      const start = t0 + (i * stepMs) / 1000;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.4), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.11);
    });
  } else if (preset === "chime") {
    // Soft ascending chime sequence
    const freqs = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    const stepMs = 200;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const start = t0 + (i * stepMs) / 1000;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } else if (preset === "gong") {
    // Resonant meditation gong tone
    [220, 440, 660].forEach((f, idx) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, (volume * 0.8) / (idx + 1)), t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 2.3);
    });
  }
}

export function playShortcutClick(volume = 0.7): void {
  const v = Math.min(1, Math.max(0, volume));
  if (v <= 0) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = 1200;
  const t0 = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, v), t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

export async function playCue(
  kind: CueKind,
  volume = 0.7,
  preset = "alarm",
): Promise<void> {
  if (volume <= 0) return;
  const v = Math.min(1, Math.max(0, volume));
  if (await tryFile(kind, v)) return;
  if (kind === "start") {
    beep([660, 880], v);
  } else if (kind === "pause") {
    beep([880, 587], v);
  } else if (kind === "resume") {
    beep([523, 659, 784], v);
  } else {
    playPresetSound((preset as SoundPreset) || "alarm", v);
  }
}
