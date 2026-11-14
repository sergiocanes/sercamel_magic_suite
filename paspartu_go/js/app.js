// Interfaz: estado, enlace de controles y coordinación de módulos.
(function () {
  const { FORMATS, STORY, bestFormat, gridCropPx } = PaspartuLayout;
  const { suggestPanels } = PaspartuPanorama;
  const Compositor = PaspartuCompositor;
  const Exporters = PaspartuExporters;
  const Presets = PaspartuPresets;
  const { zonesFor, drawZones } = PaspartuSafeZones;
  const { toolButton, makeSortable, download } = PaspartuDom;

  const MAX_SLIDES = 20;
  const THUMB_SIZE = 900;
  const PANORAMA_THUMB_SIZE = 2400;
  const PREVIEW_WIDTH = 540;
  const PANEL_PREVIEW_WIDTH = 360;
  const EXIF_READ_BYTES = 256 * 1024; // el EXIF va al principio del JPEG
  const SAMPLE_SIZE = 48; // lado de la muestra por foto para la paleta
  const PALETTE_COLORS = 6;
  const DEFAULT_BORDER = 6; // px al aplicar color de paleta a un borde inexistente

  const $ = (id) => document.getElementById(id);

  // Todo lo que los controles pueden editar: los data-bind son rutas dentro de `model`.
  const model = {
    s: Presets.resolve(),
    ui: { tab: 'carousel', preview: 'feed', zones: false, paletteTarget: 'background' },
    pano: { format: '4:5', panels: 3, marginOrder: 'before', fit: 'cover' },
    reel: { seconds: 6, motion: 'zoom-in' },
  };

  let photos = []; // { id, name, file, w, h, thumb, samples, caption }
  let panorama = null; // misma forma que una foto
  let coverSource = 'carousel'; // qué portada simula la grilla
  let nextId = 1;
  let pendingImports = 0;
  let importQueue = Promise.resolve();
  let busy = false;
  let repaintQueued = false;
  let toastTimer;
  const slideGroup = { dragged: null };
  const presetStore = Presets.createStore(safeStorage());

  // Algunos navegadores lanzan un error al acceder a localStorage desde file://.
  function safeStorage() {
    try {
      return window.localStorage;
    } catch {
      return {
        getItem: () => null,
        setItem() { throw new Error('Almacenamiento no disponible'); },
      };
    }
  }

  const getPath = (path) => path.split('.').reduce((node, key) => node[key], model);
  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((node, key) => node[key], model)[last] = value;
  }

  function activeFormat() {
    const { s } = model;
    if (s.format !== 'auto') return { key: s.format, ...FORMATS[s.format] };
    const { key } = bestFormat(photos, s.marginPct);
    return { key, ...FORMATS[key] };
  }

  const previewFormat = () => (model.ui.preview === 'feed' ? activeFormat() : STORY);
  const panoramaOptions = () => ({ ...model.pano, format: FORMATS[model.pano.format] });

  function paintPreview(canvas, photo, format) {
    const scale = PREVIEW_WIDTH / format.w;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.round(format.h * scale);
    Compositor.compositePhoto(canvas, photo, photo.thumb, format, model.s, scale);
    if (model.ui.zones) drawZones(canvas.getContext('2d'), zonesFor(model.ui.preview, format), scale);
  }

  // ---- Importación --------------------------------------------------------

  function samplePixels(thumb) {
    const canvas = Compositor.newCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(thumb, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const rgb = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 127) rgb.push(data[i], data[i + 1], data[i + 2]);
    }
    return rgb;
  }

  async function readCaption(file) {
    const buffer = await file.slice(0, EXIF_READ_BYTES).arrayBuffer();
    return PaspartuExif.formatCaption(PaspartuExif.parseExif(buffer));
  }

  async function importFile(file, thumbSize) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
    const { width: w, height: h } = bitmap;
    const ratio = Math.min(1, thumbSize / Math.max(w, h));
    const thumb = Compositor.newCanvas(Math.max(1, w * ratio), Math.max(1, h * ratio));
    const ctx = thumb.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(Compositor.stepDown(bitmap, thumb.width, thumb.height), 0, 0, thumb.width, thumb.height);
    bitmap.close();
    return {
      id: nextId++,
      name: file.name,
      file,
      w,
      h,
      thumb,
      samples: samplePixels(thumb),
      caption: await readCaption(file),
    };
  }

  function addFiles(files) {
    const list = [...files];
    if (!list.length) return;
    coverSource = 'carousel';
    pendingImports += list.length;
    updateChrome();
    importQueue = importQueue.then(async () => {
      const failed = [];
      for (const file of list) {
        const photo = await importFile(file, THUMB_SIZE);
        if (photo) photos.push(photo);
        else failed.push(file.name);
        pendingImports--;
        renderSlides();
      }
      if (failed.length) toast(`No se pudo leer: ${failed.join(', ')}`);
    });
  }

  async function setPanorama(file) {
    if (!file) return;
    pendingImports++;
    updateChrome();
    const photo = await importFile(file, PANORAMA_THUMB_SIZE);
    pendingImports--;
    if (!photo) {
      toast(`No se pudo leer: ${file.name}`);
      updateChrome();
      return;
    }
    panorama = photo;
    $('pano-caption').value = photo.caption;
    coverSource = 'panorama';
    model.pano.panels = suggestPanels(photo.w, photo.h, FORMATS[model.pano.format]);
    syncControls();
    renderAll();
  }

  // ---- Carrusel -----------------------------------------------------------

  function movePhoto(id, toIndex) {
    const from = photos.findIndex((p) => p.id === id);
    const [photo] = photos.splice(from, 1);
    photos.splice(toIndex, 0, photo);
    renderSlides();
  }

  function removePhoto(id) {
    photos = photos.filter((p) => p.id !== id);
    renderSlides();
  }

  function slideElement(photo, index, format) {
    const item = document.createElement('li');
    item.className = 'slide';
    item.dataset.id = photo.id;
    makeSortable(item, slideGroup, photo.id, (draggedId) => movePhoto(draggedId, photos.indexOf(photo)));

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Vista previa de ${photo.name}`);
    paintPreview(canvas, photo, format);

    const info = document.createElement('div');
    info.className = 'slide-info';
    const number = document.createElement('span');
    number.className = 'slide-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'slide-name';
    name.textContent = photo.name;
    name.title = `${photo.name} · ${photo.w}×${photo.h} px`;
    const tools = document.createElement('span');
    tools.className = 'slide-tools';
    tools.append(
      toolButton('←', 'Mover antes', index === 0, () => movePhoto(photo.id, index - 1)),
      toolButton('→', 'Mover después', index === photos.length - 1, () => movePhoto(photo.id, index + 1)),
      toolButton('×', 'Quitar', false, () => removePhoto(photo.id)),
    );
    info.append(number, name, tools);

    const warn = document.createElement('p');
    warn.className = 'slide-warn';

    const caption = document.createElement('textarea');
    caption.className = 'slide-caption';
    caption.rows = 2;
    caption.value = photo.caption;
    caption.placeholder = 'Equipo\nAjustes';
    caption.setAttribute('aria-label', `Datos de ${photo.name}`);
    caption.addEventListener('input', () => {
      photo.caption = caption.value;
      scheduleRepaint();
    });
    // Sin esto, seleccionar texto arrastrando movería la tarjeta.
    caption.addEventListener('mousedown', () => { item.draggable = false; });
    caption.addEventListener('blur', () => { item.draggable = true; });

    item.append(canvas, info, warn, caption);
    return item;
  }

  function updateSlide(item, photo, format) {
    const { scale } = Compositor.photoRect(photo, format, model.s);
    const warn = item.querySelector('.slide-warn');
    warn.hidden = scale <= 1;
    warn.textContent = scale > 1 ? `Baja resolución: se amplía ×${scale.toFixed(1)}` : '';
    item.querySelector('.slide-caption').hidden = !model.s.exif.enabled;
  }

  function renderSlides() {
    const format = previewFormat();
    const items = photos.map((photo, index) => {
      const item = slideElement(photo, index, format);
      updateSlide(item, photo, format);
      return item;
    });
    $('slides').replaceChildren(...items);
    renderPalette();
    renderReelOptions();
    updateChrome();
    if (model.ui.tab === 'grid') grid.render();
  }

  // ---- Panorámica ---------------------------------------------------------

  function renderPanorama() {
    if (!panorama) return;
    const options = panoramaOptions();
    const scale = PANEL_PREVIEW_WIDTH / options.format.w;
    const canvases = Compositor.renderPanels(panorama, panorama.thumb, options, model.s, scale);
    if (model.ui.zones) {
      canvases.forEach((c) => drawZones(c.getContext('2d'), zonesFor('feed', options.format), scale));
    }
    $('panels').replaceChildren(...canvases.map((canvas, index) => {
      const figure = document.createElement('figure');
      const label = document.createElement('figcaption');
      label.textContent = String(index + 1).padStart(2, '0');
      figure.append(canvas, label);
      return figure;
    }));

    const plan = Compositor.panoramaPlan(panorama, options, model.s);
    const parts = [
      `${panorama.w}×${panorama.h} px`,
      `${options.panels} × ${options.format.w}×${options.format.h} px`,
    ];
    if (plan.cropped > 0.005) parts.push(`recorta el ${Math.round(plan.cropped * 100)} %`);
    if (plan.scale > 1) parts.push(`baja resolución: se amplía ×${plan.scale.toFixed(1)}`);
    const { enabled, position } = model.s.exif;
    if (enabled) parts.push(`datos EXIF en el panel ${PaspartuPanorama.captionPanel(position, options.panels) + 1}`);
    $('pano-note').textContent = parts.join(' · ');
    $('pano-caption').hidden = !enabled;
  }

  // ---- Grilla -------------------------------------------------------------

  function paintCover(canvas) {
    if (coverSource === 'panorama' && panorama) {
      const options = panoramaOptions();
      const scale = PREVIEW_WIDTH / options.format.w;
      const [first] = Compositor.renderPanels(panorama, panorama.thumb, options, model.s, scale);
      canvas.width = first.width;
      canvas.height = first.height;
      canvas.getContext('2d').drawImage(first, 0, 0);
      return true;
    }
    if (!photos.length) return false;
    const format = activeFormat();
    const scale = PREVIEW_WIDTH / format.w;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.round(format.h * scale);
    Compositor.compositePhoto(canvas, photos[0], photos[0].thumb, format, model.s, scale);
    return true;
  }

  const grid = PaspartuGrid.createGrid($('grid'), paintCover);

  // ---- Paleta -------------------------------------------------------------

  function applyPaletteColor(hex) {
    if (model.ui.paletteTarget === 'background') {
      model.s.color = hex;
    } else {
      model.s.border.color = hex;
      if (!model.s.border.width) model.s.border.width = DEFAULT_BORDER;
    }
    syncControls();
    renderAll();
  }

  function renderPalette() {
    const sources = coverSource === 'panorama' && panorama ? [panorama] : photos;
    const samples = sources.flatMap((p) => p.samples);
    const colors = PaspartuPalette.extractPalette(Uint8Array.from(samples), PALETTE_COLORS);
    $('palette-group').hidden = !colors.length;
    $('palette').replaceChildren(...colors.map(({ hex, weight }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.background = hex;
      button.style.flexGrow = String(0.5 + weight * 3);
      button.dataset.color = hex;
      button.title = `${hex} · ${Math.round(weight * 100)} %`;
      button.setAttribute('aria-label', `Aplicar color ${hex}`);
      button.addEventListener('click', () => applyPaletteColor(hex));
      return button;
    }));
  }

  // ---- Presets ------------------------------------------------------------

  function renderPresetList(selected = '') {
    const list = $('preset-list');
    const option = (label, value) => {
      const node = document.createElement('option');
      node.textContent = label;
      node.value = value;
      return node;
    };
    const group = (label, names, prefix) => {
      const node = document.createElement('optgroup');
      node.label = label;
      node.append(...names.map((name) => option(name, `${prefix}:${name}`)));
      return node;
    };
    const saved = presetStore.names();
    list.replaceChildren(option('Elige un preset…', ''), group('Incluidos', Object.keys(Presets.BUILTIN), 'builtin'));
    if (saved.length) list.append(group('Guardados', saved, 'user'));
    list.value = selected;
    $('preset-delete').hidden = !selected.startsWith('user:');
  }

  function loadPreset(value) {
    if (!value) return;
    const separator = value.indexOf(':');
    const kind = value.slice(0, separator);
    const name = value.slice(separator + 1);
    model.s = kind === 'builtin' ? Presets.resolve(Presets.BUILTIN[name]) : presetStore.get(name);
    syncControls();
    renderAll();
    $('preset-delete').hidden = kind !== 'user';
  }

  function savePreset() {
    const name = $('preset-name').value.trim();
    if (!name) {
      toast('Ponle un nombre al preset');
      return;
    }
    try {
      presetStore.save(name, model.s);
    } catch {
      toast('El navegador no permite guardar presets');
      return;
    }
    $('preset-name').value = '';
    renderPresetList(`user:${name}`);
    toast(`Preset guardado: ${name}`);
  }

  // ---- Reel ---------------------------------------------------------------

  function renderReelOptions() {
    const select = $('reel-photo');
    const current = select.value;
    select.replaceChildren(...photos.map((photo, index) => {
      const option = document.createElement('option');
      option.value = photo.id;
      option.textContent = `${String(index + 1).padStart(2, '0')} · ${photo.name}`;
      return option;
    }));
    if (photos.some((p) => String(p.id) === current)) select.value = current;
  }

  // ---- Repintado y estado de la interfaz ----------------------------------

  function repaint() {
    const format = previewFormat();
    photos.forEach((photo, index) => {
      const item = $('slides').children[index];
      paintPreview(item.querySelector('canvas'), photo, format);
      updateSlide(item, photo, format);
    });
    renderPanorama();
    if (model.ui.tab === 'grid') grid.render();
    updateChrome();
  }

  function renderAll() {
    renderSlides();
    renderPanorama();
  }

  // Los deslizadores disparan muchos eventos seguidos: uno por fotograma basta.
  function scheduleRepaint() {
    if (repaintQueued) return;
    repaintQueued = true;
    requestAnimationFrame(() => {
      repaintQueued = false;
      repaint();
    });
  }

  function updateNotes() {
    const format = activeFormat();
    const { s, ui } = model;
    if (!photos.length) {
      $('format-note').textContent = s.format === 'auto'
        ? 'Elige el formato en el que tus fotos ocupan más lienzo.'
        : `${format.w}×${format.h} px`;
    } else {
      const area = (p) => {
        const { w, h } = Compositor.photoRect(p, format, s);
        return (w * h) / (format.w * format.h);
      };
      const mean = photos.reduce((sum, p) => sum + area(p), 0) / photos.length;
      const prefix = s.format === 'auto' ? `Auto: ${format.key} · ` : '';
      const preview = ui.preview === 'feed' ? '' : ' · vista previa en 9:16';
      $('format-note').textContent = `${prefix}${format.w}×${format.h} px · las fotos ocupan el ${Math.round(mean * 100)} %${preview}`;
    }

    const crop = gridCropPx(format);
    const cover = photos[0];
    const carousel = ui.tab === 'carousel';
    const coverCut = carousel && cover && Compositor.photoRect(cover, format, s).x < crop;
    $('grid-note').hidden = !coverCut;
    $('grid-note').textContent = coverCut
      ? `La cuadrícula del perfil cortará ${Math.round(crop)} px por lado de la portada y llegará a la foto. Sube el margen o usa 3:4.`
      : '';

    const over = carousel && photos.length > MAX_SLIDES;
    $('count-note').hidden = !over;
    $('count-note').textContent = over ? `Tienes ${photos.length} fotos; un carrusel admite ${MAX_SLIDES}.` : '';
  }

  function updateChrome() {
    const { tab } = model.ui;
    const has = photos.length > 0;
    const blocked = busy || pendingImports > 0;

    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    });
    document.querySelectorAll('[data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== tab;
    });
    document.querySelectorAll('[data-only]').forEach((node) => {
      node.hidden = node.dataset.only !== tab;
    });

    $('dropzone').hidden = has;
    $('slides').hidden = !has;
    $('toolbar').hidden = !has;
    $('pano-dropzone').hidden = Boolean(panorama);
    $('pano-editor').hidden = !panorama;
    $('clear').hidden = !(tab === 'carousel' ? has : tab === 'panorama' && panorama);

    $('export').disabled = !has || blocked;
    $('export-multi').disabled = !has || blocked;
    $('export-reel').disabled = !has || blocked;
    $('export-panorama').disabled = !panorama || blocked;

    if (!busy) {
      const noun = photos.length === 1 ? 'imagen' : 'imágenes';
      $('export').textContent = has ? `Exportar ${photos.length} ${noun}` : 'Exportar carrusel';
      $('export-multi').textContent = 'Feed + Story + Square';
      $('export-reel').textContent = 'Generar vídeo';
      $('export-panorama').textContent = panorama ? `Exportar ${model.pano.panels} paneles` : 'Exportar paneles';
    }
    const loading = pendingImports > 0 ? ` · cargando ${pendingImports}…` : '';
    $('summary').textContent = `Arrastra para ordenar. La primera es la portada.${loading}`;
    updateNotes();
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 6000);
  }

  // ---- Enlace de controles ------------------------------------------------

  function readControl(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range') return Number(el.value);
    return el.value;
  }

  function syncControls() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const value = getPath(el.dataset.bind);
      if (el.type === 'radio') el.checked = el.value === value;
      else if (el.type === 'checkbox') el.checked = value;
      else el.value = value;
    });
    document.querySelectorAll('[data-out]').forEach((el) => {
      el.textContent = `${getPath(el.dataset.out)}${el.dataset.unit ?? ''}`;
    });
    const isPreset = [...document.querySelectorAll('input[name="color"]')].some((el) => el.checked);
    $('custom-color').classList.toggle('active', !isPreset);
  }

  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.addEventListener('input', () => {
      setPath(el.dataset.bind, readControl(el));
      syncControls();
      scheduleRepaint();
    });
  });

  // ---- Exportaciones ------------------------------------------------------

  async function runTask(button, task) {
    if (busy) return;
    busy = true;
    updateChrome();
    try {
      await task((text) => { button.textContent = text; });
    } catch (error) {
      toast(`No se pudo exportar: ${error.message}`);
    } finally {
      busy = false;
      updateChrome();
    }
  }

  const progress = (report, verb) => (done, total) => report(`${verb} ${done} de ${total}…`);

  $('export').addEventListener('click', () => runTask($('export'), async (report) => {
    const format = activeFormat();
    const result = await Exporters.exportCarousel({
      photos: [...photos],
      format,
      settings: model.s,
      onProgress: progress(report, 'Exportando'),
    });
    download(result);
    toast(`Carrusel listo: ${photos.length} × ${format.w}×${format.h} px`);
  }));

  $('export-multi').addEventListener('click', () => runTask($('export-multi'), async (report) => {
    const result = await Exporters.exportMultiFormat({
      photos: [...photos],
      settings: model.s,
      onProgress: progress(report, 'Exportando'),
    });
    download(result);
    toast(`Listo: ${photos.length * 3} imágenes en feed/, story/ y square/`);
  }));

  $('export-panorama').addEventListener('click', () => runTask($('export-panorama'), async (report) => {
    const result = await Exporters.exportPanorama({
      photo: panorama,
      options: panoramaOptions(),
      settings: model.s,
      onProgress: progress(report, 'Exportando'),
    });
    download(result);
    toast(`Panorámica lista: ${model.pano.panels} paneles`);
  }));

  $('export-reel').addEventListener('click', () => runTask($('export-reel'), async (report) => {
    const photo = photos.find((p) => String(p.id) === $('reel-photo').value) ?? photos[0];
    const result = await PaspartuReel.renderReel({
      photo,
      settings: model.s,
      seconds: model.reel.seconds,
      motion: model.reel.motion,
      onProgress: (done, total) => report(`Generando ${Math.round((done / total) * 100)} %…`),
    });
    download(result);
    toast(result.isMp4
      ? 'Reel listo en MP4'
      : 'Este navegador solo genera WebM. Instagram pide MP4: conviértelo o usa otro navegador.');
  }));

  // ---- Eventos ------------------------------------------------------------

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      model.ui.tab = button.dataset.tab;
      if (model.ui.tab === 'panorama') coverSource = panorama ? 'panorama' : coverSource;
      if (model.ui.tab === 'carousel') coverSource = 'carousel';
      if (model.ui.tab === 'grid') grid.render();
      renderPalette();
      updateChrome();
    });
  });

  $('dropzone').addEventListener('click', () => $('file-input').click());
  $('add-more').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  $('pano-dropzone').addEventListener('click', () => $('pano-input').click());
  $('pano-change').addEventListener('click', () => $('pano-input').click());
  $('pano-input').addEventListener('change', (e) => {
    setPanorama(e.target.files[0]);
    e.target.value = '';
  });

  $('pano-caption').addEventListener('input', (e) => {
    panorama.caption = e.target.value;
    scheduleRepaint();
  });

  $('grid-add').addEventListener('click', () => $('grid-input').click());
  $('grid-input').addEventListener('change', (e) => {
    grid.addFiles([...e.target.files]);
    e.target.value = '';
  });

  $('clear').addEventListener('click', () => {
    if (model.ui.tab === 'panorama') {
      panorama = null;
      coverSource = 'carousel';
      $('panels').replaceChildren();
    } else {
      photos = [];
    }
    renderSlides();
  });

  $('preset-list').addEventListener('change', (e) => loadPreset(e.target.value));
  $('preset-save').addEventListener('click', savePreset);
  $('preset-delete').addEventListener('click', () => {
    const value = $('preset-list').value;
    presetStore.remove(value.slice(value.indexOf(':') + 1));
    renderPresetList();
  });

  // Soltar archivos en cualquier punto de la ventana: van a la vista activa.
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
    const { files } = e.dataTransfer;
    if (model.ui.tab === 'panorama') setPanorama(files[0]);
    else if (model.ui.tab === 'grid') grid.addFiles([...files]);
    else addFiles(files);
  });

  syncControls();
  renderPresetList();
  renderSlides();
})();
