const test = require('node:test');
const assert = require('node:assert/strict');
const { sortPhotos } = require('../js/order.js');
const { avcLevel, codecCandidates } = require('../js/codec.js');
const { DEFAULTS, merge, load, save } = require('../js/settings.js');

const names = (list) => list.map((p) => p.name);

test('orden por nombre natural', () => {
  const photos = [{ name: 'IMG_10.jpg' }, { name: 'img_9.jpg' }, { name: 'IMG_100.jpg' }];
  assert.deepEqual(names(sortPhotos(photos, 'name')), ['img_9.jpg', 'IMG_10.jpg', 'IMG_100.jpg']);
});

test('orden por fecha: sin fecha al final y empates por nombre', () => {
  const photos = [
    { name: 'c.jpg' },
    { name: 'b.jpg', takenAt: 2000 },
    { name: 'a2.jpg', takenAt: 1000 },
    { name: 'a1.jpg', takenAt: 1000 },
    { name: 'a.jpg' },
  ];
  assert.deepEqual(names(sortPhotos(photos, 'date')), ['a1.jpg', 'a2.jpg', 'b.jpg', 'a.jpg', 'c.jpg']);
});

test('orden aleatorio: determinista con la misma semilla y sin perder fotos', () => {
  const photos = Array.from({ length: 20 }, (_, i) => ({ name: `f${i}` }));
  const a = sortPhotos(photos, 'random', 7);
  assert.deepEqual(names(a), names(sortPhotos(photos, 'random', 7)));
  assert.notDeepEqual(names(a), names(photos));
  assert.deepEqual(names(a).sort(), names(photos).sort());
});

test('nivel H.264 según resolución, cadencia y bitrate', () => {
  assert.equal(avcLevel(1080, 1920, 30, 12e6, 1.25), 40);
  assert.equal(avcLevel(1080, 1920, 30, 40e6, 1.25), 41); // 4.0 High llega a 25 Mbit/s
  assert.equal(avcLevel(1080, 1920, 60, 25e6, 1.25), 42);
  assert.equal(avcLevel(2160, 3840, 24, 40e6, 1.25), 51);
  assert.equal(avcLevel(2160, 3840, 30, 40e6, 1.25), 51);
  assert.equal(avcLevel(2160, 3840, 60, 40e6, 1.25), 52);
  assert.equal(avcLevel(4320, 7680, 30, 40e6), null);
});

test('códecs candidatos con su nivel', () => {
  assert.deepEqual(codecCandidates(1080, 1920, 30, 12e6), ['avc1.640028', 'avc1.4D0028', 'avc1.42E028']);
  assert.deepEqual(codecCandidates(2160, 3840, 30, 40e6), ['avc1.640033', 'avc1.4D0033', 'avc1.42E033']);
});

test('los ajustes guardados heredan lo que falta y descartan lo desconocido', () => {
  const s = merge(DEFAULTS, { pacing: { seconds: 0.3, extra: 1 }, output: { fps: '30' }, ghost: true });
  assert.equal(s.pacing.seconds, 0.3);
  assert.equal(s.pacing.mode, 'constant');
  assert.equal(s.output.fps, 30); // tipo distinto: se queda el de serie
  assert.ok(!('extra' in s.pacing) && !('ghost' in s));
});

test('guarda y recupera; con almacenamiento roto usa los de serie', () => {
  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  save(storage, merge(DEFAULTS, { motion: { enabled: true } }));
  assert.equal(load(storage).motion.enabled, true);

  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.deepEqual(load(broken), DEFAULTS);
  assert.doesNotThrow(() => save(broken, DEFAULTS));
});
