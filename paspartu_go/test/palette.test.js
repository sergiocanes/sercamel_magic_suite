const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPalette } = require('../js/palette.js');

const repeat = (rgb, n) => Array.from({ length: n }, () => rgb).flat();

test('encuentra los colores y los ordena por abundancia', () => {
  const pixels = Uint8Array.from([...repeat([255, 0, 0], 300), ...repeat([0, 0, 255], 100)]);
  const palette = extractPalette(pixels, 4);
  assert.deepEqual(palette.map((c) => c.hex), ['#ff0000', '#0000ff']);
  assert.equal(palette[0].weight, 0.75);
});

test('los pesos suman 1 tras fusionar colores casi iguales', () => {
  const pixels = Uint8Array.from([...repeat([200, 200, 200], 50), ...repeat([201, 201, 201], 50), ...repeat([10, 10, 10], 50)]);
  const palette = extractPalette(pixels, 3);
  assert.equal(palette.length, 2);
  assert.ok(Math.abs(palette.reduce((sum, c) => sum + c.weight, 0) - 1) < 1e-9);
});

test('es determinista', () => {
  const pixels = Uint8Array.from({ length: 3000 }, (_, i) => (i * 37) % 256);
  assert.deepEqual(extractPalette(pixels), extractPalette(pixels));
});

test('sin muestras devuelve una lista vacía', () => {
  assert.deepEqual(extractPalette(new Uint8Array(0)), []);
});
