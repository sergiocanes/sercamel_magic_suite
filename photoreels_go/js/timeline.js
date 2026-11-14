// Ritmo del reel: cuánto dura cada foto y en qué fotograma empieza. Sin DOM.
//
// Las duraciones se piensan en segundos pero el vídeo solo tiene fotogramas
// enteros: 0,3 s a 24 fps son 7,2. Redondear cada foto por separado acumula el
// error y el montaje se desplaza respecto al ritmo; aquí se redondea cada corte
// desde el tiempo acumulado, así que el error nunca pasa de medio fotograma.
(function (root) {
  const PACINGS = ['constant', 'bpm', 'ramp', 'pattern'];
  const FALLBACK_SECONDS = 1;

  /**
   * "0.8 0.3 0.3 0.8", "0,8 - 0,3" o "0.8s; 0.3s" → [0.8, 0.3, ...]. La coma
   * cuenta como decimal; separan los espacios, ";", "/", "|" y "-".
   *
   * @param {string} text
   * @returns {number[]}
   */
  function parsePattern(text) {
    return String(text ?? '')
      .split(/[\s;/|-]+/)
      .map((token) => Number(token.replace(/s$/i, '').replace(',', '.')))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  /**
   * @param {number} count número de fotos
   * @param {object} pacing
   * @param {'constant'|'bpm'|'ramp'|'pattern'} pacing.mode
   * @param {number} [pacing.seconds] constante
   * @param {number} [pacing.bpm] tempo de la canción
   * @param {number} [pacing.beats] tiempos por foto
   * @param {number} [pacing.from] rampa: primera foto, en s
   * @param {number} [pacing.to] rampa: última foto, en s
   * @param {string} [pacing.pattern] secuencia que se repite
   * @returns {number[]} segundos de cada foto
   */
  function photoSeconds(count, pacing) {
    const at = {
      constant: () => pacing.seconds,
      bpm: () => (60 / pacing.bpm) * pacing.beats,
      ramp: (i) => (count > 1 ? pacing.from + ((pacing.to - pacing.from) * i) / (count - 1) : pacing.from),
      pattern: (() => {
        const list = parsePattern(pacing.pattern);
        return (i) => (list.length ? list[i % list.length] : FALLBACK_SECONDS);
      })(),
    }[pacing.mode];
    return Array.from({ length: count }, (_, i) => {
      const value = at(i);
      return Number.isFinite(value) && value > 0 ? value : FALLBACK_SECONDS;
    });
  }

  /**
   * @param {number[]} seconds duración de cada foto
   * @param {number} fps
   * @returns {{cuts: {start: number, frames: number}[], totalFrames: number}}
   *   ninguna foto se queda sin al menos un fotograma
   */
  function planTimeline(seconds, fps) {
    const cuts = [];
    let elapsed = 0;
    let previousEnd = 0;
    for (const duration of seconds) {
      const start = previousEnd;
      elapsed += duration;
      const end = Math.max(start + 1, Math.round(elapsed * fps));
      cuts.push({ start, frames: end - start });
      previousEnd = end;
    }
    return { cuts, totalFrames: previousEnd };
  }

  /**
   * Foto que se ve en el fotograma `frame`.
   *
   * @returns {{index: number, local: number}} índice de la foto y fotograma
   *   dentro de ella; index -1 si el plan está vacío
   */
  function photoAt(plan, frame) {
    const { cuts } = plan;
    if (!cuts.length) return { index: -1, local: 0 };
    let lo = 0;
    let hi = cuts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cuts[mid].start <= frame) lo = mid;
      else hi = mid - 1;
    }
    return { index: lo, local: frame - cuts[lo].start };
  }

  const api = { PACINGS, parsePattern, photoSeconds, planTimeline, photoAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotoReelsTimeline = api;
})(globalThis);
