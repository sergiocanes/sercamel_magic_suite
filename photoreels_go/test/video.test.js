const test = require('node:test');
const assert = require('node:assert/strict');
const { muxMp4 } = require('../js/mp4.js');
const { MOTIONS, DEFAULT_ZOOM, viewAt } = require('../js/kenburns.js');

function topLevelBoxes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = {};
  for (let at = 0; at < bytes.length;) {
    const size = view.getUint32(at);
    boxes[String.fromCharCode(...bytes.subarray(at + 4, at + 8))] = { at, size };
    at += size;
  }
  return boxes;
}

test('el MP4 lleva el índice antes que los datos y apunta a la primera muestra', () => {
  const samples = [
    { data: Uint8Array.from([1, 2, 3]), key: true, pts: 0 },
    { data: Uint8Array.from([4, 5]), key: false, pts: 1 },
  ];
  const parts = muxMp4({ width: 1080, height: 1920, timescale: 30000, sampleDuration: 1000, avcC: Uint8Array.from([1, 100, 0, 40]) }, samples);
  const file = Buffer.concat(parts);
  const boxes = topLevelBoxes(file);
  assert.deepEqual(Object.keys(boxes), ['ftyp', 'moov', 'mdat']);
  assert.equal(boxes.mdat.size, 8 + 5);

  const stco = file.indexOf('stco');
  const offset = file.readUInt32BE(stco + 12);
  assert.equal(offset, boxes.mdat.at + 8);
  assert.equal(file[offset], 1);
  assert.equal(file.indexOf('ctts'), -1); // sin fotogramas B no hace falta
  assert.equal(file.indexOf('edts'), -1);

  const colr = file.indexOf('colrnclx');
  assert.ok(colr > file.indexOf('avcC'));
  assert.equal(file.subarray(colr + 8, colr + 15).toString('hex'), '00010001000100'); // BT.709, rango limitado
});

test('con fotogramas B guarda el desfase de cada fotograma y compensa el retraso', () => {
  const data = Uint8Array.from([0]);
  const pts = [0, 3, 1, 2]; // orden de decodificación I P B B
  const samples = pts.map((p, i) => ({ data, key: i === 0, pts: p }));
  const file = Buffer.concat(muxMp4({ width: 16, height: 16, timescale: 30000, sampleDuration: 1000, avcC: data }, samples));

  const ctts = file.indexOf('ctts');
  assert.equal(file.readUInt32BE(ctts + 8), 4);
  const offsets = pts.map((_, i) => file.readUInt32BE(ctts + 16 + i * 8));
  assert.deepEqual(offsets, [1000, 3000, 0, 0]); // pts - decodificación + 1 fotograma

  const elst = file.indexOf('elst');
  assert.equal(file.readUInt32BE(elst + 16), 1000); // la reproducción empieza en el frame 0
});

test('reconstruye la configuración H.264 defectuosa de Firefox', () => {
  const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
  const sps = '67640028acd9';
  const pps = '68ebecb22c';
  const broken = hex(`0164002803010007${'67'}${sps}0100066${'8'}${pps}`);
  const unit = (s) => Buffer.concat([Buffer.from([0, 0, 0, s.length / 2]), Buffer.from(s, 'hex')]);
  const keyFrame = Buffer.concat([unit(sps), unit(pps), unit('6588')]);
  const file = Buffer.concat(muxMp4(
    { width: 16, height: 16, timescale: 30000, sampleDuration: 1000, avcC: broken },
    [{ data: new Uint8Array(keyFrame), key: true, pts: 0 }],
  ));
  const at = file.indexOf('avcC') + 4;
  assert.equal(file.subarray(at, at + 8).toString('hex'), '01640028ffe10006');
  assert.equal(file.subarray(at + 8, at + 14).toString('hex'), sps);
  assert.equal(file.subarray(at + 14, at + 17).toString('hex'), '010005');
  assert.equal(file.subarray(at + 17, at + 22).toString('hex'), pps);
});

test('conserva la configuración si el fotograma clave no lleva SPS ni PPS', () => {
  const avcC = Uint8Array.from([1, 100, 0, 40, 0xff, 0xe1, 0, 0, 0]);
  const key = Uint8Array.from([0, 0, 0, 2, 0x65, 0x88]);
  const file = Buffer.concat(muxMp4(
    { width: 16, height: 16, timescale: 30000, sampleDuration: 1000, avcC },
    [{ data: key, key: true, pts: 0 }],
  ));
  const at = file.indexOf('avcC') + 4;
  assert.deepEqual([...file.subarray(at, at + avcC.length)], [...avcC]);
});

for (const motion of MOTIONS) {
  test(`${motion}: la vista nunca sale de la foto`, () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const v = viewAt(t, motion, 1000, 800);
      assert.ok(v.x >= -1e-9 && v.y >= -1e-9);
      assert.ok(v.x + v.w <= 1000 + 1e-9 && v.y + v.h <= 800 + 1e-9);
    }
  });
}

test('acercar empieza con la foto entera y termina en el zoom máximo', () => {
  assert.deepEqual(viewAt(0, 'zoom-in', 1000, 800), { x: 0, y: 0, w: 1000, h: 800 });
  assert.ok(Math.abs(viewAt(1, 'zoom-in', 1000, 800).w - 1000 / DEFAULT_ZOOM) < 1e-9);
});

test('el paneo a la derecha avanza sin cambiar el encuadre', () => {
  const start = viewAt(0, 'pan-right', 1000, 800);
  const end = viewAt(1, 'pan-right', 1000, 800);
  assert.ok(end.x > start.x);
  assert.equal(end.w, start.w);
  assert.equal(end.y, start.y);
});

test('el zoom se puede ajustar y el avance es lineal', () => {
  assert.ok(Math.abs(viewAt(1, 'zoom-in', 1000, 800, 1.1).w - 1000 / 1.1) < 1e-9);
  const half = viewAt(0.5, 'zoom-in', 1000, 800, 1.1);
  assert.ok(Math.abs(half.w - 1000 / 1.05) < 1e-9);
});

test('fuera de 0 a 1 se queda en el extremo', () => {
  assert.deepEqual(viewAt(-0.2, 'zoom-in', 1000, 800), viewAt(0, 'zoom-in', 1000, 800));
  assert.deepEqual(viewAt(1.3, 'zoom-in', 1000, 800), viewAt(1, 'zoom-in', 1000, 800));
});
