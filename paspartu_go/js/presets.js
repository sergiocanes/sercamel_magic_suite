// Ajustes por defecto y presets. Sin DOM: el almacén recibe su `storage`.
(function (root) {
  const STORAGE_KEY = 'paspartugo.presets';

  const DEFAULTS = {
    format: 'auto',
    marginPct: 6,
    color: '#ffffff',
    optical: false,
    border: { width: 0, color: '#000000' },
    shadow: { enabled: false, blur: 30, offsetX: 0, offsetY: 12, opacity: 35, color: '#000000' },
    texture: { preset: 'none', intensity: 100, scale: 1, opacity: 35 },
    exif: { enabled: false, position: 'left', font: 'sans', size: 20 },
  };

  const BUILTIN = {
    'Minimalist White': {
      marginPct: 8,
      color: '#ffffff',
      exif: { font: 'sans' },
    },
    'Dark Film Studio': {
      marginPct: 6,
      color: '#101010',
      border: { width: 2, color: '#3a3a3a' },
      texture: { preset: 'film', intensity: 80, scale: 1, opacity: 30 },
      exif: { enabled: true, position: 'left', font: 'mono', size: 18 },
    },
    'Vintage Grain': {
      marginPct: 9,
      color: '#f3eee4',
      optical: true,
      shadow: { enabled: true, blur: 36, offsetX: 0, offsetY: 14, opacity: 28, color: '#3a2a18' },
      texture: { preset: 'paper', intensity: 70, scale: 1.5, opacity: 30 },
      exif: { enabled: true, position: 'center', font: 'serif', size: 20 },
    },
  };

  // Combina por niveles: un preset parcial, o guardado por una versión anterior,
  // hereda los campos que le falten.
  function merge(base, patch = {}) {
    const out = structuredClone(base);
    for (const [key, value] of Object.entries(patch)) {
      const nested = value && typeof value === 'object' && key in out;
      out[key] = nested ? merge(out[key], value) : value;
    }
    return out;
  }

  const resolve = (patch) => merge(DEFAULTS, patch);

  /** @param {Storage} storage localStorage o equivalente */
  function createStore(storage) {
    function read() {
      try {
        return JSON.parse(storage.getItem(STORAGE_KEY)) || {};
      } catch {
        return {}; // almacenamiento bloqueado o dato corrupto
      }
    }
    function write(presets) {
      storage.setItem(STORAGE_KEY, JSON.stringify(presets));
    }
    return {
      names: () => Object.keys(read()),
      get: (name) => resolve(read()[name]),
      has: (name) => name in read(),
      save(name, settings) {
        write({ ...read(), [name]: settings });
      },
      remove(name) {
        const presets = read();
        delete presets[name];
        write(presets);
      },
    };
  }

  const api = { DEFAULTS, BUILTIN, resolve, createStore };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuPresets = api;
})(globalThis);
