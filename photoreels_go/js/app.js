// Interfaz: estado, enlace de controles, vista previa y exportación.
(function () {
  const { FORMATS, coverRect, placement, motionFor, zoomOf, upscale } = PhotoReelsFraming;
  const { photoAt } = PhotoReelsTimeline;
  const { sortPhotos } = PhotoReelsOrder;
  const Settings = PhotoReelsSettings;
  const Render = PhotoReelsRender;
  const { zonesFor, drawZones } = PaspartuSafeZones;
  const { toolButton, makeSortable, download } = PaspartuDom;

  const THUMB_SIZE = 900; // lado mayor de la copia en memoria para la vista previa
  const PREVIEW_WIDTH = 320;
  const CLIP_HEIGHT = 112;
  const EXIF_READ_BYTES = 256 * 1024;
  const FLASH_SECONDS = 1 / 3; // más de 3 cambios por segundo
  const REEL_MAX_SECONDS = 180;

  const $ = (id) => document.getElementById(id);
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null; // file:// en algunos navegadores
    }
  })();

  // Los data-bind son rutas dentro de `model`.
  const model = {
    s: Settings.load(storage),
    ui: { zones: false },
  };

  let photos = []; // { id, name, file, w, h, thumb, takenAt?, focus? }
  let nextId = 1;
  let pendingImports = 0;
  let importQueue = Promise.resolve();
  let busy = false;
  let controller = null;
  let toastTimer;
  let timing = { seconds: [], plan: { cuts: [], totalFrames: 0 } };
  const clipGroup = { dragged: null };

  const getPath = (path) => path.split('.').reduce((node, key) => node[key], model);
  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((node, key) => node[key], model)[last] = value;
  }

  const format = () => FORMATS[model.s.output.resolution];
  const fmt = (n, digits = 2) => n.toLocaleString('es', { maximumFractionDigits: digits });
  const clock = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0').replace('.', ',')}`;
  };

  // ---- Importación --------------------------------------------------------

  async function readTakenAt(file) {
    const buffer = await file.slice(0, EXIF_READ_BYTES).arrayBuffer();
    return PaspartuExif.parseExif(buffer)?.takenAt;
  }

  async function importFile(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
    const { width: w, height: h } = bitmap;
    const ratio = Math.min(1, THUMB_SIZE / Math.max(w, h));
    const thumb = Render.newCanvas(w * ratio, h * ratio);
    const ctx = thumb.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(Render.stepDown(bitmap, thumb.width, thumb.height), 0, 0, thumb.width, thumb.height);
    bitmap.close();
    const photo = { id: nextId++, name: file.name, file, w, h, thumb, focus: { x: 0.5, y: 0.5 } };
    const takenAt = await readTakenAt(file);
    if (takenAt !== undefined) photo.takenAt = takenAt;
    return photo;
  }

  // Cada tanda se ordena por fecha de captura y se añade al final.
  function addFiles(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!list.length) return;
    pendingImports += list.length;
    updateChrome();
    importQueue = importQueue.then(async () => {
      const batch = [];
      const failed = [];
      for (const file of list) {
        const photo = await importFile(file);
        if (photo) batch.push(photo);
        else failed.push(file.name);
        pendingImports--;
        updateChrome();
      }
      photos.push(...sortPhotos(batch, 'date'));
      renderClips();
      if (failed.length) toast(`No se pudo leer: ${failed.join(', ')}`);
    });
  }

  // ---- Tira de fotos ------------------------------------------------------

  function movePhoto(id, toIndex) {
    const from = photos.findIndex((p) => p.id === id);
    const [photo] = photos.splice(from, 1);
    photos.splice(toIndex, 0, photo);
    renderClips();
  }

  function removePhoto(id) {
    photos = photos.filter((p) => p.id !== id);
    renderClips();
  }

  // Miniatura con la foto entera; en pantalla completa oscurece lo que se recorta.
  function paintClip(canvas, photo) {
    const dpr = window.devicePixelRatio || 1;
    const height = CLIP_HEIGHT * dpr;
    canvas.height = Math.round(height);
    canvas.width = Math.round((height * photo.w) / photo.h);
    canvas.style.width = `${(CLIP_HEIGHT * photo.w) / photo.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo.thumb, 0, 0, canvas.width, canvas.height);
    if (model.s.framing.mode !== 'fill') return;

    const k = canvas.width / photo.w;
    const crop = coverRect(photo.w, photo.h, format(), photo.focus);
    const [x, y, w, h] = [crop.x * k, crop.y * k, crop.w * k, crop.h * k];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, y);
    ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, canvas.width - x - w, h);
    ctx.strokeStyle = '#e4b363';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x + dpr, y + dpr, w - 2 * dpr, h - 2 * dpr);
    ctx.fillStyle = '#e4b363';
    ctx.beginPath();
    ctx.arc(photo.focus.x * canvas.width, photo.focus.y * canvas.height, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  function clipElement(photo, index) {
    const item = document.createElement('li');
    item.className = 'clip';
    item.dataset.id = photo.id;
    makeSortable(item, clipGroup, photo.id, (draggedId) => movePhoto(draggedId, photos.indexOf(photo)));

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', photo.name);
    canvas.addEventListener('click', (e) => {
      if (model.s.framing.mode === 'fill') {
        const box = canvas.getBoundingClientRect();
        photo.focus = {
          x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
          y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
        };
        player.invalidate();
        paintClip(canvas, photo);
      }
      player.seek(timing.plan.cuts[photos.indexOf(photo)]?.start ?? 0);
    });

    const info = document.createElement('div');
    info.className = 'clip-info';
    const number = document.createElement('span');
    number.className = 'clip-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const duration = document.createElement('span');
    duration.className = 'clip-duration';
    const tools = document.createElement('span');
    tools.className = 'clip-tools';
    tools.append(
      toolButton('←', 'Mover antes', index === 0, () => movePhoto(photo.id, index - 1)),
      toolButton('→', 'Mover después', index === photos.length - 1, () => movePhoto(photo.id, index + 1)),
      toolButton('×', 'Quitar', false, () => removePhoto(photo.id)),
    );
    info.append(number, duration, tools);

    const name = document.createElement('p');
    name.className = 'clip-name';
    name.textContent = photo.name;
    name.title = `${photo.name} · ${photo.w}×${photo.h} px`;

    const warn = document.createElement('p');
    warn.className = 'clip-warn';

    item.append(canvas, info, name, warn);
    paintClip(canvas, photo);
    return item;
  }

  function renderClips() {
    $('clips').replaceChildren(...photos.map(clipElement));
    refresh();
  }

  // Lo que depende de los ajustes sin cambiar las fotos: duraciones y avisos.
  function updateClips() {
    const { cuts } = timing.plan;
    const { fps } = model.s.output;
    [...$('clips').children].forEach((item, index) => {
      const photo = photos[index];
      const cut = cuts[index];
      item.querySelector('.clip-duration').textContent = cut ? `${fmt(cut.frames / fps)} s · ${cut.frames} f` : '';
      const motion = motionFor(index, timing.seconds[index], model.s.motion);
      const factor = upscale(placement(photo, format(), model.s.framing), motion ? zoomOf(model.s.motion) : 1);
      const warn = item.querySelector('.clip-warn');
      warn.hidden = factor <= 1.001;
      warn.textContent = warn.hidden ? '' : `Baja resolución: se amplía ×${fmt(factor, 1)}`;
    });
  }

  function repaintClips() {
    [...$('clips').children].forEach((item, index) => paintClip(item.querySelector('canvas'), photos[index]));
  }

  // ---- Vista previa -------------------------------------------------------

  const player = (() => {
    const canvas = $('preview');
    const ctx = Render.context(canvas);
    const scenes = new Map();
    let frame = 0;
    let playing = false;
    let startTime = 0;
    let startFrame = 0;
    let shown = -1;
    let activeIndex = -1;

    const scale = () => PREVIEW_WIDTH / format().w;

    function resize() {
      const { w, h } = format();
      const width = Math.round(w * scale());
      const height = Math.round(h * scale());
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function sceneFor(index) {
      if (!scenes.has(index)) {
        const photo = photos[index];
        scenes.set(index, Render.prepareScene(photo, photo.thumb, index, timing.seconds[index], model.s, scale()));
      }
      return scenes.get(index);
    }

    function draw(force = false) {
      const total = timing.plan.totalFrames;
      if (!total) return;
      frame = Math.min(frame, total - 1);
      if (frame === shown && !force) return;
      shown = frame;
      const { index, local } = photoAt(timing.plan, frame);
      const { frames } = timing.plan.cuts[index];
      Render.drawScene(ctx, sceneFor(index), Render.progressOf(local, frames));
      if (model.ui.zones) drawZones(ctx, zonesFor('reel', format()), scale());

      const { fps } = model.s.output;
      $('scrub').value = String(frame);
      $('time').textContent = `${clock(frame / fps)} / ${clock(total / fps)}`;
      if (index !== activeIndex) {
        $('clips').children[activeIndex]?.classList.remove('active');
        $('clips').children[index]?.classList.add('active');
        activeIndex = index;
      }
    }

    function tick(now) {
      if (!playing) return;
      const total = timing.plan.totalFrames;
      if (total) {
        frame = (startFrame + Math.floor(((now - startTime) / 1000) * model.s.output.fps)) % total;
        draw();
      }
      requestAnimationFrame(tick);
    }

    function setPlaying(value) {
      playing = value && timing.plan.totalFrames > 0;
      $('play').textContent = playing ? '❚❚' : '▶';
      $('play').setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
      if (playing) {
        startTime = performance.now();
        startFrame = frame;
        requestAnimationFrame(tick);
      }
    }

    return {
      toggle: () => setPlaying(!playing),
      pause: () => setPlaying(false),
      seek(value) {
        frame = Math.max(0, value);
        startTime = performance.now();
        startFrame = frame;
        draw(true);
      },
      // Ajustes o fotos cambiados: las escenas guardadas ya no valen.
      invalidate() {
        scenes.clear();
        resize();
        $('scrub').max = String(Math.max(0, timing.plan.totalFrames - 1));
        activeIndex = -1;
        [...$('clips').children].forEach((c) => c.classList.remove('active'));
        if (!timing.plan.totalFrames) setPlaying(false);
        draw(true);
      },
    };
  })();

  // ---- Estado y avisos ----------------------------------------------------

  function refresh() {
    timing = Render.planFor(photos, model.s);
    updateClips();
    player.invalidate();
    updateChrome();
  }

  function updateNotes() {
    const { plan, seconds } = timing;
    const { fps, format: out } = model.s.output;
    const total = plan.totalFrames / fps;
    $('total-note').textContent = photos.length
      ? `${photos.length} fotos · ${fmt(total)} s · ${plan.totalFrames} fotogramas a ${fps} fps`
      : 'Carga fotos para empezar.';

    const flashing = seconds.some((s) => s < FLASH_SECONDS);
    $('flash-note').hidden = !flashing;
    $('flash-note').textContent = flashing
      ? 'Hay fotos de menos de 0,33 s. Más de 3 cambios por segundo pueden molestar a personas fotosensibles.'
      : '';

    const long = total > REEL_MAX_SECONDS;
    $('length-note').hidden = !long;
    $('length-note').textContent = long ? 'Dura más de 3 minutos, el máximo de un Reel.' : '';

    const low = $('clips').querySelectorAll('.clip-warn:not([hidden])').length;
    $('res-note').hidden = !low;
    $('res-note').textContent = low
      ? `${low} ${low === 1 ? 'foto tiene' : 'fotos tienen'} menos resolución que el vídeo y se verá${low === 1 ? '' : 'n'} ampliada${low === 1 ? '' : 's'}.`
      : '';

    const noFolder = out !== 'mp4' && typeof window.showDirectoryPicker !== 'function';
    $('target-note').hidden = !noFolder;
    $('target-note').textContent = noFolder
      ? 'Este navegador no deja elegir carpeta: la secuencia se descarga en un ZIP. En Chrome o Edge se guarda directamente en disco.'
      : '';
  }

  function updateChrome() {
    const has = photos.length > 0;
    $('dropzone').hidden = has;
    $('workspace').hidden = !has;
    $('clear').hidden = !has || busy;
    $('cancel').hidden = !busy;
    $('export').disabled = !has || busy || pendingImports > 0;
    document.querySelectorAll('[data-order], #add-more').forEach((b) => { b.disabled = busy; });
    if (!busy) {
      const label = { png: 'secuencia PNG', jpeg: 'secuencia JPEG', mp4: 'MP4' }[model.s.output.format];
      $('export').textContent = `Exportar ${label}`;
    }
    const loading = pendingImports > 0 ? ` · cargando ${pendingImports}…` : '';
    $('summary').textContent = `Arrastra para cambiar el orden.${loading}`;
    updateNotes();
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 7000);
  }

  // ---- Enlace de controles ------------------------------------------------

  function readControl(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.dataset.type === 'number') return Number(el.value);
    return el.value;
  }

  // data-show="ruta=valor" (o "ruta!=valor") muestra el elemento solo si se cumple.
  function visible(rule) {
    const [, path, op, value] = /^([\w.]+)(!?=)(.*)$/.exec(rule);
    const equal = String(getPath(path)) === value;
    return op === '=' ? equal : !equal;
  }

  function syncControls() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const value = getPath(el.dataset.bind);
      if (el.type === 'radio') el.checked = el.value === String(value);
      else if (el.type === 'checkbox') el.checked = value;
      else if (el !== document.activeElement || el.type !== 'text') el.value = value;
    });
    document.querySelectorAll('[data-out]').forEach((el) => {
      const value = getPath(el.dataset.out);
      el.textContent = `${typeof value === 'number' ? fmt(value) : value}${el.dataset.unit ?? ''}`;
    });
    document.querySelectorAll('[data-show]').forEach((el) => { el.hidden = !visible(el.dataset.show); });
    document.querySelectorAll('[data-set]').forEach((el) => {
      el.classList.toggle('active', getPath(el.dataset.set) === Number(el.dataset.value));
    });
    const isPreset = [...document.querySelectorAll('input[name="color"]')].some((el) => el.checked);
    $('custom-color').classList.toggle('active', !isPreset);
  }

  let changeQueued = false;
  function settingsChanged() {
    syncControls();
    Settings.save(storage, model.s);
    if (changeQueued) return;
    changeQueued = true;
    requestAnimationFrame(() => {
      changeQueued = false;
      repaintClips();
      refresh();
    });
  }

  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.addEventListener('input', () => {
      setPath(el.dataset.bind, readControl(el));
      settingsChanged();
    });
  });

  document.querySelectorAll('[data-set]').forEach((el) => {
    el.addEventListener('click', () => {
      setPath(el.dataset.set, Number(el.dataset.value));
      settingsChanged();
    });
  });

  // ---- Exportación --------------------------------------------------------

  $('export').addEventListener('click', async () => {
    if (busy || !photos.length) return;
    const target = await Render.chooseTarget(model.s);
    if (!target) return; // canceló la elección de carpeta
    busy = true;
    controller = new AbortController();
    player.pause();
    updateChrome();
    const started = performance.now();
    try {
      const result = await Render.exportReel({
        photos: [...photos],
        settings: structuredClone(model.s),
        target,
        signal: controller.signal,
        onProgress: (done, total) => {
          $('export').textContent = `Exportando ${Math.floor((done / total) * 100)} % · ${done} de ${total}`;
        },
      });
      const elapsed = fmt((performance.now() - started) / 1000, 0);
      if (result.kind === 'file') {
        download(result);
        toast(`Listo en ${elapsed} s: ${result.name}`);
      } else {
        toast(`Listo en ${elapsed} s: ${result.frames} fotogramas en la carpeta ${result.folder}`);
      }
    } catch (error) {
      toast(error.name === 'AbortError' ? 'Exportación cancelada' : `No se pudo exportar: ${error.message}`);
    } finally {
      busy = false;
      controller = null;
      updateChrome();
    }
  });

  $('cancel').addEventListener('click', () => controller?.abort());

  // ---- Eventos ------------------------------------------------------------

  $('play').addEventListener('click', () => player.toggle());
  $('scrub').addEventListener('input', (e) => player.seek(Number(e.target.value)));

  document.querySelectorAll('[data-order]').forEach((button) => {
    button.addEventListener('click', () => {
      photos = sortPhotos(photos, button.dataset.order, Date.now() >>> 0);
      renderClips();
    });
  });

  $('dropzone').addEventListener('click', () => $('file-input').click());
  $('add-more').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  $('clear').addEventListener('click', () => {
    photos = [];
    player.pause();
    renderClips();
  });

  // Barra espaciadora: reproducir o pausar, salvo escribiendo en un campo.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !photos.length) return;
    if (e.target.closest('input, textarea, select, button')) return;
    e.preventDefault();
    player.toggle();
  });

  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    $('stage').classList.add('dragging');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) $('stage').classList.remove('dragging');
  });
  window.addEventListener('drop', (e) => {
    $('stage').classList.remove('dragging');
    if (!hasFiles(e)) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  syncControls();
  renderClips();
})();
