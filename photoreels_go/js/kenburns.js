// Trayectoria del movimiento de cámara sobre una foto. Sin DOM.
//
// El avance es lineal: entre cortes secos, un movimiento que acelera y frena en
// cada foto se nota como un tirón.
(function (root) {
  const DEFAULT_ZOOM = 1.05;
  const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'];

  /**
   * Zona visible en el instante `t` (0 a 1) de un encuadre de `w`×`h`. Con zoom
   * 1 es el encuadre entero.
   *
   * @param {number} t
   * @param {string} motion uno de MOTIONS
   * @param {number} w
   * @param {number} h
   * @param {number} [maxZoom] escala al final del acercamiento (1.05 = 105 %)
   * @returns {{x, y, w, h}}
   */
  function viewAt(t, motion, w, h, maxZoom = DEFAULT_ZOOM) {
    const e = Math.min(1, Math.max(0, t));
    const zoom = {
      'zoom-in': 1 + (maxZoom - 1) * e,
      'zoom-out': maxZoom - (maxZoom - 1) * e,
    }[motion] ?? maxZoom;
    const vw = w / zoom;
    const vh = h / zoom;
    const roomX = w - vw;
    const roomY = h - vh;
    const x = { 'pan-left': roomX * (1 - e), 'pan-right': roomX * e }[motion] ?? roomX / 2;
    const y = { 'pan-up': roomY * (1 - e), 'pan-down': roomY * e }[motion] ?? roomY / 2;
    return { x, y, w: vw, h: vh };
  }

  const api = { DEFAULT_ZOOM, MOTIONS, viewAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotoReelsKenBurns = api;
})(globalThis);
