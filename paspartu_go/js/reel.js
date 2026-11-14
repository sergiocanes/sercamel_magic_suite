// Vídeo vertical 9:16 con movimiento Ken Burns dentro del marco del paspartú.
(function (root) {
  const { STORY } = root.PaspartuLayout;
  const { MAX_ZOOM, viewAt } = root.PaspartuKenBurns;
  const { composite, photoRect, stepDown, newCanvas } = root.PaspartuCompositor;
  const { muxMp4 } = root.PaspartuMp4;

  const FPS = 30;
  const BITRATE = 12_000_000;
  const KEYFRAME_EVERY = FPS * 2;
  const MAX_QUEUE = 4;
  const TIMESCALE = FPS * 1000;
  const H264_CODECS = ['avc1.640028', 'avc1.4D0028', 'avc1.42E028']; // High, Main, Baseline 4.0

  async function pickCodec() {
    if (typeof VideoEncoder === 'undefined') return null;
    for (const codec of H264_CODECS) {
      const config = {
        codec,
        width: STORY.w,
        height: STORY.h,
        bitrate: BITRATE,
        framerate: FPS,
        avc: { format: 'avc' },
      };
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    }
    return null;
  }

  // Fotograma a fotograma: no depende de la velocidad del equipo y no pierde cuadros.
  async function encodeMp4(config, canvas, drawFrame, frames, onProgress) {
    const samples = [];
    let avcC = null;
    let failure = null;
    const encoder = new VideoEncoder({
      output(chunk, metadata) {
        if (metadata?.decoderConfig?.description) {
          const description = metadata.decoderConfig.description;
          avcC = new Uint8Array(description.buffer ?? description, description.byteOffset ?? 0, description.byteLength);
          avcC = avcC.slice();
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', pts: Math.round((chunk.timestamp * FPS) / 1e6) });
      },
      error(error) { failure = error; },
    });
    encoder.configure(config);

    for (let i = 0; i < frames && !failure; i++) {
      drawFrame(i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % KEYFRAME_EVERY === 0 });
      frame.close();
      onProgress(i + 1, frames);
      while (encoder.encodeQueueSize > MAX_QUEUE && !failure) {
        await new Promise((resolve) => { setTimeout(resolve, 2); });
      }
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    if (!avcC || samples.length !== frames) throw new Error('El codificador no entregó el vídeo completo');

    const parts = muxMp4({
      width: STORY.w,
      height: STORY.h,
      timescale: TIMESCALE,
      sampleDuration: TIMESCALE / FPS,
      avcC,
    }, samples);
    return new Blob(parts, { type: 'video/mp4' });
  }

  // Respaldo sin WebCodecs: graba en tiempo real, así que puede perder fotogramas
  // y la pestaña debe seguir visible.
  async function recordWebm(canvas, drawFrame, frames, onProgress) {
    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: BITRATE });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const i = Math.floor(((performance.now() - start) / 1000) * FPS);
        if (i >= frames) { resolve(); return; }
        drawFrame(i);
        onProgress(i + 1, frames);
        requestAnimationFrame(tick);
      };
      tick();
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return new Blob(chunks, { type: 'video/webm' });
  }

  /**
   * @param {object} job
   * @param {object} job.photo
   * @param {object} job.settings
   * @param {number} job.seconds
   * @param {string} job.motion
   * @param {(done: number, total: number) => void} job.onProgress
   * @returns {Promise<{blob: Blob, name: string, isMp4: boolean}>}
   */
  async function renderReel({ photo, settings, seconds, motion, onProgress }) {
    const format = STORY;
    const rect = photoRect(photo, format, settings);
    const bitmap = await createImageBitmap(photo.file);

    // El marco es fijo: se compone una vez y cada fotograma solo redibuja la foto,
    // desde una copia reducida a lo justo para el zoom máximo.
    const base = newCanvas(format.w, format.h);
    composite(base, {
      source: null,
      origSize: photo,
      srcRect: { x: 0, y: 0, w: photo.w, h: photo.h },
      rect,
      format,
      settings,
      caption: settings.exif.enabled ? photo.caption : '',
    });
    const reduced = stepDown(bitmap, rect.w * MAX_ZOOM, rect.h * MAX_ZOOM);

    const canvas = newCanvas(format.w, format.h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const frames = seconds * FPS;
    const drawFrame = (i) => {
      const view = viewAt(i / (frames - 1), motion, reduced.width, reduced.height);
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(reduced, view.x, view.y, view.w, view.h, rect.x, rect.y, rect.w, rect.h);
    };

    try {
      const config = await pickCodec();
      if (config) {
        try {
          const blob = await encodeMp4(config, canvas, drawFrame, frames, onProgress);
          return { blob, name: 'paspartugo_reel.mp4', isMp4: true };
        } catch (error) {
          console.warn('MP4 no disponible, se usa WebM:', error);
        }
      }
      const blob = await recordWebm(canvas, drawFrame, frames, onProgress);
      return { blob, name: 'paspartugo_reel.webm', isMp4: false };
    } finally {
      bitmap.close();
    }
  }

  root.PaspartuReel = { renderReel };
})(globalThis);
