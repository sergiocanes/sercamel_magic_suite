const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, computeLayout, bestFormat, gridCropPx } = require('../js/layout.js');

const F45 = FORMATS['4:5'];

test('respeta el margen mínimo y mantiene la proporción', () => {
  const r = computeLayout(6000, 4000, F45, { marginPct: 5 });
  assert.equal(r.x, 54);
  assert.equal(r.w, 972);
  assert.equal(r.h, 648);
  assert.equal(r.y, (1350 - 648) / 2);
});

test('una foto con la proporción del lienzo deja márgenes proporcionales al lienzo', () => {
  const r = computeLayout(4000, 5000, F45, { marginPct: 5 });
  assert.equal(r.x, 54);
  assert.equal(r.y, 68); // 54 × 5/4 = 67,5
});

test('sin margen, la foto de igual proporción llena el lienzo', () => {
  assert.deepEqual(
    { ...computeLayout(1080, 1350, F45, { marginPct: 0 }), scale: 1 },
    { x: 0, y: 0, w: 1080, h: 1350, scale: 1 },
  );
});

test('el centrado óptico deja más aire abajo que arriba', () => {
  const r = computeLayout(6000, 4000, F45, { marginPct: 5, optical: true });
  assert.ok(r.y < 1350 - r.y - r.h);
});

test('el centrado óptico nunca invade el margen mínimo', () => {
  const r = computeLayout(4000, 6000, FORMATS['3:4'], { marginPct: 8, optical: true });
  assert.ok(r.y >= Math.round(1080 * 0.08) - 1);
});

test('detecta el reescalado hacia arriba', () => {
  assert.ok(computeLayout(500, 500, F45, { marginPct: 5 }).scale > 1);
  assert.ok(computeLayout(5000, 5000, F45, { marginPct: 5 }).scale < 1);
});

test('elige el formato que aprovecha mejor las fotos', () => {
  const pick = (w, h) => bestFormat([{ w, h }, { w, h }], 5).key;
  assert.equal(pick(4000, 6000), '3:4'); // 2:3 vertical
  assert.equal(pick(4000, 5000), '4:5');
  assert.equal(pick(6000, 4000), '1:1'); // 3:2 horizontal
  assert.equal(pick(4000, 4000), '1:1');
});

test('sin fotos usa 4:5', () => {
  assert.equal(bestFormat([], 5).key, '4:5');
});

test('recorte de la cuadrícula 3:4', () => {
  assert.equal(gridCropPx(FORMATS['3:4']), 0);
  assert.equal(gridCropPx(F45), 33.75);
  assert.equal(gridCropPx(FORMATS['1:1']), 135);
});

test('reserveBottom deja hueco para el pie sin invadir el margen', () => {
  const r = computeLayout(4000, 5000, F45, { marginPct: 2, reserveBottom: 100 });
  assert.ok(1350 - r.y - r.h >= 100);
  assert.ok(r.y >= 22);
});

test('reserveBottom no cambia nada si la foto ya deja hueco de sobra', () => {
  const plain = computeLayout(6000, 4000, F45, { marginPct: 5 });
  assert.deepEqual(computeLayout(6000, 4000, F45, { marginPct: 5, reserveBottom: 80 }), plain);
});

test('inset suma el borde al margen', () => {
  assert.equal(computeLayout(6000, 4000, F45, { marginPct: 5, inset: 10 }).x, 64);
});
