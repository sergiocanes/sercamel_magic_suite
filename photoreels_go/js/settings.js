// Ajustes por defecto y memoria de los últimos usados. Sin DOM.
(function (root) {
  const STORAGE_KEY = 'photoreelsgo.settings';

  const DEFAULTS = {
    pacing: { mode: 'constant', seconds: 0.5, bpm: 120, beats: 1, from: 1, to: 0.2, pattern: '0.8 0.3 0.3 0.8' },
    framing: {
      mode: 'paspartu',
      marginPct: 4,
      background: 'color',
      color: '#101010',
      blur: 40,
      borderWidth: 0,
      borderColor: '#ffffff',
    },
    motion: { enabled: false, direction: 'alternate', zoomPct: 5 },
    output: { resolution: 'fhd', fps: 30, format: 'png', mbps: 25 },
  };

  // Un ajuste guardado por una versión anterior hereda los campos que le falten
  // y pierde los que ya no existen.
  function merge(base, patch) {
    const out = structuredClone(base);
    if (!patch || typeof patch !== 'object') return out;
    for (const key of Object.keys(base)) {
      if (!(key in patch)) continue;
      const nested = base[key] && typeof base[key] === 'object';
      if (nested) out[key] = merge(base[key], patch[key]);
      else if (typeof patch[key] === typeof base[key]) out[key] = patch[key];
    }
    return out;
  }

  /** @param {?Storage} storage */
  function load(storage) {
    try {
      return merge(DEFAULTS, JSON.parse(storage.getItem(STORAGE_KEY)));
    } catch {
      return merge(DEFAULTS); // almacenamiento bloqueado o dato corrupto
    }
  }

  function save(storage, settings) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Sin almacenamiento la app funciona igual; solo no recuerda los ajustes.
    }
  }

  const api = { DEFAULTS, merge, load, save };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotoReelsSettings = api;
})(globalThis);
