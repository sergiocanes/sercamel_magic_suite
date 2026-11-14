// Zonas de la interfaz de Instagram que se solapan con el contenido.
//
// Historias y Reels siguen los porcentajes de las guías de anuncios de Meta. Los
// elementos del feed son aproximados: Instagram no publica su tamaño y cambian
// con el dispositivo. Son una ayuda de composición, no una medida exacta.
(function (root) {
  const { gridCropPx } = typeof module === 'object' && module.exports
    ? require('./layout.js')
    : root.PaspartuLayout;

  const STORY_TOP = 0.14;
  const STORY_BOTTOM = 0.2;
  const REEL_BOTTOM = 0.35;
  const REEL_SIDE = 0.06;
  const FEED_COUNTER = { w: 150, h: 90 };
  const FEED_TAG = { w: 110, h: 110 };

  /**
   * @param {'feed'|'story'|'reel'} target
   * @param {{w: number, h: number}} format
   * @returns {{x, y, w, h, label}[]} zonas en píxeles del lienzo
   */
  function zonesFor(target, format) {
    const { w: W, h: H } = format;
    if (target === 'feed') {
      const zones = [
        { x: W - FEED_COUNTER.w, y: 0, ...FEED_COUNTER, label: 'Contador' },
        { x: 0, y: H - FEED_TAG.h, ...FEED_TAG, label: 'Etiquetas' },
      ];
      const crop = gridCropPx(format);
      if (crop > 0) {
        zones.push(
          { x: 0, y: 0, w: crop, h: H, label: '' },
          { x: W - crop, y: 0, w: crop, h: H, label: 'Recorte de cuadrícula' },
        );
      }
      return zones;
    }
    const top = Math.round(H * STORY_TOP);
    if (target === 'story') {
      const bottom = Math.round(H * STORY_BOTTOM);
      return [
        { x: 0, y: 0, w: W, h: top, label: 'Estado y perfil' },
        { x: 0, y: H - bottom, w: W, h: bottom, label: 'Responder' },
      ];
    }
    const bottom = Math.round(H * REEL_BOTTOM);
    const side = Math.round(W * REEL_SIDE);
    return [
      { x: 0, y: 0, w: W, h: top, label: 'Cabecera' },
      { x: 0, y: H - bottom, w: W, h: bottom, label: 'Descripción y audio' },
      { x: 0, y: top, w: side, h: H - top - bottom, label: '' },
      { x: W - side, y: top, w: side, h: H - top - bottom, label: '' },
    ];
  }

  /** Dibuja las guías sobre una vista previa. Nunca se llama al exportar. */
  function drawZones(ctx, zones, scale) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (const zone of zones) {
      const [x, y, w, h] = [zone.x, zone.y, zone.w, zone.h].map((v) => v * scale);
      ctx.fillStyle = 'rgba(232, 62, 90, 0.28)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(232, 62, 90, 0.95)';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (zone.label) {
        ctx.textAlign = x + w >= ctx.canvas.width && w < ctx.canvas.width ? 'right' : 'left';
        const textX = ctx.textAlign === 'right' ? x + w - 6 : x + 6;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeText(zone.label, textX, y + 6);
        ctx.fillStyle = '#fff';
        ctx.fillText(zone.label, textX, y + 6);
        ctx.lineWidth = 1;
      }
    }
    ctx.restore();
  }

  const api = { zonesFor, drawZones };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuSafeZones = api;
})(globalThis);
