// Script-insensitive search adapters. Original data, IDs, targets and typed text
// remain unchanged. Requires BuyiText and runs after the original module scripts.
(() => {
  'use strict';
  const text = window.BuyiText;
  if (!text || typeof text.toSimplified !== 'function') return;
  const simplified = value => text.toSimplified(String(value ?? ''));
  const app = document.documentElement.dataset.suiteApp;

  // Native renderers read .value synchronously. Save selection as well as text,
  // so searching from the middle of a query does not jump the caret to the end.
  function saveInput(input) {
    return {value:input.value,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
  }
  function restoreInput(input, saved) {
    input.value = saved.value;
    if (saved.start !== null && saved.end !== null) {
      try { input.setSelectionRange(saved.start, saved.end, saved.direction || 'none'); } catch {}
    }
  }

  if (app === 'formulas' && typeof searchCards === 'function') {
    const originalSearch = searchCards;
    const shadows = new WeakMap(), originals = new WeakMap(), entries = new WeakMap();
    function shadow(card) {
      if (shadows.has(card)) return shadows.get(card);
      const copy = {...card,
        dose:simplified(card.dose), method:simplified(card.method), backPlain:simplified(card.backPlain),
        search:card.search.map(entry => {
          // Pinyin, kind and target retain their source identities. Only the
          // comparison string is normalized; displayed matches map back below.
          const copy = {...entry, name:simplified(entry.name)};
          entries.set(copy, entry);
          return copy;
        })
      };
      shadows.set(card, copy); originals.set(copy, card);
      return copy;
    }
    searchCards = function(query, subset = cards) {
      // The reference adapter still owns clause matching, numeric legacy IDs,
      // ranks and sorting. Its shadow results are restored to actual objects.
      return originalSearch(simplified(query), subset.map(shadow)).map(hit => ({
        ...hit,
        card:originals.get(hit.card) || hit.card,
        result:{...hit.result, match:entries.get(hit.result.match) || hit.result.match}
      }));
    };
    renderLibrary();
  }

  if (app === 'meridians') {
    const input = document.getElementById('point-search');
    const filter = document.getElementById('meridian-filter');
    const data = window.__PILOT_ASSETS__?.annotations;
    if (!input || !filter || !data?.points || !data?.meridians) return;
    // Same punctuation/pinyin rules as the original module's Hd function,
    // with OpenCC added to both sides. No extra medical aliases are introduced.
    const normalize = value => simplified(value).normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[\s'’-]/g, '').replace(/([ln])v/g, '$1u');
    const meridians = new Map(data.meridians.map(m => [m.id, m]));
    const index = new Map(data.points.map(point => {
      const meridian = meridians.get(point.meridian);
      return [point.id, normalize([point.id, point.name, point.pinyin, ...(point.aliases || []),
        meridian?.name || '', meridian?.introduction?.pinyin || ''].join(' '))];
    }));
    function applyQuery(query) {
      const needle = normalize(query);
      let count = 0;
      for (const button of document.querySelectorAll('#point-results [data-point]')) {
        if ((index.get(button.dataset.point) || '').includes(needle)) count++;
        else button.remove();
      }
      document.getElementById('directory-count').textContent = `${count} 个`;
      document.getElementById('no-results').hidden = count !== 0;
    }
    function wrap(element, property) {
      const handler = element[property];
      if (typeof handler !== 'function') return;
      element[property] = function(...args) {
        // Assigning .value during an active IME composition can cancel the
        // platform candidate session. Normalize once the composition commits.
        if (args[0]?.isComposing) return handler.apply(this, args);
        const saved = saveInput(input);
        // Enumerate the native meridian-filtered candidates first. Their real
        // selection handlers and order are retained, including mixed-script
        // names that a query-only conversion would otherwise miss.
        input.value = '';
        try {
          const result = handler.apply(this, args);
          applyQuery(saved.value);
          return result;
        } finally { restoreInput(input, saved); }
      };
    }
    wrap(input, 'oninput');
    wrap(filter, 'onchange');
    input.addEventListener('compositionend', () => input.oninput?.call(input));
    if (input.value) input.oninput?.call(input);
  }

  if (app === 'wuxing') {
    const C = window.WuXing;
    const picker = document.getElementById('picker-search');
    const atlas = document.getElementById('atlas-search');
    if (!C?.categories || !picker || !atlas) return;
    const index = new Map(Object.entries(C.categories).map(([id, category]) =>
      [id, simplified(category.name + category.values.join('') + category.note)]));
    function matches(id, query) { return (index.get(id) || '').includes(simplified(query.trim())); }

    // The original picker only hides candidates, so a later listener can apply
    // normalized matching without changing its private handlers or input value.
    function filterPicker() {
      const buttons = [...document.querySelectorAll('.category-option')];
      let count = 0;
      for (const button of buttons) {
        button.hidden = !matches(button.dataset.category, picker.value);
        if (!button.hidden) count++;
      }
      for (const heading of document.querySelectorAll('.picker-group')) {
        heading.hidden = !buttons.some(button => button.dataset.group === heading.dataset.group && !button.hidden);
      }
      document.getElementById('picker-empty').hidden = count !== 0;
    }
    picker.addEventListener('input', filterPicker);

    function filterAtlas(query) {
      let count = 0;
      for (const section of document.querySelectorAll('#relation-tables .table-section')) {
        let sectionCount = 0;
        for (const row of section.querySelectorAll('tbody tr[data-category]')) {
          if (matches(row.dataset.category, query)) sectionCount++;
          else row.remove();
        }
        if (!sectionCount) { section.remove(); continue; }
        count += sectionCount;
        const label = section.querySelector('.table-heading span');
        if (label) label.textContent = `${sectionCount} 组`;
      }
      document.getElementById('atlas-status').textContent = `显示 ${count} / ${Object.keys(C.categories).length} 组 · 已在圆盘上的类别标出所在圈层`;
      document.getElementById('atlas-empty').hidden = count !== 0;
    }

    // renderTables is private and rebuilds its DOM. Capture the three native
    // entry paths, let it enumerate all candidates in the selected group, then
    // restore the visible query and apply a separate normalized source index.
    // Event-local snapshots also handle a nested synchronous wuxing-render.
    const pending = new WeakMap(), stack = [];
    function relevant(event) {
      return event.type === 'wuxing-render' ||
        (event.type === 'input' && event.target === atlas) ||
        (event.type === 'click' && event.target instanceof Element && !!event.target.closest('[data-filter]'));
    }
    function begin(event) {
      if (!relevant(event) || event.isComposing) return;
      const saved = saveInput(atlas);
      const frame = {saved, query:stack.length ? stack[0].query : saved.value};
      pending.set(event, frame); stack.push(frame);
      atlas.value = '';
      // Fallback only: a future handler that stops propagation must not leave
      // the user's visible query cleared. Normal completion is synchronous.
      // Use a task, not a microtask: trusted browser events may run a
      // microtask checkpoint between capture and target listeners.
      setTimeout(() => finish(event), 0);
    }
    function finish(event) {
      const frame = pending.get(event);
      if (!frame) return;
      pending.delete(event);
      const position = stack.indexOf(frame);
      if (position >= 0) stack.splice(position, 1);
      restoreInput(atlas, frame.saved);
      filterAtlas(frame.query);
    }
    for (const type of ['input', 'click', 'wuxing-render']) {
      document.addEventListener(type, begin, true);
      document.addEventListener(type, finish);
    }
    atlas.addEventListener('compositionend', () => atlas.dispatchEvent(new Event('input', {bubbles:true})));
    if (atlas.value) atlas.dispatchEvent(new Event('input', {bubbles:true}));
  }
})();
