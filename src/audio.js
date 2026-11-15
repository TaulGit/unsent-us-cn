import { createMusicController } from './music.js';

// BGM is supplied by the creator. Web Audio is only used for UI chimes and rain preview.
const music = createMusicController({
  createMedia(url, scene) {
    const player = new Audio(url);
    player.hidden = true;
    player.setAttribute('aria-hidden', 'true');
    player.dataset.musicScene = scene;
    document.body.append(player);
    return player;
  },
});
let context, bus, rainGain, rain, archiveTimer;
let suspended = false;

function ready() {
  if (context) return;
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return;
  context = new AudioContextClass();
  bus = context.createGain();
  bus.gain.value = music.isEnabled() && !suspended ? 0.43 : 0;
  bus.connect(context.destination);
}

function readyRain() {
  ready();
  if (!context || rain) return;
  const length = context.sampleRate * 4;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let smooth = 0;
  for (let i = 0; i < length; i++) {
    smooth = (smooth + 0.035 * (Math.random() * 2 - 1)) / 1.035;
    data[i] = smooth * 5;
  }
  rain = context.createBufferSource();
  rain.buffer = buffer;
  rain.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1900;
  rainGain = context.createGain();
  rainGain.gain.value = 0;
  rain.connect(filter);
  filter.connect(rainGain);
  rainGain.connect(bus);
  rain.start();
}

function syncEffects() {
  if (bus) bus.gain.setTargetAtTime(music.isEnabled() && !suspended ? 0.43 : 0, context.currentTime, 0.02);
}

export function setMusicScene(scene) { music.setTrack(scene); }
export function unlockSound() {
  if (context?.state === 'suspended' && !suspended) void context.resume().catch(() => {});
  return music.unlock();
}
export async function setSound(value) {
  const result = music.setEnabled(value);
  syncEffects();
  if (value && context && !suspended) { try { await context.resume(); } catch {} }
  await result;
  return music.isEnabled();
}
export function pauseSound(value) {
  suspended = Boolean(value);
  music.pause(suspended);
  syncEffects();
}
export function isSoundEnabled() { return music.isEnabled(); }

function tone(frequency, volume = 0.08, duration = 2) {
  if (!context || suspended || !music.isEnabled()) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(volume, context.currentTime + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  osc.connect(gain); gain.connect(bus); osc.start(); osc.stop(context.currentTime + duration + 0.1);
}
export function chime() {
  if (suspended || !music.isEnabled()) return;
  ready();
  if (context?.state === 'suspended') void context.resume().catch(() => {});
  tone(523.25, 0.09, 0.7);
  setTimeout(() => tone(659.25, 0.06, 1.1), 130);
}
export async function playArchive() {
  readyRain();
  await setSound(true);
  clearTimeout(archiveTimer);
  if (rainGain) rainGain.gain.setTargetAtTime(0.5, context.currentTime, 0.4);
  music.duck(0.45);
  archiveTimer = setTimeout(stopArchive, 18000);
}
export function stopArchive() {
  clearTimeout(archiveTimer);
  archiveTimer = null;
  if (rainGain) rainGain.gain.setTargetAtTime(0, context.currentTime, 0.25);
  music.duck(1);
}
export function disposeAudio() {
  clearTimeout(archiveTimer);
  music.dispose();
  rain?.stop();
  void context?.close();
}
