// Exportaciones por lotes: cada función devuelve { blob, name } listo para descargar.
(function (root) {
  const { FORMATS, STORY } = root.PaspartuLayout;
  const { compositePhoto, renderPanels, newCanvas, canvasToJpeg } = root.PaspartuCompositor;
  const { zipParts } = root.PaspartuZip;

  const pad = (n) => String(n).padStart(2, '0');

  async function jpegEntry(canvas, name) {
    const blob = await canvasToJpeg(canvas);
    return { name, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }

  const zip = (files, name) => ({ blob: new Blob(zipParts(files), { type: 'application/zip' }), name });

  async function renderJpeg(photo, bitmap, format, settings, name) {
    const canvas = newCanvas(format.w, format.h);
    compositePhoto(canvas, photo, bitmap, format, settings);
    return jpegEntry(canvas, name);
  }

  /** Carrusel: todas las fotos en un mismo formato. */
  async function exportCarousel({ photos, format, settings, onProgress }) {
    const files = [];
    for (const [index, photo] of photos.entries()) {
      onProgress(index + 1, photos.length);
      const bitmap = await createImageBitmap(photo.file);
      files.push(await renderJpeg(photo, bitmap, format, settings, `paspartugo_${pad(index + 1)}.jpg`));
      bitmap.close();
    }
    return zip(files, 'paspartugo_carrusel.zip');
  }

  /** Cada foto en Feed, Story y Square, en una carpeta por variante. */
  async function exportMultiFormat({ photos, settings, onProgress }) {
    const variants = [['feed', FORMATS['4:5']], ['story', STORY], ['square', FORMATS['1:1']]];
    const files = [];
    for (const [index, photo] of photos.entries()) {
      onProgress(index + 1, photos.length);
      const bitmap = await createImageBitmap(photo.file);
      for (const [name, format] of variants) {
        const path = `${name}/${name}_${pad(index + 1)}.jpg`;
        files.push(await renderJpeg(photo, bitmap, format, settings, path));
      }
      bitmap.close();
    }
    return zip(files, 'paspartugo_multiformato.zip');
  }

  /** Paneles de una panorámica, a resolución completa. */
  async function exportPanorama({ photo, options, settings, onProgress }) {
    onProgress(0, options.panels);
    const bitmap = await createImageBitmap(photo.file);
    const panels = renderPanels(photo, bitmap, options, settings);
    bitmap.close();
    const files = [];
    for (const [index, canvas] of panels.entries()) {
      onProgress(index + 1, panels.length);
      files.push(await jpegEntry(canvas, `slide_${pad(index + 1)}.jpg`));
    }
    return zip(files, 'paspartugo_panoramica.zip');
  }

  root.PaspartuExporters = { exportCarousel, exportMultiFormat, exportPanorama };
})(globalThis);
