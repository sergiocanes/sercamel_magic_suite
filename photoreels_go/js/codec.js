// Perfil y nivel H.264 para una resolución, cadencia y bitrate. Sin DOM.
//
// El nivel limita macrobloques por fotograma, macrobloques por segundo y bitrate.
// 1080×1920 a 30 fps cabe en 4.0, pero a 60 fps necesita 4.2 y el 4K vertical,
// 5.1 o 5.2. Pedir un nivel corto hace que el codificador rechace la configuración.
(function (root) {
  // [level_idc, MaxMBPS, MaxFS, MaxBR en kbit/s para Baseline y Main] (tabla A-1 de H.264)
  const LEVELS = [
    [30, 40500, 1620, 10000],
    [31, 108000, 3600, 14000],
    [32, 216000, 5120, 20000],
    [40, 245760, 8192, 20000],
    [41, 245760, 8192, 50000],
    [42, 522240, 8704, 50000],
    [50, 589824, 22080, 135000],
    [51, 983040, 36864, 240000],
    [52, 2073600, 36864, 240000],
  ];

  const PROFILES = [
    { name: 'high', idc: 0x64, flags: 0x00, brFactor: 1.25 },
    { name: 'main', idc: 0x4d, flags: 0x00, brFactor: 1 },
    { name: 'baseline', idc: 0x42, flags: 0xe0, brFactor: 1 },
  ];

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} fps
   * @param {number} bitrate bit/s
   * @param {number} [brFactor] 1.25 para el perfil High
   * @returns {?number} level_idc (40 = nivel 4.0), o null si ninguno sirve
   */
  function avcLevel(width, height, fps, bitrate, brFactor = 1) {
    const mbW = Math.ceil(width / 16);
    const mbH = Math.ceil(height / 16);
    const frameSize = mbW * mbH;
    for (const [idc, maxMbps, maxFs, maxBr] of LEVELS) {
      // Ningún lado puede pasar de √(8·MaxFS) macrobloques.
      const maxSide = Math.sqrt(8 * maxFs);
      if (frameSize <= maxFs && mbW <= maxSide && mbH <= maxSide
        && frameSize * fps <= maxMbps && bitrate <= maxBr * 1000 * brFactor) return idc;
    }
    return null;
  }

  const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

  /** Códecs "avc1.PPCCLL" a probar, de mejor a peor perfil. */
  function codecCandidates(width, height, fps, bitrate) {
    return PROFILES.flatMap(({ idc, flags, brFactor }) => {
      const level = avcLevel(width, height, fps, bitrate, brFactor);
      return level ? [`avc1.${hex(idc)}${hex(flags)}${hex(level)}`] : [];
    });
  }

  const api = { avcLevel, codecCandidates };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotoReelsCodec = api;
})(globalThis);
