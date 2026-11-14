// Geometría del paspartú. Sin dependencias del DOM para poder probarla con node.
(function (root) {
  const FORMATS = {
    '4:5': { w: 1080, h: 1350 },
    '3:4': { w: 1080, h: 1440 },
    '1:1': { w: 1080, h: 1080 },
  };

  // Lienzo vertical de Historias y Reels. Va aparte porque el formato Auto del
  // carrusel no debe elegirlo.
  const STORY = { w: 1080, h: 1920 };

  // Proporción con la que el perfil de Instagram previsualiza los posts.
  const GRID_RATIO = 3 / 4;

  // Parte del hueco vertical que el centrado óptico traslada de arriba a abajo.
  const OPTICAL_LIFT = 0.1;

  /**
   * Encaja la foto entera dentro del lienzo; nunca la recorta.
   *
   * @param {number} imgW
   * @param {number} imgH
   * @param {{w: number, h: number}} format lienzo de destino
   * @param {object} [options]
   * @param {number} [options.marginPct] margen mínimo, en % del ancho del lienzo
   * @param {boolean} [options.optical] sube la foto como en un marco clásico
   * @param {number} [options.reserveBottom] px libres mínimos bajo la foto (pie EXIF)
   * @param {number} [options.inset] px que se suman al margen (borde de la foto)
   * @returns {{x: number, y: number, w: number, h: number, scale: number}}
   */
  function computeLayout(imgW, imgH, format, { marginPct = 0, optical = false, reserveBottom = 0, inset = 0 } = {}) {
    const { w: W, h: H } = format;
    const margin = Math.round((W * marginPct) / 100) + inset;
    const bottom = Math.max(margin, reserveBottom);
    const scale = Math.min((W - 2 * margin) / imgW, (H - margin - bottom) / imgH);
    const w = Math.round(imgW * scale);
    const h = Math.round(imgH * scale);
    const freeY = H - h;
    const centered = freeY / 2;
    const y = optical ? Math.max(Math.min(margin, centered), centered - freeY * OPTICAL_LIFT) : centered;
    return { x: Math.round((W - w) / 2), y: Math.round(Math.min(y, H - bottom - h)), w, h, scale };
  }

  // Fracción del lienzo que ocupa la foto.
  function fill(imgW, imgH, format, marginPct) {
    const { w, h } = computeLayout(imgW, imgH, format, { marginPct });
    return (w * h) / (format.w * format.h);
  }

  // Formato en el que las fotos ocupan más lienzo de media. Un empate lo gana
  // el formato declarado primero.
  function bestFormat(photos, marginPct) {
    let best = { key: Object.keys(FORMATS)[0], fill: 0 };
    if (!photos.length) return best;
    for (const [key, format] of Object.entries(FORMATS)) {
      const total = photos.reduce((sum, p) => sum + fill(p.w, p.h, format, marginPct), 0);
      const mean = total / photos.length;
      if (mean > best.fill + 1e-9) best = { key, fill: mean };
    }
    return best;
  }

  // Píxeles que la cuadrícula del perfil corta en cada lateral.
  function gridCropPx(format) {
    return Math.max(0, (format.w - format.h * GRID_RATIO) / 2);
  }

  const api = { FORMATS, STORY, GRID_RATIO, computeLayout, fill, bestFormat, gridCropPx };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuLayout = api;
})(globalThis);
