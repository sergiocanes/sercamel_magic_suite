// Escritor ZIP mínimo sin compresión: los JPEG ya están comprimidos.
(function (root) {
  const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  // files: [{ name, bytes: Uint8Array }]. Devuelve la lista de trozos del ZIP.
  function zipParts(files, now = new Date()) {
    const { time, date } = dosDateTime(now);
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const { name, bytes } of files) {
      const nameBytes = encoder.encode(name);
      const crc = crc32(bytes);

      // Campos comunes a la cabecera local y a la central, desde "version needed".
      const common = new DataView(new ArrayBuffer(26));
      common.setUint16(0, 20, true);
      common.setUint16(2, 0x0800, true); // nombres en UTF-8
      common.setUint16(4, 0, true); // sin compresión
      common.setUint16(6, time, true);
      common.setUint16(8, date, true);
      common.setUint32(10, crc, true);
      common.setUint32(14, bytes.length, true);
      common.setUint32(18, bytes.length, true);
      common.setUint16(22, nameBytes.length, true);
      common.setUint16(24, 0, true);
      const commonBytes = new Uint8Array(common.buffer);

      const local = new Uint8Array(30 + nameBytes.length);
      new DataView(local.buffer).setUint32(0, 0x04034b50, true);
      local.set(commonBytes, 4);
      local.set(nameBytes, 30);
      parts.push(local, bytes);

      const entry = new Uint8Array(46 + nameBytes.length);
      const entryView = new DataView(entry.buffer);
      entryView.setUint32(0, 0x02014b50, true);
      entryView.setUint16(4, 20, true);
      entry.set(commonBytes, 6);
      entryView.setUint32(42, offset, true);
      entry.set(nameBytes, 46);
      central.push(entry);

      offset += local.length + bytes.length;
    }

    const centralSize = central.reduce((sum, e) => sum + e.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return [...parts, ...central, new Uint8Array(end.buffer)];
  }

  const api = { crc32, zipParts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuZip = api;
})(globalThis);
