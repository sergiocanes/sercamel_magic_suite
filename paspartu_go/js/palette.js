// Colores dominantes por k-means en espacio Lab, que agrupa como percibe el ojo.
(function (root) {
  const { mulberry32 } = typeof module === 'object' && module.exports
    ? require('./random.js')
    : root.PaspartuRandom;

  const ITERATIONS = 12;
  const MIN_DISTANCE = 10; // ΔE por debajo del cual dos colores se ven iguales

  function toLab(r, g, b) {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // k-means++: cada centro nuevo se elige lejos de los anteriores.
  function seedCentroids(points, k, random) {
    const centroids = [points[Math.floor(random() * points.length)]];
    const nearest = new Float64Array(points.length).fill(Infinity);
    while (centroids.length < k) {
      const last = centroids[centroids.length - 1];
      let total = 0;
      points.forEach((p, i) => {
        nearest[i] = Math.min(nearest[i], distance(p, last));
        total += nearest[i];
      });
      if (total === 0) break; // quedan menos colores distintos que k
      let target = random() * total;
      let index = 0;
      while (index < points.length - 1 && (target -= nearest[index]) > 0) index++;
      centroids.push(points[index]);
    }
    return centroids;
  }

  const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

  /**
   * @param {Uint8Array} rgb muestras consecutivas r, g, b
   * @param {number} [k] número máximo de colores
   * @returns {{hex: string, weight: number}[]} del más al menos abundante
   */
  function extractPalette(rgb, k = 6) {
    const count = Math.floor(rgb.length / 3);
    if (!count) return [];
    const points = Array.from({ length: count }, (_, i) => toLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
    let centroids = seedCentroids(points, k, mulberry32(1));
    const labels = new Uint16Array(count);

    for (let round = 0; round < ITERATIONS; round++) {
      const sums = centroids.map(() => [0, 0, 0, 0]);
      points.forEach((p, i) => {
        let best = 0;
        let bestDistance = Infinity;
        centroids.forEach((c, j) => {
          const d = distance(p, c);
          if (d < bestDistance) { bestDistance = d; best = j; }
        });
        labels[i] = best;
        const sum = sums[best];
        sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; sum[3]++;
      });
      centroids = centroids.map((c, j) => (sums[j][3]
        ? [sums[j][0] / sums[j][3], sums[j][1] / sums[j][3], sums[j][2] / sums[j][3]]
        : c));
    }

    const clusters = centroids.map((lab) => ({ lab, rgb: [0, 0, 0], pixels: 0 }));
    labels.forEach((label, i) => {
      const cluster = clusters[label];
      cluster.rgb[0] += rgb[i * 3];
      cluster.rgb[1] += rgb[i * 3 + 1];
      cluster.rgb[2] += rgb[i * 3 + 2];
      cluster.pixels++;
    });

    // Dos grupos casi iguales cuentan como un solo color: suman su peso.
    const kept = [];
    for (const cluster of clusters.filter((c) => c.pixels).sort((a, b) => b.pixels - a.pixels)) {
      const twin = kept.find((c) => distance(c.lab, cluster.lab) < MIN_DISTANCE ** 2);
      if (twin) twin.weight += cluster.pixels / count;
      else kept.push({ ...cluster, weight: cluster.pixels / count });
    }
    return kept.map((c) => ({ hex: toHex(c.rgb.map((sum) => sum / c.pixels)), weight: c.weight }));
  }

  const api = { extractPalette };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaspartuPalette = api;
})(globalThis);
