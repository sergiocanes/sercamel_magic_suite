const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { crc32, zipParts } = require('../js/zip.js');

test('crc32 da el valor de referencia', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('genera un ZIP que una herramienta externa valida', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paspartugo-'));
  try {
    const path = join(dir, 'a.zip');
    const files = [
      { name: 'uno.jpg', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'dos_ñ.jpg', bytes: new Uint8Array(5000).fill(7) },
    ];
    writeFileSync(path, Buffer.concat(zipParts(files)));
    const script = 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(f"{i.filename}:{i.file_size}" for i in z.infolist()))';
    const out = execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }).trim();
    assert.equal(out, 'uno.jpg:3,dos_ñ.jpg:5000');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('acepta contenido ya medido en un Blob', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'paspartugo-'));
  try {
    const path = join(dir, 'b.zip');
    const bytes = new Uint8Array(3000).fill(9);
    const files = [
      { name: 'frame_00001.png', data: new Blob([bytes]), size: bytes.length, crc: crc32(bytes) },
      { name: 'frame_00002.png', bytes },
    ];
    writeFileSync(path, Buffer.from(await new Blob(zipParts(files)).arrayBuffer()));
    const script = 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(f"{i.filename}:{i.file_size}" for i in z.infolist()))';
    const out = execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }).trim();
    assert.equal(out, 'frame_00001.png:3000,frame_00002.png:3000');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('avisa si el ZIP pasaría de 4 GB', () => {
  const big = { name: 'x.png', data: new Blob([]), size: 0xffffffff, crc: 0 };
  assert.throws(() => zipParts([big]), /4 GB/);
});
