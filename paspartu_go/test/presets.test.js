const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, BUILTIN, resolve, createStore } = require('../js/presets.js');

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

test('incluye los presets pedidos y todos tienen la forma completa', () => {
  assert.deepEqual(Object.keys(BUILTIN), ['Minimalist White', 'Dark Film Studio', 'Vintage Grain']);
  for (const preset of Object.values(BUILTIN)) {
    const full = resolve(preset);
    assert.deepEqual(Object.keys(full).sort(), Object.keys(DEFAULTS).sort());
    assert.deepEqual(Object.keys(full.shadow).sort(), Object.keys(DEFAULTS.shadow).sort());
  }
});

test('un preset parcial hereda lo que le falta sin alterar los valores por defecto', () => {
  const full = resolve({ shadow: { blur: 5 } });
  assert.equal(full.shadow.blur, 5);
  assert.equal(full.shadow.opacity, DEFAULTS.shadow.opacity);
  full.shadow.opacity = 1;
  assert.notEqual(DEFAULTS.shadow.opacity, 1);
});

test('guarda, recupera y borra', () => {
  const store = createStore(memoryStorage());
  store.save('Mío', resolve({ color: '#123456' }));
  assert.deepEqual(store.names(), ['Mío']);
  assert.equal(store.get('Mío').color, '#123456');
  store.remove('Mío');
  assert.deepEqual(store.names(), []);
});

test('tolera datos corruptos o almacenamiento bloqueado', () => {
  const corrupt = createStore({ getItem: () => '{no json', setItem() {} });
  assert.deepEqual(corrupt.names(), []);
  const blocked = createStore({ getItem() { throw new Error('bloqueado'); }, setItem() {} });
  assert.deepEqual(blocked.names(), []);
});
