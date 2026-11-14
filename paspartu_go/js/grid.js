// Simulador de la cuadrícula del perfil: la publicación nueva entre las anteriores.
(function (root) {
  const { toolButton, makeSortable } = root.PaspartuDom;

  const MIN_CELLS = 9; // celdas visibles aunque aún no haya publicaciones cargadas
  const NEW_POST = 'new';

  /**
   * @param {HTMLElement} container
   * @param {(canvas: HTMLCanvasElement) => boolean} paintCover pinta la portada
   *   actual en el lienzo; devuelve false si todavía no hay ninguna
   */
  function createGrid(container, paintCover) {
    let items = [{ id: NEW_POST }];
    let nextId = 1;
    const group = { dragged: null };

    function move(id, toIndex) {
      const from = items.findIndex((item) => item.id === id);
      const [item] = items.splice(from, 1);
      items.splice(Math.max(0, Math.min(items.length, toIndex)), 0, item);
      render();
    }

    function remove(id) {
      const item = items.find((i) => i.id === id);
      URL.revokeObjectURL(item.url);
      items = items.filter((i) => i !== item);
      render();
    }

    function cell(item, index) {
      const node = document.createElement('li');
      node.className = 'grid-cell';
      makeSortable(node, group, item.id, (draggedId, targetId) => {
        move(draggedId, items.findIndex((i) => i.id === targetId));
      });

      if (item.id === NEW_POST) {
        node.classList.add('grid-new');
        const canvas = document.createElement('canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Publicación nueva');
        if (paintCover(canvas)) node.append(canvas);
        const badge = document.createElement('span');
        badge.className = 'grid-badge';
        badge.textContent = 'Nueva';
        node.append(badge);
      } else {
        const image = document.createElement('img');
        image.src = item.url;
        image.alt = item.name;
        image.draggable = false;
        node.append(image);
      }

      const tools = document.createElement('span');
      tools.className = 'grid-tools';
      tools.append(
        toolButton('←', 'Mover antes', index === 0, () => move(item.id, index - 1)),
        toolButton('→', 'Mover después', index === items.length - 1, () => move(item.id, index + 1)),
      );
      if (item.id !== NEW_POST) tools.append(toolButton('×', 'Quitar', false, () => remove(item.id)));
      node.append(tools);
      return node;
    }

    function render() {
      const cells = items.map(cell);
      for (let i = items.length; i < MIN_CELLS; i++) {
        const empty = document.createElement('li');
        empty.className = 'grid-cell grid-empty';
        cells.push(empty);
      }
      container.replaceChildren(...cells);
    }

    function addFiles(files) {
      for (const file of files) {
        items.push({ id: nextId++, name: file.name, url: URL.createObjectURL(file) });
      }
      render();
    }

    return { render, addFiles, count: () => items.length - 1 };
  }

  root.PaspartuGrid = { createGrid };
})(globalThis);
