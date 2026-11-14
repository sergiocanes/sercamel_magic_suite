const test = require('node:test');
const assert = require('node:assert/strict');
const { PRESETS, TILE_SIZE, generateTexture } = require('../js/texture.js');

const meanAlpha = (px) => {
  let sum = 0;
  for (let i = 3; i < px.length; i += 4) sum += px[i];
  return sum / (px.length / 4);
};

test('los cuatro presets existen', () => {
  assert.deepEqual([...PRESETS].sort(), ['canvas', 'film', 'noise', 'paper']);
});

for (const preset of ['film', 'paper', 'canvas', 'noise']) {
  test(`${preset}: tamaño correcto, determinista y con claros y oscuros`, () => {
    const a = generateTexture(preset, 1, 64);
    assert.equal(a.length, 64 * 64 * 4);
    assert.deepEqual(a, generateTexture(preset, 1, 64));
    const shades = new Set();
    for (let i = 0; i < a.length; i += 4) shades.add(a[i]);
    assert.deepEqual([...shades].sort((x, y) => x - y), [0, 255]);
  });

  test(`${preset}: la intensidad aumenta el contraste`, () => {
    assert.ok(meanAlpha(generateTexture(preset, 1.5, 64)) > meanAlpha(generateTexture(preset, 0.5, 64)));
  });
}

test('el mosaico de papel no tiene costura', () => {
  const size = TILE_SIZE;
  const px = generateTexture('paper', 1, size);
  const value = (x, y) => {
    const i = (y * size + x) * 4;
    return (px[i] ? 1 : -1) * px[i + 3];
  };
  let seam = 0;
  let inside = 0;
  for (let y = 0; y < size; y++) {
    seam += Math.abs(value(0, y) - value(size - 1, y));
    inside += Math.abs(value(100, y) - value(101, y));
  }
  assert.ok(seam < inside * 1.3, `costura ${seam} frente a interior ${inside}`);
});
