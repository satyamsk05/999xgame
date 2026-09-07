const SOUND_KEY = 'ingames_7updown_sound_enabled';

export function getStoredSoundPreference() {
  const stored = localStorage.getItem(SOUND_KEY);
  return stored !== null ? stored === 'true' : true;
}

export function setStoredSoundPreference(enabled) {
  localStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false');
}
