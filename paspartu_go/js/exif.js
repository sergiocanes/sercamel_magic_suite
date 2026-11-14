// Lector mínimo de EXIF para JPEG. Sin DOM. Solo extrae los campos del pie de foto.
(function (root) {
  const TAGS = {
    IFD0: { 0x010f: 'make', 0x0110: 'model', 0x8769: 'exifPointer' },
    EXIF: {
      0x829a: 'exposure',
      0x829d: 'aperture',
      0x8827: 'iso',
      0x920a: 'focal',
      0xa434: 'lens',
    },
  };

  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

  // Posición del bloque TIFF dentro del segmento APP1 "Exif", o -1.
  function findTiff(view) {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return -1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return -1;
      const size = view.getUint16(offset + 2);
      const isExif = marker === 0xffe1 && offset + 10 <= view.byteLength
        && view.getUint32(offset + 4) === 0x45786966 // "Exif"
        && view.getUint16(offset + 8) === 0;
      if (isExif) return offset + 10;
      offset += 2 + size;
    }
    return -1;
  }

  function readValue(view, tiff, entry, little) {
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    const size = TYPE_SIZE[type];
    if (!size || !count) return undefined;
    const at = size * count <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
    if (at + size * count > view.byteLength) return undefined;

    switch (type) {
      case 2: {
        let text = '';
        for (let i = 0; i < count; i++) {
          const code = view.getUint8(at + i);
          if (!code) break;
          text += String.fromCharCode(code);
        }
        return text.trim();
      }
      case 3: return view.getUint16(at, little);
      case 4: return view.getUint32(at, little);
      case 9: return view.getInt32(at, little);
      case 11: return view.getFloat32(at, little); // las cámaras usan racionales,
      case 12: return view.getFloat64(at, little); // algunos editores no
      case 5:
      case 10: {
        const read = type === 5 ? 'getUint32' : 'getInt32';
        const den = view[read](at + 4, little);
        return den ? view[read](at, little) / den : undefined;
      }
      default: return undefined;
    }
  }

  function readIfd(view, tiff, offset, little, tags, into) {
    const start = tiff + offset;
    if (start + 2 > view.byteLength) return;
    const count = view.getUint16(start, little);
    for (let i = 0; i < count; i++) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > view.byteLength) return;
      const name = tags[view.getUint16(entry, little)];
      if (name) into[name] = readValue(view, tiff, entry, little);
    }
  }

  /**
   * @param {ArrayBuffer} buffer inicio del archivo JPEG
   * @returns {?{make, model, lens, focal, aperture, exposure, iso}} null si no hay
   *   EXIF legible. Cualquier campo puede faltar.
   */
  function parseExif(buffer) {
    try {
      const view = new DataView(buffer);
      const tiff = findTiff(view);
      if (tiff < 0) return null;
      const order = view.getUint16(tiff);
      if (order !== 0x4949 && order !== 0x4d4d) return null;
      const little = order === 0x4949;
      if (view.getUint16(tiff + 2, little) !== 42) return null;

      const data = {};
      readIfd(view, tiff, view.getUint32(tiff + 4, little), little, TAGS.IFD0, data);
      if (data.exifPointer) readIfd(view, tiff, data.exifPointer, little, TAGS.EXIF, data);
      delete data.exifPointer;
      return data;
    } catch {
      return null; // EXIF truncado o malformado: la foto sigue siendo válida
    }
  }

  // "Canon" + "Canon EOS R5" no debe repetir la marca; tampoco
  // "NIKON CORPORATION" + "NIKON Z 6".
  function cameraName({ make = '', model = '' }) {
    const brand = make.split(/\s+/)[0];
    if (!brand) return model;
    if (!model) return make;
    return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`;
  }

  function formatExposure(seconds) {
    if (seconds >= 1) return `${Number(seconds.toFixed(1))} s`;
    return `1/${Math.round(1 / seconds)} s`;
  }

  /** Pie de foto en dos líneas: equipo y ajustes. Vacío si no hay datos. */
  function formatCaption(data) {
    if (!data) return '';
    const gear = [cameraName(data), data.lens].filter(Boolean);
    const exposure = [
      data.focal > 0 && `${Math.round(data.focal)} mm`,
      data.aperture > 0 && `f/${Number(data.aperture.toFixed(1))}`,
      data.exposure > 0 && formatExposure(data.exposure),
      data.iso > 0 && `ISO ${data.iso}`,
    ].filter(Boolean);
    return [gear.join(' · '), exposure.join(' · ')].filter(Boolean).join('\n');
  }

  const api = { parseExif, formatCaption };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuExif = api;
})(globalThis);
