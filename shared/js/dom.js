// Utilidades de interfaz compartidas.
(function (root) {
  function toolButton(text, label, disabled, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Hace que `item` se pueda reordenar arrastrándolo dentro de su grupo.
   *
   * @param {HTMLElement} item
   * @param {{dragged: *}} group estado compartido por los elementos de una lista
   * @param {*} id identificador de este elemento
   * @param {(draggedId: *, targetId: *) => void} onMove
   */
  function makeSortable(item, group, id, onMove) {
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      group.dragged = id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(id));
      item.classList.add('moving');
    });
    item.addEventListener('dragend', () => {
      group.dragged = null;
      item.classList.remove('moving');
    });
    item.addEventListener('dragover', (e) => {
      if (group.dragged === null || group.dragged === id) return;
      e.preventDefault();
      item.classList.add('target');
    });
    item.addEventListener('dragleave', () => item.classList.remove('target'));
    item.addEventListener('drop', (e) => {
      if (group.dragged === null) return;
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('target');
      if (group.dragged !== id) onMove(group.dragged, id);
    });
  }

  function download({ blob, name }) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }

  root.PaspartuDom = { toolButton, makeSortable, download };
})(globalThis);
