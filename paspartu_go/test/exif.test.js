const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExif, formatCaption } = require('../js/exif.js');

// JPEG mínimo con APP1 EXIF, en el orden de bytes pedido.
function jpegWithExif(little) {
  const tiff = new DataView(new ArrayBuffer(300));
  const bytes = new Uint8Array(tiff.buffer);
  const text = (at, s) => [...s].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
  const entry = (at, tag, type, count, value) => {
    tiff.setUint16(at, tag, little);
    tiff.setUint16(at + 2, type, little);
    tiff.setUint32(at + 4, count, little);
    if (type === 3) tiff.setUint16(at + 8, value, little);
    else tiff.setUint32(at + 8, value, little);
  };
  const rational = (at, n, d) => {
    tiff.setUint32(at, n, little);
    tiff.setUint32(at + 4, d, little);
  };

  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, little);
  tiff.setUint32(4, 8, little);
  tiff.setUint16(8, 3, little); // IFD0
  entry(10, 0x010f, 2, 6, 200);
  entry(22, 0x0110, 2, 13, 210);
  entry(34, 0x8769, 4, 1, 60);
  text(200, 'Canon\0');
  text(210, 'Canon EOS R5\0');
  tiff.setUint16(60, 5, little); // Exif IFD
  entry(62, 0x829a, 5, 1, 230);
  entry(74, 0x829d, 5, 1, 238);
  entry(86, 0x8827, 3, 1, 400);
  entry(98, 0x920a, 5, 1, 246);
  entry(110, 0xa434, 2, 15, 260);
  rational(230, 1, 250);
  rational(238, 14, 10);
  rational(246, 35, 1);
  text(260, 'RF35mm F1.8 IS\0');

  const app1 = new Uint8Array(4 + 6 + bytes.length);
  const view = new DataView(app1.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, app1.length - 2);
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(bytes, 10);
  const file = new Uint8Array(2 + app1.length + 2);
  file.set([0xff, 0xd8]);
  file.set(app1, 2);
  file.set([0xff, 0xd9], 2 + app1.length);
  return file.buffer;
}

for (const little of [true, false]) {
  test(`lee los campos en ${little ? 'little' : 'big'}-endian`, () => {
    const data = parseExif(jpegWithExif(little));
    assert.equal(data.make, 'Canon');
    assert.equal(data.model, 'Canon EOS R5');
    assert.equal(data.lens, 'RF35mm F1.8 IS');
    assert.equal(data.exposure, 1 / 250);
    assert.equal(data.aperture, 1.4);
    assert.equal(data.iso, 400);
    assert.equal(data.focal, 35);
  });
}

test('compone el pie sin repetir la marca', () => {
  assert.equal(
    formatCaption(parseExif(jpegWithExif(true))),
    'Canon EOS R5 · RF35mm F1.8 IS\n35 mm · f/1.4 · 1/250 s · ISO 400',
  );
  assert.equal(formatCaption({ make: 'NIKON CORPORATION', model: 'NIKON Z 6' }), 'NIKON Z 6');
  assert.equal(formatCaption({ make: 'FUJIFILM', model: 'X-T5' }), 'FUJIFILM X-T5');
});

test('exposiciones largas en segundos', () => {
  assert.equal(formatCaption({ exposure: 2.5 }), '2.5 s');
});

test('sin datos devuelve texto vacío', () => {
  assert.equal(formatCaption(null), '');
  assert.equal(formatCaption({}), '');
});

test('no revienta con archivos que no son EXIF válido', () => {
  assert.equal(parseExif(new ArrayBuffer(0)), null);
  assert.equal(parseExif(Uint8Array.from([1, 2, 3, 4, 5]).buffer), null);
  const truncated = jpegWithExif(true).slice(0, 80);
  assert.doesNotThrow(() => parseExif(truncated));
});

test('lee números de coma flotante, como escriben algunos editores', () => {
  const file = new Uint8Array(jpegWithExif(true));
  const view = new DataView(file.buffer);
  const tiff = 2 + 4 + 6;
  const aperture = tiff + 74; // entrada 0x829d del fixture
  view.setUint16(aperture + 2, 12, true);
  view.setFloat64(tiff + 238, 2.8, true);
  assert.equal(parseExif(file.buffer).aperture, 2.8);
});
