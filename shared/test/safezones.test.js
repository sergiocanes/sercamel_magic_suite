const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, STORY } = require('../js/layout.js');
const { zonesFor } = require('../js/safezones.js');

test('Reel: 14 % arriba y 35 % abajo', () => {
  const zones = zonesFor('reel', STORY);
  assert.equal(zones[0].h, 269);
  assert.equal(zones[1].h, 672);
  assert.equal(zones[1].y + zones[1].h, 1920);
});

test('feed en 3:4 no marca recorte de cuadrícula y en 4:5 sí', () => {
  const has = (zones) => zones.some((z) => z.label === 'Recorte de cuadrícula');
  assert.equal(has(zonesFor('feed', FORMATS['3:4'])), false);
  assert.equal(has(zonesFor('feed', FORMATS['4:5'])), true);
});

test('todas las zonas quedan dentro del lienzo', () => {
  for (const [target, format] of [['feed', FORMATS['1:1']], ['story', STORY], ['reel', STORY]]) {
    for (const z of zonesFor(target, format)) {
      assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= format.w && z.y + z.h <= format.h);
    }
  }
});
