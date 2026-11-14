// Encuadre de cada foto en el lienzo 9:16 y su movimiento. Sin DOM.
//
// Toda la geometría va en px de la foto original (`base`, la vista) y del lienzo
// (`dst`). Vista previa y exportación la comparten y solo cambian la escala.
(function (root) {
  const node = typeof module === 'object' && module.exports;
  const { computeLayout } = node ? require('../../shared/js/layout.js') : root.PaspartuLayout;
  const { viewAt } = node ? require('./kenburns.js') : root.PhotoReelsKenBurns;

  const FORMATS = {
    fhd: { w: 1080, h: 1920, label: '1080×1920' },
    uhd: { w: 2160, h: 3840, label: '2160×3840 (4K)' },
  };
  // Los px de los ajustes (el borde) se miden sobre este ancho y escalan con el lienzo.
  const REFERENCE_WIDTH = 1080;
  // Por debajo de esta duración el movimiento se percibe como temblor.
  const MOTION_MIN_SECONDS = 0.8;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /**
   * Mayor zona de la foto con la proporción del lienzo, centrada en `focus`
   * (0 a 1 en cada eje) sin salirse de la foto.
   */
  function coverRect(imgW, imgH, format, focus = { x: 0.5, y: 0.5 }) {
    const ratio = format.w / format.h;
    const w = Math.min(imgW, imgH * ratio);
    const h = w / ratio;
    return {
      x: clamp(focus.x * imgW - w / 2, 0, imgW - w),
      y: clamp(focus.y * imgH - h / 2, 0, imgH - h),
      w,
      h,
    };
  }

  /**
   * @param {{w, h, focus?}} photo
   * @param {{w, h}} format
   * @param {object} framing ajustes de encuadre
   * @returns {{base: {x, y, w, h}, dst: {x, y, w, h}, border: number}}
   */
  function placement(photo, format, framing) {
    if (framing.mode === 'fill') {
      return {
        base: coverRect(photo.w, photo.h, format, photo.focus),
        dst: { x: 0, y: 0, w: format.w, h: format.h },
        border: 0,
      };
    }
    const border = Math.round((framing.borderWidth * format.w) / REFERENCE_WIDTH);
    const { x, y, w, h } = computeLayout(photo.w, photo.h, format, { marginPct: framing.marginPct, inset: border });
    return { base: { x: 0, y: 0, w: photo.w, h: photo.h }, dst: { x, y, w, h }, border };
  }

  /** Movimiento de la foto `index`, o null si va quieta. */
  function motionFor(index, seconds, motion) {
    if (!motion.enabled || seconds < MOTION_MIN_SECONDS) return null;
    if (motion.direction === 'alternate') return index % 2 ? 'zoom-out' : 'zoom-in';
    return motion.direction;
  }

  const zoomOf = (motion) => 1 + motion.zoomPct / 100;

  /** Zona de la foto que se dibuja en el instante `t` (0 a 1). */
  function viewFor(base, motionName, t, zoom) {
    if (!motionName) return base;
    const v = viewAt(t, motionName, base.w, base.h, zoom);
    return { x: base.x + v.x, y: base.y + v.y, w: v.w, h: v.h };
  }

  /** Px del lienzo por px de la foto en el momento más ampliado. Más de 1: faltan píxeles. */
  function upscale(place, zoom = 1) {
    return (place.dst.w / place.base.w) * zoom;
  }

  /**
   * Tamaño al que conviene reducir la foto antes de dibujar sus fotogramas:
   * lo justo para el zoom máximo, nunca más grande que el original.
   */
  function sourceSize(photo, place, zoom = 1) {
    const s = Math.min(1, upscale(place, zoom));
    return { w: Math.max(1, Math.ceil(photo.w * s)), h: Math.max(1, Math.ceil(photo.h * s)) };
  }

  const api = {
    FORMATS, REFERENCE_WIDTH, MOTION_MIN_SECONDS,
    coverRect, placement, motionFor, zoomOf, viewFor, upscale, sourceSize,
  };
  if (node) module.exports = api;
  else root.PhotoReelsFraming = api;
})(globalThis);
