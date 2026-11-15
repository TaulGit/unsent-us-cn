export const MUSIC_TRACKS = Object.freeze({
  investigation: { file: 'assets/music/investigation.m4a', hostedUrl: "https://gz-vchar-pub.nosdn.127.net/677a2d76636861722d707562-b734/e4/1794675557766-a6jmkvjkdq3muhmb/investigation.m4a", title: '旧手机重新亮起', loop: true, volume: 0.42 },
  reunion: { file: 'assets/music/reunion.m4a', hostedUrl: "https://gz-vchar-pub.nosdn.127.net/677a2d76636861722d707562-b734/e4/1794675557754-wu8kkcdjditxdtto/reunion.m4a", title: '先认识今天的你', loop: true, volume: 0.40 },
  ending: { file: 'assets/music/ending.m4a', hostedUrl: "https://gz-vchar-pub.nosdn.127.net/677a2d76636861722d707562-b734/e4/1794675555213-pt09xzp45qmfz0xh/ending.m4a", title: '这次说完了', loop: false, volume: 0.44 },
});

/** Scene music is independent of game renders and waits for a user gesture. */
export function createMusicController({
  createMedia,
  fadeMs = 800,
  onError = () => {},
} = {}) {
  const players = new Map();
  const fades = new Map();
  let scene = 'investigation';
  let active = null;
  let enabled = true;
  let unlocked = false;
  let suspended = false;
  let ducking = 1;
  let disposed = false;

  const canPlay = () => !disposed && enabled && unlocked && !suspended;
  const targetVolume = () => MUSIC_TRACKS[scene].volume * ducking;

  function stopFade(player) {
    const timer = fades.get(player);
    if (timer !== undefined) clearInterval(timer);
    fades.delete(player);
  }

  function fade(player, target, after) {
    stopFade(player);
    if (fadeMs <= 0 || Math.abs(player.volume - target) < 0.001) {
      player.volume = target;
      after?.();
      return;
    }
    const start = Date.now();
    const from = player.volume;
    const timer = setInterval(() => {
      const fraction = Math.min(1, (Date.now() - start) / fadeMs);
      player.volume = Math.max(0, Math.min(1, from + (target - from) * fraction));
      if (fraction === 1) {
        stopFade(player);
        after?.();
      }
    }, 25);
    fades.set(player, timer);
  }

  function getPlayer(key) {
    if (!players.has(key)) {
      const track = MUSIC_TRACKS[key];
      const embedded = typeof window !== 'undefined' && window.self !== window.top;
      const url = embedded && track.hostedUrl ? track.hostedUrl : new URL('../' + track.file, import.meta.url).href;
      const player = createMedia(url, key);
      player.loop = track.loop;
      player.preload = 'metadata';
      player.volume = 0;
      players.set(key, player);
    }
    return players.get(key);
  }

  function pauseAll() {
    for (const player of players.values()) {
      stopFade(player);
      player.pause();
    }
  }

  async function start(player) {
    if (!canPlay() || !player || player.ended) return false;
    try {
      // Call play synchronously within unlock() so browser gesture permission applies.
      await player.play();
      if (!canPlay() || active !== player) {
        player.pause();
        return false;
      }
      fade(player, targetVolume());
      return true;
    } catch (error) {
      // An autoplay or decode error must never interrupt the story or leak a rejection.
      if (active === player) onError(error);
      return false;
    }
  }

  function setTrack(key) {
    if (disposed || !Object.hasOwn(MUSIC_TRACKS, key) || key === scene && active) return;
    const previous = active;
    scene = key;
    active = getPlayer(key);
    stopFade(active);
    active.currentTime = 0;
    active.volume = 0;
    if (previous && previous !== active) {
      if (canPlay()) fade(previous, 0, () => previous.pause());
      else { stopFade(previous); previous.pause(); }
    }
    if (canPlay()) void start(active);
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    unlocked = true;
    if (!active) active = getPlayer(scene);
    if (!canPlay()) return Promise.resolve(false);
    if (!active.paused && !active.ended) return Promise.resolve(true);
    return start(active);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) pauseAll();
    else return unlock();
    return Promise.resolve(false);
  }

  function pause(value) {
    const next = Boolean(value);
    if (next === suspended || disposed) return;
    suspended = next;
    if (suspended) pauseAll();
    else if (canPlay() && active) void start(active);
  }

  function duck(value) {
    ducking = Math.max(0, Math.min(1, Number(value) || 0));
    if (canPlay() && active && !active.paused) fade(active, targetVolume());
  }

  function dispose() {
    disposed = true;
    pauseAll();
    for (const player of players.values()) {
      player.removeAttribute?.('src');
      player.load?.();
      player.remove?.();
    }
    players.clear();
    active = null;
  }

  return {
    setTrack, unlock, setEnabled, pause, duck, dispose,
    isEnabled: () => enabled,
  };
}
