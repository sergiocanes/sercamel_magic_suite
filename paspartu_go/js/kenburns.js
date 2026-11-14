// Trayectoria del efecto Ken Burns. Sin DOM.
(function (root) {
  const MAX_ZOOM = 1.12;
  const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'];

  const ease = (t) => t * t * (3 - 2 * t);

  /**
   * Zona de la foto visible en el instante `t` (0 a 1). Con zoom 1 es la foto
   * entera; el marco del paspartú no se mueve.
   *
   * @param {number} t
   * @param {string} motion uno de MOTIONS
   * @param {number} w ancho de la foto
   * @param {number} h alto de la foto
   * @returns {{x, y, w, h}}
   */
  function viewAt(t, motion, w, h) {
    const e = ease(t);
    const zoom = {
      'zoom-in': 1 + (MAX_ZOOM - 1) * e,
      'zoom-out': MAX_ZOOM - (MAX_ZOOM - 1) * e,
    }[motion] ?? MAX_ZOOM;
    const vw = w / zoom;
    const vh = h / zoom;
    const roomX = w - vw;
    const roomY = h - vh;
    const x = { 'pan-left': roomX * (1 - e), 'pan-right': roomX * e }[motion] ?? roomX / 2;
    const y = { 'pan-up': roomY * (1 - e), 'pan-down': roomY * e }[motion] ?? roomY / 2;
    return { x, y, w: vw, h: vh };
  }

  const api = { MAX_ZOOM, MOTIONS, viewAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuKenBurns = api;
})(globalThis);
