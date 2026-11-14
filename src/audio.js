// Original procedural ambient score; no downloaded audio or external playback service.
let context,
  bus,
  rainGain,
  timer,
  archiveTimer,
  enabled = false,
  suspended = false;
const notes = [174.61, 220, 261.63, 329.63, 293.66, 220, 196, 261.63];
let step = 0;
function ready() {
  if (context) return;
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return;
  context = new Audio();
  bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(context.destination);
  const length = context.sampleRate * 4,
    buffer = context.createBuffer(1, length, context.sampleRate),
    data = buffer.getChannelData(0);
  let smooth = 0;
  for (let i = 0; i < length; i++) {
    smooth = (smooth + 0.035 * (Math.random() * 2 - 1)) / 1.035;
    data[i] = smooth * 5;
  }
  const rain = context.createBufferSource();
  rain.buffer = buffer;
  rain.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1900;
  rainGain = context.createGain();
  rainGain.gain.value = 0.19;
  rain.connect(filter);
  filter.connect(rainGain);
  rainGain.connect(bus);
  rain.start();
  timer = setInterval(() => {
    if (enabled && !suspended) tone(notes[step++ % notes.length], 0.09, 3.8);
  }, 2600);
}
function tone(frequency, volume = 0.08, duration = 2) {
  if (!context) return;
  const osc = context.createOscillator(),
    gain = context.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(volume, context.currentTime + 0.035);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + duration,
  );
  osc.connect(gain);
  gain.connect(bus);
  osc.start();
  osc.stop(context.currentTime + duration + 0.1);
}
function sync() {
  if (bus)
    bus.gain.setTargetAtTime(
      enabled && !suspended ? 0.43 : 0,
      context.currentTime,
      0.3,
    );
}
export async function setSound(value) {
  enabled = Boolean(value);
  try {
    ready();
    await context?.resume();
    sync();
  } catch {
    enabled = false;
  }
  return enabled;
}
export function pauseSound(value) {
  suspended = Boolean(value);
  sync();
}
export function isSoundEnabled() {
  return enabled;
}
export function chime() {
  if (enabled && !suspended) {
    tone(523.25, 0.09, 0.7);
    setTimeout(() => tone(659.25, 0.06, 1.1), 130);
  }
}
export async function playArchive() {
  await setSound(true);
  if (archiveTimer) clearTimeout(archiveTimer);
  if (rainGain) rainGain.gain.setTargetAtTime(0.5, context.currentTime, 0.4);
  archiveTimer = setTimeout(stopArchive, 18000);
}
export function stopArchive() {
  clearTimeout(archiveTimer);
  archiveTimer = null;
  if (rainGain) rainGain.gain.setTargetAtTime(0.19, context.currentTime, 0.4);
}
export function disposeAudio() {
  clearInterval(timer);
  clearTimeout(archiveTimer);
  context?.close();
}
