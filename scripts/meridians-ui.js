// Presentation and search adapter; the archived atlas and its source data stay intact.
(() => {
  'use strict';
  if (document.documentElement.dataset.suiteApp !== 'meridians') return;
  const assets = window.__PILOT_ASSETS__;
  const data = assets?.annotations;
  const input = document.getElementById('point-search');
  const filter = document.getElementById('meridian-filter');
  const directory = document.getElementById('point-directory');
  const results = document.getElementById('point-results');
  if (!data?.points || !input || !filter || !results) return;
  const simplified = value => window.BuyiText?.toSimplified(String(value ?? '')) ?? String(value ?? '');
  const plain = value => simplified(value).normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/u:/g, 'u').replace(/([ln])v/g, '$1u').replace(/[\s'’·_-]/g, '');
  const meridians = new Map(data.meridians.map(m => [m.id, m]));
  // Native filtering already handles an unmatched ID by hiding all lines and points.
  if (!Array.from(filter.options).some(option=>option.value==='none')) {
    const none=new Option('全不选','none');filter.insertBefore(none,filter.options[1] || null);
  }

  const codePrefixes = new Set(['lu','li','st','sp','ht','si','bl','ki','pc','te','gb','lr','gv','cv','rn','du','sj','ub']);
  function normalizeQuery(value) {
    let needle = plain(value);
    const code = needle.match(/^([a-z]{1,3})0*(\d+)(\+)?$/);
    if (code && codePrefixes.has(code[1])) return code[1] + Number(code[2]) + (code[3] || '');
    // Tone digits belong to pinyin here; point codes retain their numeric IDs.
    if (/^[a-z1-5]+$/.test(needle)) needle = needle.replace(/([a-z])[1-5]/g, '$1');
    return needle;
  }
  // Every standard name syllable carries a tone mark. Split against Mandarin
  // syllable forms, using the number of Chinese characters to disambiguate.
  const syllable = /^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|uai|iao|ian|uan|ang|eng|ong|ing|ai|ei|ao|ou|an|en|ia|ie|iu|in|ua|uo|ui|un|ue|er|a|o|e|i|u)|ng|m|n)$/;
  const tone = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]/gi;
  function initials(pinyin, name) {
    const compact = String(pinyin || '').toLowerCase().replace(/[\s'’·_-]/g, '');
    const expected = [...String(name || '')].filter(c => /\p{Script=Han}/u.test(c)).length;
    const memo = new Map();
    function split(at, left) {
      if (at === compact.length) return left === 0 ? [] : null;
      if (!left) return null;
      const key = `${at}:${left}`;
      if (memo.has(key)) return memo.get(key);
      for (let end = Math.min(compact.length, at + 6); end > at; end--) {
        const part = compact.slice(at, end);
        if ((part.match(tone) || []).length !== 1 || !syllable.test(plain(part))) continue;
        const tail = split(end, left - 1);
        if (tail) { const found = [part, ...tail]; memo.set(key, found); return found; }
      }
      memo.set(key, null); return null;
    }
    return (split(0, expected) || []).map(part => plain(part)[0]).join('');
  }
  // Keyboard tolerance only, never alternate displayed names or readings.
  // These queries cover likely polyphone guesses; the result keeps GB/T pinyin.
  const keyboardHints = {
    CV17:['shanzhong'], CV8:['shenjue'], CV14:['jujue'],
    PC4:['qiemen'], HT6:['yinqie'], BL38:['fuqie'],
    GB8:['lvgu','lugu'], BL61:['pushen']
  };
  const index = new Map(data.points.map(point => {
    const meridian = meridians.get(point.meridian);
    const fields = [point.id, point.name, point.pinyin, ...(point.aliases || []),
      meridian?.name || '', meridian?.introduction?.pinyin || '',
      initials(point.pinyin, point.name),
      initials(meridian?.introduction?.pinyin, meridian?.name),
      ...(keyboardHints[point.id] || [])].filter(Boolean).map(plain);
    return [point.id, fields];
  }));
  let lastIds = [];
  function tellParent() {
    if (window.parent !== window) window.parent.postMessage({type:'tcm-meridian-query',query:input.value}, '*');
  }
  function applyQuery(query) {
    const needle = normalizeQuery(query);
    lastIds = [];
    for (const button of results.querySelectorAll('[data-point]')) {
      if (!needle || index.get(button.dataset.point)?.some(field => field.includes(needle))) lastIds.push(button.dataset.point);
      else button.remove();
    }
    document.getElementById('directory-count').textContent = `${lastIds.length} 个`;
    document.getElementById('no-results').hidden = lastIds.length !== 0;
    document.documentElement.classList.toggle('buyi-meridian-searching', Boolean(needle));
    if (needle && directory) directory.open = true;
  }
  function wrap(element, property) {
    const native = element[property];
    if (typeof native !== 'function') return;
    element[property] = function(...args) {
      if (args[0]?.isComposing) return native.apply(this, args);
      const saved = {value:input.value,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
      input.value = '';
      try {
        const value = native.apply(this, args);
        applyQuery(saved.value);
        if(element===filter && filter.value==='none') {
          const title=document.getElementById('view-title'), subtitle=document.getElementById('view-subtitle');
          if(title)title.textContent='全不选';if(subtitle)subtitle.textContent='未显示经络';
        }
        return value;
      } finally {
        input.value = saved.value;
        try { if (saved.start !== null) input.setSelectionRange(saved.start, saved.end, saved.direction || 'none'); } catch {}
        tellParent();
      }
    };
  }
  wrap(input, 'oninput');
  wrap(filter, 'onchange');
  input.placeholder = '穴名、拼音、首字母或编号';
  input.setAttribute('aria-label', '搜索经络或者穴位');
  input.setAttribute('aria-controls', 'point-results');
  results.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-point]')) return;
    document.documentElement.classList.remove('buyi-meridian-searching');
    if (matchMedia('(max-width: 740px)').matches) requestAnimationFrame(() => {
      document.querySelector('.viewer')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { results.querySelector('[data-point]')?.focus(); event.preventDefault(); }
    if (event.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input',{bubbles:true})); }
  });

  // One fixed slow rate, preserving the existing player, stop button and errors.
  const speed = document.getElementById('pronunciation-speed');
  if (speed) {
    speed.replaceChildren(new Option('慢速', '0.75', true, true));
    speed.addEventListener('change', () => { speed.value = '0.75'; }, true);
    speed.value = '0.75'; speed.dispatchEvent(new Event('change',{bubbles:true}));
  }
  for (const clip of window.BuyiMeridianPronunciation?.clips || []) {
    if (assets.audio?.[clip.key] && typeof clip.data === 'string' && clip.mime === 'audio/wav') {
      assets.audio[clip.key] = {mime:clip.mime,data:clip.data};
    }
  }
  const status = document.getElementById('pronunciation-status');
  const pointTraditional = document.getElementById('point-traditional');
  const title = document.getElementById('selected-name');
  const shortPending = '本穴主治待整理';
  function refreshPresentation() {
    if (status) status.hidden = !status.textContent.includes('失败');
    if (pointTraditional && simplified(pointTraditional.textContent).startsWith('本穴的单穴主治尚未完成逐条整理与来源复核')) pointTraditional.textContent = shortPending;
    const badge = title?.querySelector('span');
    if (badge) { badge.removeAttribute('title'); badge.removeAttribute('aria-label'); }
    for (const button of [document.getElementById('speak-point'),document.getElementById('speak-meridian')]) {
      if (button) button.setAttribute('aria-label', button.getAttribute('aria-pressed') === 'true' ? '停止读音' : '慢速读音');
    }
  }
  const observer = new MutationObserver(refreshPresentation);
  for (const target of [status,pointTraditional,title]) if (target) observer.observe(target,{childList:true,subtree:true,characterData:true});
  refreshPresentation();

  const location = document.querySelector('.location-summary');
  if (location) {
    let heading = location.querySelector('.buyi-location-heading');
    if (!heading) {
      heading = document.createElement('div'); heading.className = 'buyi-location-heading';
      const label = location.querySelector(':scope > span') || document.createElement('span');
      label.textContent = '穴位定位';
      location.prepend(heading); heading.append(label);
    }
    let button = document.getElementById('buyi-cun-help');
    if (!button) {
      button = document.createElement('button');
      button.id = 'buyi-cun-help'; button.className = 'buyi-cun-help'; button.type = 'button';
      button.textContent = '同身寸'; button.setAttribute('aria-label', '查看同身寸图解');
      button.addEventListener('click', () => {
        const guide=document.getElementById('cun-help-dialog');
        if (!guide) return;
        if (!guide.open) guide.showModal();
      });
    }
    heading.append(button);
  }

  // Keep the guide in this document so it does not depend on parent messaging.
  const guide=document.getElementById('cun-help-dialog');
  document.getElementById('cun-help-close')?.addEventListener('click',()=>guide?.close());
  guide?.addEventListener('close',()=>document.getElementById('buyi-cun-help')?.focus({preventScroll:true}));
  for(const [headingSelector,rowSelector] of [
    ['#selected-name','.inspector-title > .pronunciation-row'],
    ['#intro-name','#panel-meridian > .pronunciation-row']
  ]){
    const heading=document.querySelector(headingSelector), row=document.querySelector(rowSelector);
    if(heading && row && heading.parentNode===row.parentNode){
      const wrapper=document.createElement('div');wrapper.className='buyi-pronunciation-heading';
      heading.before(wrapper);wrapper.append(heading,row);
    }
  }
  // Only suppress the repeated global boilerplate; specific point cautions stay.
  const caution=document.getElementById('point-caution');
  const generic='骨度分寸是人体比例，不是固定厘米。模型没有临床骨骼、肌腱、神经及血管层；三维点位仍待专业复核。';
  function compactCaution(){ if(caution) caution.hidden=simplified(caution.textContent).trim()===generic; }
  if(caution)new MutationObserver(compactCaution).observe(caution,{childList:true,characterData:true,subtree:true});
  compactCaution();

  // Preserve source titles and underlying source data without inline external links.
  const introNote=document.getElementById('intro-source-note'), introSources=document.getElementById('intro-sources');
  if(introNote && introSources){
    const details=document.createElement('details'), summary=document.createElement('summary');
    details.className='buyi-intro-sources';summary.textContent='资料来源';introNote.before(details);
    details.append(summary,introNote,introSources);
    const stripLinks=()=>{
      sourceObserver.disconnect();
      for(const anchor of introSources.querySelectorAll('a'))anchor.replaceWith(document.createTextNode(anchor.textContent));
      sourceObserver.observe(introSources,{childList:true,subtree:true});
    };
    const sourceObserver=new MutationObserver(stripLinks);stripLinks();
  }
  const sourcePanel=document.getElementById('panel-source');
  if(sourcePanel){
    for(const paragraph of sourcePanel.querySelectorAll('p.fine-print')){
      if(paragraph.textContent.includes('362') && paragraph.textContent.includes('671'))
        paragraph.textContent='国标 362 穴（含印堂，671 个侧别入口）；龈交为口内穴。三维定位与部分主治待核。';
    }
    const licenses=Array.from(sourcePanel.querySelectorAll('a.source-link'));
    if(licenses.length===2){const row=document.createElement('div');row.className='buyi-license-row';licenses[0].before(row);row.append(...licenses);}
  }

  const viewer = document.querySelector('.viewer');
  const canvas = document.getElementById('canvas-host');
  function bringViewerIntoView() {
    document.documentElement.classList.remove('buyi-meridian-searching');
    requestAnimationFrame(() => {
      viewer?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'center',inline:'nearest'});
      canvas?.focus({preventScroll:true});
    });
  }
  // Preserve the native detail camera action, then make its result visible.
  document.getElementById('focus-point')?.addEventListener('click', bringViewerIntoView);
  if (viewer && !document.getElementById('buyi-viewer-reset')) {
    const reset = document.createElement('button');
    reset.id = 'buyi-viewer-reset'; reset.className = 'buyi-viewer-reset'; reset.type = 'button';
    reset.setAttribute('aria-label', '重置为全身视图'); reset.title = '重置为全身视图';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 7v5h-5 M19.1 11a7.2 7.2 0 1 0-1.6 5.8');
    icon.append(path); reset.append(icon);
    reset.addEventListener('click', () => {
      // Native whole-body preset also restores the front/default camera target.
      document.querySelector('[data-preset="whole"]')?.click();
      bringViewerIntoView();
    });
    viewer.append(reset);
  }
  window.BuyiMeridians = {
    search(query, {focusResults = true} = {}) {
      input.value = String(query ?? '');
      filter.value = 'all';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      if (directory) directory.open = true;
      if (focusResults) {
        directory?.scrollIntoView({behavior:'smooth',block:'start'});
        (results.querySelector('[data-point]') || directory?.querySelector('summary') || input).focus({preventScroll:true});
      }
      return lastIds.slice();
    },
    getSearch: () => input.value,
    getResults: () => lastIds.slice()
  };
  if (input.value) input.oninput?.call(input);
})();

// The authoring compendium is read explicitly into a reviewed source snapshot.
(() => {
  'use strict';
  let payload;
  try { payload=JSON.parse(document.getElementById('suite-indications').textContent); } catch { return; }
  const title=document.getElementById('selected-name');
  const target=document.getElementById('point-traditional');
  if(!title||!target||!payload.points)return;
  const panel=document.createElement('section');panel.className='buyi-source-indications';panel.setAttribute('aria-label','讲义所述');
  target.after(panel);
  const render=()=>{
    const id=title.querySelector('span')?.textContent?.trim();
    const rows=payload.points[id]||[];
    panel.replaceChildren();
    if(!rows.length){panel.hidden=true;return;}
    panel.hidden=false;
    const label=document.createElement('strong');label.textContent='讲义所述 · 待审';panel.append(label);
    const note=document.createElement('p');note.textContent='以下为传统讲义中的记载，文案尚待确认，不代表临床疗效已证实。';panel.append(note);
    for(const row of rows){
      const details=document.createElement('details'),summary=document.createElement('summary'),quote=document.createElement('blockquote'),source=document.createElement('p'),noteLink=document.createElement('a');
      summary.textContent=row.summary;quote.textContent=row.quote;
      source.textContent=`来源 ${row.source_id} · ${row.source_path} · ${row.evidence_id}；来源笔记内容尚未逐页与原版核对。 `;
      noteLink.textContent='打开来源笔记';noteLink.href='obsidian://open?'+new URLSearchParams({vault:'WikiTCM',file:row.source_path});source.append(noteLink);details.append(summary,quote,source);panel.append(details);
    }
  };
  new MutationObserver(render).observe(title,{childList:true,subtree:true,characterData:true});render();
})();
