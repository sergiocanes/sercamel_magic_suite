// Empaquetador MP4 mínimo para una pista de vídeo H.264 sin audio. Sin DOM.
//
// Los navegadores codifican H.264 con WebCodecs pero no lo guardan en un archivo.
// El índice (moov) va delante de los datos para que el vídeo empiece a
// reproducirse sin leerlo entero.
(function (root) {
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; };
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; };
  const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const zeros = (n) => new Uint8Array(n);

  function concat(parts) {
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  const box = (type, ...parts) => {
    const body = concat(parts);
    return concat([u32(body.length + 8), ascii(type), body]);
  };
  const fullBox = (type, flags, ...parts) => box(type, u32(flags), ...parts);

  const MATRIX = concat([u32(0x10000), zeros(12), u32(0x10000), zeros(12), u32(0x40000000)]);

  function nalUnits(data, lengthSize) {
    const units = [];
    let at = 0;
    while (at + lengthSize < data.length) {
      let size = 0;
      for (let i = 0; i < lengthSize; i++) size = size * 256 + data[at + i];
      at += lengthSize;
      if (at + size > data.length) break;
      units.push(data.subarray(at, at + size));
      at += size;
    }
    return units;
  }

  // La configuración que entrega el navegador no siempre es fiable: la de Firefox
  // duplica el primer byte del SPS y del PPS. El fotograma clave lleva los
  // originales, así que se reconstruye con ellos cuando están.
  function repairAvcC(avcC, keyFrame) {
    const lengthSize = (avcC[4] & 3) + 1;
    const units = nalUnits(keyFrame, lengthSize);
    const sps = units.find((unit) => (unit[0] & 31) === 7);
    const pps = units.find((unit) => (unit[0] & 31) === 8);
    if (!sps || !pps) return avcC;
    const highProfile = ![66, 77, 88].includes(sps[1]);
    return concat([
      Uint8Array.of(1, sps[1], sps[2], sps[3], 0xfc | (lengthSize - 1), 0xe1),
      u16(sps.length), sps,
      Uint8Array.of(1),
      u16(pps.length), pps,
      // Perfiles High: croma 4:2:0, 8 bits, sin extensiones de SPS.
      highProfile ? Uint8Array.of(0xfd, 0xf8, 0xf8, 0) : zeros(0),
    ]);
  }

  function sampleEntry({ width, height, avcC }) {
    return box('avc1',
      zeros(6), u16(1), // reservado, índice de referencia de datos
      zeros(16),
      u16(width), u16(height),
      u32(0x480000), u32(0x480000), // 72 ppp
      zeros(4), u16(1), // un fotograma por muestra
      zeros(32), // nombre del compresor
      u16(0x18), u16(0xffff),
      box('avcC', avcC));
  }

  // Con fotogramas B el orden de decodificación no es el de presentación. Un
  // fotograma no puede mostrarse antes de decodificarse, así que todo se retrasa
  // `shift` fotogramas; la lista de edición (edts) compensa ese retraso.
  function presentationOffsets(samples) {
    const offsets = samples.map((s, i) => s.pts - i);
    const shift = Math.max(0, -Math.min(...offsets));
    return { offsets: offsets.map((o) => o + shift), shift };
  }

  function compositionBox({ sampleDuration }, offsets) {
    if (offsets.every((o) => o === 0)) return zeros(0);
    return fullBox('ctts', 0, u32(offsets.length),
      ...offsets.flatMap((o) => [u32(1), u32(o * sampleDuration)]));
  }

  function editBox({ sampleDuration }, shift, duration) {
    if (!shift) return zeros(0);
    return box('edts', fullBox('elst', 0, u32(1), u32(duration), u32(shift * sampleDuration), u32(0x10000)));
  }

  function sampleTable(video, samples, offsets, dataOffset) {
    const keys = samples.flatMap((s, i) => (s.key ? [i + 1] : []));
    return box('stbl',
      fullBox('stsd', 0, u32(1), sampleEntry(video)),
      fullBox('stts', 0, u32(1), u32(samples.length), u32(video.sampleDuration)),
      compositionBox(video, offsets),
      fullBox('stsc', 0, u32(1), u32(1), u32(samples.length), u32(1)),
      fullBox('stsz', 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length))),
      fullBox('stco', 0, u32(1), u32(dataOffset)),
      fullBox('stss', 0, u32(keys.length), ...keys.map(u32)));
  }

  function movie(video, samples, dataOffset) {
    const { width, height, timescale, sampleDuration } = video;
    const duration = samples.length * sampleDuration;
    const { offsets, shift } = presentationOffsets(samples);
    return box('moov',
      fullBox('mvhd', 0, zeros(8), u32(timescale), u32(duration),
        u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(2)),
      box('trak',
        fullBox('tkhd', 3, zeros(8), u32(1), zeros(4), u32(duration),
          zeros(8), zeros(8), MATRIX, u32(width * 0x10000), u32(height * 0x10000)),
        editBox(video, shift, duration),
        box('mdia',
          fullBox('mdhd', 0, zeros(8), u32(timescale), u32(duration), u16(0x55c4), zeros(2)),
          fullBox('hdlr', 0, zeros(4), ascii('vide'), zeros(12), ascii('Paspartugo'), zeros(1)),
          box('minf',
            fullBox('vmhd', 1, zeros(8)),
            box('dinf', fullBox('dref', 0, u32(1), fullBox('url ', 1))),
            sampleTable(video, samples, offsets, dataOffset)))));
  }

  /**
   * @param {object} video
   * @param {number} video.width
   * @param {number} video.height
   * @param {number} video.timescale unidades de tiempo por segundo
   * @param {number} video.sampleDuration duración de cada fotograma en esas unidades
   * @param {Uint8Array} video.avcC configuración del decodificador
   * @param {{data: Uint8Array, key: boolean, pts: number}[]} samples en orden de
   *   decodificación; `pts` es la posición del fotograma en pantalla, desde 0
   * @returns {Uint8Array[]} trozos del archivo
   */
  function muxMp4(rawVideo, samples) {
    const video = { ...rawVideo, avcC: repairAvcC(rawVideo.avcC, samples[0].data) };
    const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
    const moovSize = movie(video, samples, 0).length;
    const moov = movie(video, samples, ftyp.length + moovSize + 8);
    const dataSize = samples.reduce((sum, s) => sum + s.data.length, 0);
    return [ftyp, moov, u32(dataSize + 8), ascii('mdat'), ...samples.map((s) => s.data)];
  }

  const api = { muxMp4 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuMp4 = api;
})(globalThis);
