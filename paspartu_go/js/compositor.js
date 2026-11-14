// Compone una imagen final: fondo, textura, sombra, borde, foto y pie EXIF.
// Vista previa y exportación pasan por aquí, con distinta `scale`, para que lo
// que se ve sea lo que se exporta.
(function (root) {
  const { computeLayout } = root.PaspartuLayout;
  const { TILE_SIZE, generateTexture } = root.PaspartuTexture;
  const { planPanorama, captionPanel, panelRect } = root.PaspartuPanorama;

  const JPEG_QUALITY = 0.95;
  const CAPTION_LINES = 2;
  const CAPTION_LEADING = 1.4;
  const CAPTION_GAP = 0.8; // separación foto-texto, en unidades del tamaño de letra
  const FONTS = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace',
  };

  const tileCache = new Map();

  function textureTile(preset, intensity) {
    const key = `${preset}|${intensity}`;
    if (!tileCache.has(key)) {
      const tile = document.createElement('canvas');
      tile.width = TILE_SIZE;
      tile.height = TILE_SIZE;
      const pixels = generateTexture(preset, intensity / 100);
      tile.getContext('2d').putImageData(new ImageData(pixels, TILE_SIZE, TILE_SIZE), 0, 0);
      tileCache.set(key, tile);
    }
    return tileCache.get(key);
  }

  /**
   * Reduce por mitades antes del dibujo final: un único salto grande pierde
   * detalle en los navegadores que interpolan de forma bilineal.
   */
  function stepDown(source, targetW, targetH) {
    let current = source;
    let sw = source.width;
    let sh = source.height;
    while (sw >= targetW * 2 && sh >= targetH * 2) {
      sw = Math.ceil(sw / 2);
      sh = Math.ceil(sh / 2);
      const step = document.createElement('canvas');
      step.width = sw;
      step.height = sh;
      const ctx = step.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, sw, sh);
      current = step;
    }
    return current;
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  // Texto legible sobre el fondo elegido.
  function captionColor(background) {
    const n = parseInt(background.slice(1), 16);
    const luma = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return luma > 0.55 ? 'rgba(0, 0, 0, 0.72)' : 'rgba(255, 255, 255, 0.78)';
  }

  /** Hueco que el pie EXIF necesita bajo la foto, en px del lienzo. */
  function captionReserve({ exif }) {
    if (!exif.enabled) return 0;
    return Math.round(exif.size * (CAPTION_LINES * CAPTION_LEADING + 2 * CAPTION_GAP));
  }

  /** Dónde queda una foto entera en un lienzo con estos ajustes. */
  function photoRect(photo, format, settings) {
    return computeLayout(photo.w, photo.h, format, {
      marginPct: settings.marginPct,
      optical: settings.optical,
      inset: settings.border.width,
      reserveBottom: captionReserve(settings),
    });
  }

  function paintBackground(ctx, settings, scale) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = settings.color;
    ctx.fillRect(0, 0, width, height);

    const { preset, intensity, opacity, scale: textureScale } = settings.texture;
    if (preset === 'none' || !opacity) return;
    const pattern = ctx.createPattern(textureTile(preset, intensity), 'repeat');
    pattern.setTransform(new DOMMatrix().scale(textureScale * scale));
    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Sombra y borde se dibujan antes de la foto. Las medidas de sombra de canvas
  // ignoran las transformaciones, por eso se multiplican por `scale` a mano.
  function paintFrame(ctx, rect, settings, scale) {
    const { shadow, border } = settings;
    if (!shadow.enabled && !border.width) return;
    const x = (rect.x - border.width) * scale;
    const y = (rect.y - border.width) * scale;
    const w = (rect.w + 2 * border.width) * scale;
    const h = (rect.h + 2 * border.width) * scale;
    ctx.save();
    if (shadow.enabled) {
      ctx.shadowColor = hexToRgba(shadow.color, shadow.opacity / 100);
      ctx.shadowBlur = shadow.blur * scale;
      ctx.shadowOffsetX = shadow.offsetX * scale;
      ctx.shadowOffsetY = shadow.offsetY * scale;
    }
    ctx.fillStyle = border.width ? border.color : settings.color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function paintImage(ctx, { source, origSize, srcRect, rect, scale }) {
    const targetW = rect.w * scale * (origSize.w / srcRect.w);
    const targetH = rect.h * scale * (origSize.h / srcRect.h);
    const reduced = stepDown(source, targetW, targetH);
    const kx = reduced.width / origSize.w;
    const ky = reduced.height / origSize.h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      reduced,
      srcRect.x * kx, srcRect.y * ky, srcRect.w * kx, srcRect.h * ky,
      rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale,
    );
  }

  function paintCaption(ctx, text, rect, format, settings, scale) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, CAPTION_LINES);
    if (!lines.length) return;
    const { position, font, size } = settings.exif;
    const pad = size;
    const left = Math.max(rect.x - settings.border.width, pad);
    const right = Math.min(rect.x + rect.w + settings.border.width, format.w - pad);
    const anchor = { left, center: format.w / 2, right }[position];
    const room = {
      left: format.w - left - pad,
      center: format.w - 2 * pad,
      right: right - pad,
    }[position];

    ctx.save();
    ctx.textAlign = position;
    ctx.textBaseline = 'top';
    ctx.fillStyle = captionColor(settings.color);
    ctx.font = `${size * scale}px ${FONTS[font]}`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const fitted = size * Math.min(1, (room * scale) / widest); // nunca se sale del lienzo
    ctx.font = `${fitted * scale}px ${FONTS[font]}`;
    const top = rect.y + rect.h + settings.border.width + size * CAPTION_GAP;
    lines.forEach((line, i) => {
      ctx.fillText(line, anchor * scale, (top + i * size * CAPTION_LEADING) * scale);
    });
    ctx.restore();
  }

  /**
   * Compone en `canvas`, que ya tiene el tamaño final (lienzo × `scale`).
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} job
   * @param {?CanvasImageSource} job.source foto o miniatura; null deja el hueco vacío
   * @param {{w, h}} job.origSize tamaño real de la foto; srcRect va en estas unidades
   * @param {{x, y, w, h}} job.srcRect zona de la foto que se dibuja
   * @param {{x, y, w, h}} job.rect destino, en px del lienzo
   * @param {{w, h}} job.format lienzo
   * @param {object} job.settings
   * @param {number} [job.scale]
   * @param {string} [job.caption]
   */
  function composite(canvas, { source, origSize, srcRect, rect, format, settings, scale = 1, caption = '' }) {
    const ctx = canvas.getContext('2d');
    paintBackground(ctx, settings, scale);
    paintFrame(ctx, rect, settings, scale);
    if (source) paintImage(ctx, { source, origSize, srcRect, rect, scale });
    if (caption) paintCaption(ctx, caption, rect, format, settings, scale);
  }

  function newCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    return canvas;
  }

  /** Compone una foto entera. `source` puede ser la miniatura o el original. */
  function compositePhoto(canvas, photo, source, format, settings, scale = 1) {
    composite(canvas, {
      source,
      origSize: photo,
      srcRect: { x: 0, y: 0, w: photo.w, h: photo.h },
      rect: photoRect(photo, format, settings),
      format,
      settings,
      scale,
      caption: settings.exif.enabled ? photo.caption : '',
    });
  }

  function panoramaPlan(photo, options, settings) {
    return planPanorama(photo.w, photo.h, {
      ...options,
      marginPct: settings.marginPct,
      inset: settings.border.width,
      reserveBottom: captionReserve(settings),
    });
  }

  /**
   * Genera los paneles de una panorámica. El pie EXIF se pinta al final, ya sobre
   * un panel, para que ninguna costura lo corte.
   *
   * @returns {HTMLCanvasElement[]} un lienzo por panel, en orden
   */
  function renderPanels(photo, source, options, settings, scale = 1) {
    const plan = panoramaPlan(photo, options, settings);
    const { format, panels } = options;
    const job = { source, origSize: photo, rect: plan.rect, settings, scale };
    const canvases = plan.strip
      ? sliceStrip(job, plan, panels)
      : plan.slices.map((srcRect) => {
        const canvas = newCanvas(format.w * scale, format.h * scale);
        composite(canvas, { ...job, srcRect, format });
        return canvas;
      });

    if (settings.exif.enabled && photo.caption) {
      const index = captionPanel(settings.exif.position, panels);
      const rect = plan.strip ? panelRect(plan.rect, index, format.w) : plan.rect;
      paintCaption(canvases[index].getContext('2d'), photo.caption, rect, format, settings, scale);
    }
    return canvases;
  }

  function sliceStrip(job, plan, panels) {
    const { scale } = job;
    const strip = newCanvas(plan.strip.w * scale, plan.strip.h * scale);
    composite(strip, { ...job, srcRect: plan.slices[0], format: plan.strip });
    const panelW = strip.width / panels;
    return Array.from({ length: panels }, (_, i) => {
      const canvas = newCanvas(panelW, strip.height);
      canvas.getContext('2d').drawImage(strip, -Math.round(i * panelW), 0);
      return canvas;
    });
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar el JPEG'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  }

  root.PaspartuCompositor = {
    stepDown, composite, compositePhoto, photoRect, panoramaPlan, renderPanels, newCanvas, canvasToJpeg,
  };
})(globalThis);
