const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePattern, photoSeconds, planTimeline, photoAt } = require('../js/timeline.js');

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('lee patrones con punto o coma decimal y varios separadores', () => {
  assert.deepEqual(parsePattern('0.8 0.3 0.3 0.8'), [0.8, 0.3, 0.3, 0.8]);
  assert.deepEqual(parsePattern('0,8s - 0,3s - 0,3s'), [0.8, 0.3, 0.3]);
  assert.deepEqual(parsePattern('1; 0.5 / 2 | 0'), [1, 0.5, 2]);
  assert.deepEqual(parsePattern(''), []);
});

test('ritmo constante', () => {
  assert.deepEqual(photoSeconds(3, { mode: 'constant', seconds: 0.5 }), [0.5, 0.5, 0.5]);
});

test('BPM: una foto por tiempo a 120 BPM dura medio segundo', () => {
  assert.deepEqual(photoSeconds(2, { mode: 'bpm', bpm: 120, beats: 1 }), [0.5, 0.5]);
  assert.deepEqual(photoSeconds(1, { mode: 'bpm', bpm: 90, beats: 2 }), [60 / 90 * 2]);
});

test('rampa de la primera a la última foto', () => {
  const s = photoSeconds(5, { mode: 'ramp', from: 1, to: 0.2 });
  assert.ok(close(s[0], 1) && close(s[2], 0.6) && close(s[4], 0.2));
  assert.deepEqual(photoSeconds(1, { mode: 'ramp', from: 1, to: 0.2 }), [1]);
});

test('el patrón se repite y uno vacío no rompe el reel', () => {
  assert.deepEqual(photoSeconds(5, { mode: 'pattern', pattern: '0.8 0.3' }), [0.8, 0.3, 0.8, 0.3, 0.8]);
  assert.deepEqual(photoSeconds(2, { mode: 'pattern', pattern: 'nada' }), [1, 1]);
});

test('los cortes se redondean desde el tiempo acumulado, sin deriva', () => {
  // 0,3 s a 24 fps = 7,2 fotogramas. Redondeando cada foto saldrían 7 × 10 = 70.
  const plan = planTimeline(Array(10).fill(0.3), 24);
  assert.equal(plan.totalFrames, 72);
  assert.deepEqual(plan.cuts.map((c) => c.frames), [7, 7, 8, 7, 7, 7, 7, 8, 7, 7]);
  plan.cuts.forEach((cut, i) => assert.ok(Math.abs(cut.start - i * 7.2) <= 0.5));
});

test('a 120 BPM y 30 fps cada tiempo cae en un fotograma exacto', () => {
  const plan = planTimeline(photoSeconds(8, { mode: 'bpm', bpm: 120, beats: 1 }), 30);
  assert.ok(plan.cuts.every((c, i) => c.frames === 15 && c.start === i * 15));
});

test('ninguna foto se queda sin fotograma', () => {
  const plan = planTimeline([0.01, 0.01, 1], 24);
  assert.ok(plan.cuts.every((c) => c.frames >= 1));
  assert.deepEqual(plan.cuts.map((c) => c.start), [0, 1, 2]);
});

test('encuentra la foto de cada fotograma', () => {
  const plan = planTimeline([0.5, 1, 0.5], 30); // 15, 30, 15
  assert.deepEqual(photoAt(plan, 0), { index: 0, local: 0 });
  assert.deepEqual(photoAt(plan, 14), { index: 0, local: 14 });
  assert.deepEqual(photoAt(plan, 15), { index: 1, local: 0 });
  assert.deepEqual(photoAt(plan, 59), { index: 2, local: 14 });
  assert.deepEqual(photoAt({ cuts: [] }, 3), { index: -1, local: 0 });
});
