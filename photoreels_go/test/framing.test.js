const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FORMATS, coverRect, placement, motionFor, viewFor, upscale, sourceSize,
} = require('../js/framing.js');

const FHD = FORMATS.fhd;
const UHD = FORMATS.uhd;
const paspartu = { mode: 'paspartu', marginPct: 4, borderWidth: 0 };
const fill = { mode: 'fill' };
const motion = { enabled: true, direction: 'alternate', zoomPct: 5 };

test('relleno: una horizontal 3:2 recorta los lados con la proporción 9:16', () => {
  const r = coverRect(6000, 4000, FHD);
  assert.equal(r.h, 4000);
  assert.ok(Math.abs(r.w / r.h - 9 / 16) < 1e-9);
  assert.ok(Math.abs(r.x - (6000 - r.w) / 2) < 1e-9);
});

test('relleno: el punto focal mueve el recorte sin salirse de la foto', () => {
  const left = coverRect(6000, 4000, FHD, { x: 0, y: 0.5 });
  const right = coverRect(6000, 4000, FHD, { x: 1, y: 0.5 });
  assert.equal(left.x, 0);
  assert.ok(Math.abs(right.x + right.w - 6000) < 1e-9);
  const middle = coverRect(6000, 4000, FHD, { x: 0.3, y: 0.5 });
  assert.ok(Math.abs(middle.x + middle.w / 2 - 1800) < 1e-9);
});

test('relleno: una vertical más estrecha que 9:16 recorta arriba y abajo', () => {
  const r = coverRect(1000, 3000, FHD);
  assert.equal(r.w, 1000);
  assert.ok(r.h < 3000);
});

test('paspartú: la foto entera cabe con el margen y no se recorta', () => {
  const p = placement({ w: 6000, h: 4000 }, FHD, paspartu);
  assert.deepEqual(p.base, { x: 0, y: 0, w: 6000, h: 4000 });
  assert.ok(p.dst.x >= Math.round(1080 * 0.04));
  assert.ok(p.dst.y > 0 && p.dst.y + p.dst.h < 1920);
});

test('paspartú: en 4K todo escala, también el borde', () => {
  const settings = { ...paspartu, borderWidth: 6 };
  const a = placement({ w: 6000, h: 4000 }, FHD, settings);
  const b = placement({ w: 6000, h: 4000 }, UHD, settings);
  assert.equal(b.border, 12);
  assert.ok(Math.abs(b.dst.w - 2 * a.dst.w) <= 1);
});

test('el movimiento alterna y se omite en fotos cortas', () => {
  assert.equal(motionFor(0, 1, motion), 'zoom-in');
  assert.equal(motionFor(1, 1, motion), 'zoom-out');
  assert.equal(motionFor(0, 0.5, motion), null);
  assert.equal(motionFor(0, 2, { ...motion, enabled: false }), null);
  assert.equal(motionFor(3, 2, { ...motion, direction: 'pan-left' }), 'pan-left');
});

test('la vista con movimiento se queda dentro del encuadre', () => {
  const base = coverRect(6000, 4000, FHD, { x: 0.8, y: 0.5 });
  for (const name of ['zoom-in', 'zoom-out', 'pan-left', 'pan-up']) {
    for (let t = 0; t <= 1; t += 0.25) {
      const v = viewFor(base, name, t, 1.05);
      assert.ok(v.x >= base.x - 1e-9 && v.y >= base.y - 1e-9);
      assert.ok(v.x + v.w <= base.x + base.w + 1e-9 && v.y + v.h <= base.y + base.h + 1e-9);
    }
  }
  assert.equal(viewFor(base, null, 0.5, 1.05), base);
});

test('detecta la falta de resolución y no amplía el original al reducirlo', () => {
  const small = { w: 1600, h: 1067 };
  const p = placement(small, UHD, fill);
  assert.ok(upscale(p) > 1); // 4K a pantalla completa necesita 3840 px de alto
  assert.deepEqual(sourceSize(small, p, 1.05), { w: 1600, h: 1067 });

  const big = { w: 6000, h: 4000 };
  const q = placement(big, FHD, fill);
  const size = sourceSize(big, q, 1.05);
  assert.ok(size.h >= 1920 * 1.05 && size.h < 4000);
});
