// Dibujo de fotogramas y exportación: MP4 H.264 o secuencia de imágenes.
// Vista previa y exportación pintan con las mismas funciones; solo cambian la
// fuente (miniatura u original) y la escala.
(function (root) {
  const { FORMATS, coverRect, placement, motionFor, zoomOf, viewFor, sourceSize } = root.PhotoReelsFraming;
  const { photoSeconds, planTimeline } = root.PhotoReelsTimeline;
  const { codecCandidates } = root.PhotoReelsCodec;
  const { muxMp4 } = root.PhotoReelsMp4;
  const { zipParts, crc32 } = root.PaspartuZip;

  const MAX_QUEUE = 4;
  const KEYFRAME_SECONDS = 2;
  const JPEG_QUALITY = 0.95;
  const BLUR_DOWNSCALE = 8; // el desenfoque se calcula en un lienzo 8 veces menor
  const BLUR_DIM = 0.3; // oscurece el fondo para que la foto destaque

  function newCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    return canvas;
  }

  const context = (canvas) => canvas.getContext('2d', { colorSpace: 'srgb', alpha: false });

  /**
   * Reduce por mitades: un único salto grande pierde detalle en los navegadores
   * que interpolan de forma bilineal.
   */
  function stepDown(source, targetW, targetH) {
    let current = source;
    let w = source.width;
    let h = source.height;
    while (w >= targetW * 2 && h >= targetH * 2) {
      w = Math.ceil(w / 2);
      h = Math.ceil(h / 2);
      const step = newCanvas(w, h);
      const ctx = step.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, w, h);
      current = step;
    }
    return current;
  }

  /** Fondo con la propia foto desenfocada; se calcula una vez por foto. */
  function blurredBackground(source, photo, format, framing, scale) {
    const W = format.w * scale;
    const H = format.h * scale;
    const small = newCanvas(W / BLUR_DOWNSCALE, H / BLUR_DOWNSCALE);
    const radius = (framing.blur * scale) / BLUR_DOWNSCALE;
    const ctx = small.getContext('2d');
    const crop = coverRect(photo.w, photo.h, format);
    const kx = source.width / photo.w;
    const ky = source.height / photo.h;
    // Se dibuja más grande que el lienzo para que el borde no se aclare con el desenfoque.
    const bleed = radius * 2;
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(source, crop.x * kx, crop.y * ky, crop.w * kx, crop.h * ky,
      -bleed, -bleed, small.width + 2 * bleed, small.height + 2 * bleed);
    ctx.filter = 'none';
    ctx.fillStyle = `rgba(0, 0, 0, ${BLUR_DIM})`;
    ctx.fillRect(0, 0, small.width, small.height);

    const out = newCanvas(W, H);
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(small, 0, 0, out.width, out.height);
    return out;
  }

  /**
   * Todo lo que no cambia entre fotogramas de una foto.
   *
   * @param {object} photo
   * @param {CanvasImageSource} source la foto, reducida o miniatura
   * @param {number} index posición en el reel
   * @param {number} seconds duración de la foto
   * @param {object} settings
   * @param {number} scale px de salida por px del lienzo
   */
  function prepareScene(photo, source, index, seconds, settings, scale) {
    const format = FORMATS[settings.output.resolution];
    const { framing } = settings;
    const place = placement(photo, format, framing);
    const motion = motionFor(index, seconds, settings.motion);
    const background = framing.mode === 'paspartu' && framing.background === 'blur'
      ? blurredBackground(source, photo, format, framing, scale)
      : null;
    return { photo, source, place, motion, zoom: zoomOf(settings.motion), background, framing, scale };
  }

  /** Pinta el instante `t` (0 a 1) de una foto. */
  function drawScene(ctx, scene, t) {
    const { photo, source, place, motion, zoom, background, framing, scale } = scene;
    const { width, height } = ctx.canvas;
    if (background) {
      ctx.drawImage(background, 0, 0, width, height);
    } else {
      ctx.fillStyle = framing.color;
      ctx.fillRect(0, 0, width, height);
    }
    const { dst, border } = place;
    if (border) {
      ctx.fillStyle = framing.borderColor;
      ctx.fillRect((dst.x - border) * scale, (dst.y - border) * scale,
        (dst.w + 2 * border) * scale, (dst.h + 2 * border) * scale);
    }
    const view = viewFor(place.base, motion, t, zoom);
    const kx = source.width / photo.w;
    const ky = source.height / photo.h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, view.x * kx, view.y * ky, view.w * kx, view.h * ky,
      dst.x * scale, dst.y * scale, dst.w * scale, dst.h * scale);
  }

  // t de cada fotograma: de 0 en el primero a 1 en el último.
  const progressOf = (local, frames) => (frames > 1 ? local / (frames - 1) : 0);

  function planFor(photos, settings) {
    const seconds = photoSeconds(photos.length, settings.pacing);
    return { seconds, plan: planTimeline(seconds, settings.output.fps) };
  }

  // ---- Destinos ----------------------------------------------------------

  async function mp4Config(format, fps, bitrate) {
    if (typeof VideoEncoder === 'undefined') return null;
    for (const codec of codecCandidates(format.w, format.h, fps, bitrate)) {
      const config = {
        codec,
        width: format.w,
        height: format.h,
        bitrate,
        framerate: fps,
        latencyMode: 'quality',
        avc: { format: 'avc' },
      };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) return config;
      } catch {
        // Configuración rechazada: se prueba el siguiente perfil.
      }
    }
    return null;
  }

  /** Fotograma a fotograma: cadencia constante exacta, no depende de la velocidad del equipo. */
  function mp4Sink(config, fps, name) {
    const samples = [];
    let avcC = null;
    let failure = null;
    const keyEvery = fps * KEYFRAME_SECONDS;
    const encoder = new VideoEncoder({
      output(chunk, metadata) {
        const description = metadata?.decoderConfig?.description;
        if (description) {
          avcC = new Uint8Array(description.buffer ?? description, description.byteOffset ?? 0, description.byteLength).slice();
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', pts: Math.round((chunk.timestamp * fps) / 1e6) });
      },
      error(error) { failure = error; },
    });
    encoder.configure(config);

    return {
      async frame(canvas, n, { cut }) {
        if (failure) throw failure;
        const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
        // Un fotograma clave en cada corte: la calidad no cae justo al cambiar de
        // foto y el editor salta a cualquier corte sin decodificar desde atrás.
        encoder.encode(frame, { keyFrame: cut || n % keyEvery === 0 });
        frame.close();
        // En una pestaña de fondo los temporizadores van a 1 por segundo; el evento
        // `dequeue` no se frena, así que se usa cuando existe.
        while (encoder.encodeQueueSize > MAX_QUEUE && !failure) {
          await new Promise((resolve) => {
            if ('ondequeue' in encoder) encoder.addEventListener('dequeue', resolve, { once: true });
            else setTimeout(resolve, 2);
          });
        }
      },
      async finish(totalFrames) {
        await encoder.flush();
        encoder.close();
        if (failure) throw failure;
        if (!avcC || samples.length !== totalFrames) throw new Error('El codificador no entregó el vídeo completo');
        const timescale = fps * 1000;
        const parts = muxMp4({
          width: config.width, height: config.height, timescale, sampleDuration: timescale / fps, avcC,
        }, samples);
        return { kind: 'file', blob: new Blob(parts, { type: 'video/mp4' }), name };
      },
      abort() {
        if (encoder.state !== 'closed') encoder.close();
      },
    };
  }

  function encodeImage(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar el fotograma'))),
        type,
        type === 'image/jpeg' ? JPEG_QUALITY : undefined,
      );
    });
  }

  /**
   * Secuencia numerada: en una carpeta elegida (sin pasar por la memoria) o, si
   * el navegador no lo permite, en un ZIP. Una foto quieta codifica su imagen
   * una sola vez y la repite en todos sus fotogramas.
   */
  function imageSink(type, dir) {
    const ext = type === 'image/png' ? 'png' : 'jpg';
    const entries = [];
    const crcs = new Map();
    let current = null;
    const nameOf = (n) => `frame_${String(n).padStart(5, '0')}.${ext}`;

    return {
      async frame(canvas, n, { changed }) {
        if (changed || !current) current = await encodeImage(canvas, type);
        const name = nameOf(n);
        if (dir) {
          const handle = await dir.getFileHandle(name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(current);
          await writable.close();
          return;
        }
        if (!crcs.has(current)) crcs.set(current, crc32(new Uint8Array(await current.arrayBuffer())));
        entries.push({ name, data: current, size: current.size, crc: crcs.get(current) });
      },
      async finish(totalFrames, folder) {
        if (dir) return { kind: 'folder', folder, frames: totalFrames };
        const blob = new Blob(zipParts(entries.map((e) => ({ ...e, name: `${folder}/${e.name}` }))), { type: 'application/zip' });
        return { kind: 'file', blob, name: `${folder}.zip` };
      },
      abort() {},
    };
  }

  // ---- Exportación -------------------------------------------------------

  async function loadSource(photo, place, zoom) {
    const bitmap = await createImageBitmap(photo.file);
    const size = sourceSize(photo, place, zoom);
    const reduced = stepDown(bitmap, size.w, size.h);
    if (reduced !== bitmap) bitmap.close();
    return { source: reduced, release: () => { if (reduced === bitmap) bitmap.close(); } };
  }

  /**
   * Prepara la exportación. Se llama dentro del clic: elegir carpeta exige un
   * gesto del usuario reciente.
   *
   * @returns {Promise<?{dir: ?FileSystemDirectoryHandle}>} null si cancela
   */
  async function chooseTarget(settings) {
    if (settings.output.format === 'mp4' || typeof window.showDirectoryPicker !== 'function') return { dir: null };
    try {
      return { dir: await window.showDirectoryPicker({ id: 'photoreelsgo', mode: 'readwrite' }) };
    } catch (error) {
      if (error.name === 'AbortError') return null;
      return { dir: null }; // sin permiso: se usa el ZIP
    }
  }

  const baseName = (settings) => {
    const { output } = settings;
    const { w, h } = FORMATS[output.resolution];
    return `photoreelsgo_${w}x${h}_${output.fps}fps`;
  };

  /**
   * @param {object} job
   * @param {object[]} job.photos
   * @param {object} job.settings
   * @param {{dir: ?FileSystemDirectoryHandle}} job.target de chooseTarget
   * @param {(done: number, total: number) => void} job.onProgress
   * @param {AbortSignal} job.signal
   */
  async function exportReel({ photos, settings, target, onProgress, signal }) {
    const { output } = settings;
    const format = FORMATS[output.resolution];
    const { fps } = output;
    const { seconds, plan } = planFor(photos, settings);
    const base = baseName(settings);

    let sink;
    let folder = base;
    if (output.format === 'mp4') {
      const config = await mp4Config(format, fps, output.mbps * 1e6);
      if (!config) {
        throw new Error(`este navegador no codifica H.264 a ${format.w}×${format.h} y ${fps} fps. Prueba con menos resolución o exporta la secuencia PNG`);
      }
      sink = mp4Sink(config, fps, `${base}.mp4`);
    } else {
      let { dir } = target;
      if (dir) {
        folder = `${base}_${output.format}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
        dir = await dir.getDirectoryHandle(folder, { create: true });
      } else {
        folder = `${base}_${output.format}`;
      }
      sink = imageSink(output.format === 'png' ? 'image/png' : 'image/jpeg', dir);
    }

    const canvas = newCanvas(format.w, format.h);
    const ctx = context(canvas);
    try {
      for (const [index, photo] of photos.entries()) {
        const { start, frames } = plan.cuts[index];
        const motion = motionFor(index, seconds[index], settings.motion);
        const place = placement(photo, format, settings.framing);
        const { source, release } = await loadSource(photo, place, motion ? zoomOf(settings.motion) : 1);
        try {
          const scene = prepareScene(photo, source, index, seconds[index], settings, 1);
          for (let local = 0; local < frames; local++) {
            if (signal.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
            const changed = local === 0 || Boolean(motion);
            if (changed) drawScene(ctx, scene, progressOf(local, frames));
            await sink.frame(canvas, start + local, { changed, cut: local === 0 });
            onProgress(start + local + 1, plan.totalFrames);
          }
        } finally {
          release();
        }
      }
      return await sink.finish(plan.totalFrames, folder);
    } catch (error) {
      sink.abort();
      throw error;
    }
  }

  root.PhotoReelsRender = {
    newCanvas, context, stepDown, prepareScene, drawScene, progressOf, planFor, chooseTarget, exportReel,
  };
})(globalThis);
