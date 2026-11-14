const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS } = require('../../shared/js/layout.js');
const { suggestPanels, planPanorama } = require('../js/panorama.js');

const F45 = FORMATS['4:5'];

test('sugiere los paneles según la proporción', () => {
  assert.equal(suggestPanels(12000, 5000, F45), 3); // 2,4 / 0,8
  assert.equal(suggestPanels(12000, 4000, FORMATS['1:1']), 3);
  assert.equal(suggestPanels(1000, 1000, F45), 2); // mínimo
  assert.equal(suggestPanels(100000, 1000, F45), 10); // máximo
});

test('sin margen, los paneles rellenan el lienzo común y no pierden nada si encaja', () => {
  const plan = planPanorama(3240, 1350, { format: F45, panels: 3, marginPct: 0 });
  assert.deepEqual(plan.strip, { w: 3240, h: 1350 });
  assert.deepEqual(plan.rect, { x: 0, y: 0, w: 3240, h: 1350 });
  assert.equal(plan.cropped, 0);
});

test('antes de dividir: el margen rodea la tira, no cada panel', () => {
  const plan = planPanorama(9000, 3000, { format: F45, panels: 3, marginPct: 5, marginOrder: 'before' });
  assert.equal(plan.rect.x, 54);
  assert.equal(plan.rect.x + plan.rect.w, 3240 - 54);
  assert.equal(plan.slices.length, 1);
});

test('después de dividir: los trozos son contiguos y cubren el recorte', () => {
  const plan = planPanorama(9000, 3000, { format: F45, panels: 3, marginPct: 5, marginOrder: 'after' });
  assert.equal(plan.strip, null);
  assert.equal(plan.slices.length, 3);
  plan.slices.slice(1).forEach((slice, i) => {
    const prev = plan.slices[i];
    assert.ok(Math.abs(prev.x + prev.w - slice.x) < 1e-6);
  });
  assert.equal(plan.rect.x, 54);
});

test('rellenar recorta y encajar no', () => {
  const options = { format: F45, panels: 2, marginPct: 0 };
  assert.ok(planPanorama(9000, 3000, { ...options, fit: 'cover' }).cropped > 0.4);
  assert.equal(planPanorama(9000, 3000, { ...options, fit: 'contain' }).cropped, 0);
});

test('encajar respeta la proporción de la foto', () => {
  const { rect } = planPanorama(9000, 3000, { format: F45, panels: 2, marginPct: 0, marginOrder: 'after', fit: 'contain' });
  assert.ok(Math.abs((rect.w * 2) / rect.h - 3) < 0.01);
});

const { captionPanel, panelRect } = require('../js/panorama.js');

for (const marginOrder of ['before', 'after']) {
  for (const fit of ['cover', 'contain']) {
    test(`${marginOrder}/${fit}: reserveBottom deja hueco bajo la foto`, () => {
      const options = { format: F45, panels: 3, marginPct: 2, marginOrder, fit };
      const { rect } = planPanorama(9000, 3700, { ...options, reserveBottom: 100 });
      assert.ok(1350 - rect.y - rect.h >= 100);
      assert.ok(rect.y >= 22);
    });
  }
}

test('sin reserva el plan no cambia', () => {
  const options = { format: F45, panels: 3, marginPct: 5 };
  assert.deepEqual(planPanorama(9000, 3000, options), planPanorama(9000, 3000, { ...options, reserveBottom: 0 }));
});

test('el pie va en el primer, el último o el panel central', () => {
  assert.equal(captionPanel('left', 4), 0);
  assert.equal(captionPanel('right', 4), 3);
  assert.equal(captionPanel('center', 3), 1);
  assert.equal(captionPanel('center', 4), 2);
});

test('panelRect recorta la foto al panel', () => {
  const rect = { x: 54, y: 60, w: 3132, h: 1100 };
  assert.deepEqual(panelRect(rect, 0, 1080), { x: 54, y: 60, w: 1026, h: 1100 });
  assert.deepEqual(panelRect(rect, 1, 1080), { x: 0, y: 60, w: 1080, h: 1100 });
  assert.deepEqual(panelRect(rect, 2, 1080), { x: 0, y: 60, w: 1026, h: 1100 });
});

test('panelRect usa el panel entero si la foto no llega a él', () => {
  const rect = { x: 1500, y: 60, w: 240, h: 500 };
  assert.deepEqual(panelRect(rect, 0, 1080), { x: 0, y: 60, w: 1080, h: 500 });
});
