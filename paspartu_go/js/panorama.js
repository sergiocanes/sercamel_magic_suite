// Geometría del splitter de panorámicas. Sin DOM.
(function (root) {
  const MIN_PANELS = 2;
  const MAX_PANELS = 10;

  /** Número de paneles que mejor reparte la foto sin recortarla apenas. */
  function suggestPanels(imgW, imgH, format) {
    const panels = Math.round(imgW / imgH / (format.w / format.h));
    return Math.min(MAX_PANELS, Math.max(MIN_PANELS, panels));
  }

  // Mayor zona centrada de la foto con la proporción pedida.
  function coverCrop(imgW, imgH, ratio) {
    if (imgW / imgH > ratio) {
      const w = imgH * ratio;
      return { x: (imgW - w) / 2, y: 0, w, h: imgH };
    }
    const h = imgW / ratio;
    return { x: 0, y: (imgH - h) / 2, w: imgW, h };
  }

  /**
   * Planifica la división de una panorámica.
   *
   * - `marginOrder: 'before'`: el paspartú rodea la panorámica entera y luego se
   *   corta. La imagen es continua entre slides; el margen solo existe por fuera.
   * - `marginOrder: 'after'`: primero se corta y cada panel lleva su propio marco.
   * - `fit: 'cover'` recorta lo justo para llenar; `'contain'` no recorta nada.
   * - `reserveBottom` deja libres esos px bajo la foto para el pie EXIF.
   *
   * @returns {{strip: ?{w: number, h: number}, rect: object, slices: object[],
   *            scale: number, cropped: number}} rect y slices (zona de la foto
   *   para cada panel) en píxeles; `strip` es el lienzo común en modo 'before';
   *   `cropped` es la fracción de la foto que se pierde.
   */
  function planPanorama(imgW, imgH, { format, panels, marginPct = 0, marginOrder = 'before', fit = 'cover', inset = 0, reserveBottom = 0 }) {
    const { w: W, h: H } = format;
    const margin = Math.round((W * marginPct) / 100) + inset;
    const bottom = Math.max(margin, reserveBottom);
    const winH = H - margin - bottom;
    const placeY = (h) => Math.min(Math.round((H - h) / 2), H - bottom - h);
    const full = { x: 0, y: 0, w: imgW, h: imgH };
    const cover = fit === 'cover';
    const cropped = (src) => 1 - (src.w * src.h) / (imgW * imgH);

    if (marginOrder === 'before') {
      const strip = { w: W * panels, h: H };
      const winW = strip.w - 2 * margin;
      const src = cover ? coverCrop(imgW, imgH, winW / winH) : full;
      const scale = Math.min(winW / src.w, winH / src.h);
      const w = Math.round(src.w * scale);
      const h = Math.round(src.h * scale);
      const rect = { x: Math.round((strip.w - w) / 2), y: placeY(h), w, h };
      return { strip, rect, slices: [src], scale, cropped: cropped(src) };
    }

    const winW = W - 2 * margin;
    const src = cover ? coverCrop(imgW, imgH, (panels * winW) / winH) : full;
    const scale = Math.min((panels * winW) / src.w, winH / src.h);
    const w = Math.round((src.w * scale) / panels);
    const h = Math.round(src.h * scale);
    const rect = { x: Math.round((W - w) / 2), y: placeY(h), w, h };
    const sliceW = src.w / panels;
    const slices = Array.from({ length: panels }, (_, i) => ({ x: src.x + i * sliceW, y: src.y, w: sliceW, h: src.h }));
    return { strip: null, rect, slices, scale, cropped: cropped(src) };
  }

  /**
   * Panel que lleva el pie EXIF. Va siempre dentro de un solo panel: centrado
   * sobre la tira entera, una costura podría partir el texto.
   */
  function captionPanel(position, panels) {
    return { left: 0, center: Math.floor(panels / 2), right: panels - 1 }[position];
  }

  /**
   * Parte de la foto que cae en un panel de la tira, en coordenadas del panel.
   * Si la foto no llega a ese panel devuelve el panel entero.
   */
  function panelRect(rect, index, panelW) {
    const start = index * panelW;
    const left = Math.max(rect.x, start);
    const right = Math.min(rect.x + rect.w, start + panelW);
    if (right <= left) return { x: 0, y: rect.y, w: panelW, h: rect.h };
    return { x: left - start, y: rect.y, w: right - left, h: rect.h };
  }

  const api = { MIN_PANELS, MAX_PANELS, suggestPanels, planPanorama, captionPanel, panelRect };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuPanorama = api;
})(globalThis);
