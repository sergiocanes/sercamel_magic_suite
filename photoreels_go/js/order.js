// Orden de las fotos del reel. Sin DOM.
(function (root) {
  const { mulberry32 } = typeof module === 'object' && module.exports
    ? require('../../shared/js/random.js')
    : root.PaspartuRandom;

  // "IMG_9.jpg" antes que "IMG_10.jpg".
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  /**
   * @param {{name: string, takenAt?: number}[]} photos
   * @param {'date'|'name'|'random'} mode
   * @param {number} [seed] solo para 'random'
   * @returns {object[]} copia ordenada
   *
   * Por fecha, las fotos sin fecha de captura van al final por nombre; un empate
   * (ráfagas sin subsegundos) también se resuelve por nombre, que la cámara
   * numera en orden.
   */
  function sortPhotos(photos, mode, seed = 1) {
    const list = [...photos];
    if (mode === 'name') return list.sort(byName);
    if (mode === 'date') {
      const has = (p) => typeof p.takenAt === 'number';
      return list.sort((a, b) => {
        if (has(a) !== has(b)) return has(a) ? -1 : 1;
        return (has(a) && a.takenAt - b.takenAt) || byName(a, b);
      });
    }
    if (mode === 'random') {
      const random = mulberry32(seed);
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }
    return list;
  }

  const api = { sortPhotos };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotoReelsOrder = api;
})(globalThis);
