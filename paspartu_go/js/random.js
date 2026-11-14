// Generador pseudoaleatorio con semilla: texturas y paletas deben dar siempre
// el mismo resultado, o la vista previa y la exportación no coincidirían.
(function (root) {
  /** @returns {() => number} función que devuelve valores en [0, 1) */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = { mulberry32 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuRandom = api;
})(globalThis);
