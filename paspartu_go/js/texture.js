// Texturas procedurales del paspartú. Sin DOM: devuelven píxeles RGBA.
//
// Cada textura es un relieve con media cero que se codifica como blanco (relieve
// positivo) o negro (negativo) con alfa proporcional. Así actúa sobre cualquier
// color: un modo de fusión como "overlay" no tendría efecto sobre blanco puro.
(function (root) {
  const { mulberry32 } = typeof module === 'object' && module.exports
    ? require('../../shared/js/random.js')
    : root.PaspartuRandom;

  const TILE_SIZE = 512;
  const STRENGTH = 0.2; // alfa para una desviación típica con intensidad 1
  const WEAVE = 8; // px por hilo; debe dividir TILE_SIZE para que el mosaico case

  const wrap = (v, size) => ((v % size) + size) % size;

  function gaussian(random) {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  }

  function blur(field, size) {
    const out = new Float32Array(field.length);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += field[wrap(y + dy, size) * size + wrap(x + dx, size)];
        }
        out[y * size + x] = sum / 9;
      }
    }
    return out;
  }

  // Ruido de valor periódico: su rejilla se repite, así que el mosaico no tiene costuras.
  function valueNoise(size, cells, random) {
    const grid = Float32Array.from({ length: cells * cells }, () => random() * 2 - 1);
    const out = new Float32Array(size * size);
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy);
      const ty = smooth(gy - y0);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx);
        const tx = smooth(gx - x0);
        const at = (cx, cy) => grid[(cy % cells) * cells + (cx % cells)];
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
        const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        out[y * size + x] = top * (1 - ty) + bottom * ty;
      }
    }
    return out;
  }

  const GENERATORS = {
    film(size, random) {
      const field = Float32Array.from({ length: size * size }, () => gaussian(random));
      const soft = blur(field, size);
      return soft.map((v, i) => v * 0.7 + field[i] * 0.3); // grano con algo de cuerpo
    },
    noise(size, random) {
      return Float32Array.from({ length: size * size }, () => random() * 2 - 1);
    },
    paper(size, random) {
      const height = new Float32Array(size * size);
      for (const [cells, weight] of [[16, 1], [32, 0.8], [64, 0.6], [128, 0.45], [256, 0.3]]) {
        valueNoise(size, cells, random).forEach((v, i) => { height[i] += v * weight; });
      }
      // Relieve iluminado en diagonal, como la luz rasante sobre papel rugoso.
      return height.map((v, i) => {
        const x = i % size;
        const y = (i - x) / size;
        return v - height[wrap(y - 1, size) * size + wrap(x - 1, size)];
      });
    },
    canvas(size, random) {
      const out = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x % WEAVE) / WEAVE;
          const v = (y % WEAVE) / WEAVE;
          const over = (Math.floor(x / WEAVE) + Math.floor(y / WEAVE)) % 2 === 0;
          const [across, along] = over ? [u, v] : [v, u];
          out[y * size + x] = Math.sin(Math.PI * across) * (0.6 + 0.4 * Math.sin(Math.PI * along))
            + (random() - 0.5) * 0.35;
        }
      }
      return out;
    },
  };

  function normalize(field) {
    const mean = field.reduce((a, b) => a + b, 0) / field.length;
    const deviation = Math.sqrt(field.reduce((a, b) => a + (b - mean) ** 2, 0) / field.length) || 1;
    return field.map((v) => (v - mean) / deviation);
  }

  /**
   * @param {'film'|'paper'|'canvas'|'noise'} preset
   * @param {number} [intensity] contraste del relieve; 1 es el valor de referencia
   * @param {number} [size] lado del mosaico en px
   * @returns {Uint8ClampedArray} píxeles RGBA de un mosaico repetible
   */
  function generateTexture(preset, intensity = 1, size = TILE_SIZE) {
    const field = normalize(GENERATORS[preset](size, mulberry32(7)));
    const pixels = new Uint8ClampedArray(size * size * 4);
    field.forEach((v, i) => {
      const shade = v > 0 ? 255 : 0;
      pixels[i * 4] = shade;
      pixels[i * 4 + 1] = shade;
      pixels[i * 4 + 2] = shade;
      pixels[i * 4 + 3] = Math.abs(v) * STRENGTH * intensity * 255;
    });
    return pixels;
  }

  const api = { TILE_SIZE, PRESETS: Object.keys(GENERATORS), generateTexture };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuTexture = api;
})(globalThis);
