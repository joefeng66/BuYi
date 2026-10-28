// Two small views over the existing wheel and category controls. No source edits.
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
  const disc=$('disc'),aside=disc.querySelector('aside'),atlas=$('atlas');
  // Reuse the native reset handler; place the same icon as the meridian viewer on the wheel.
  const reset=$('reset');
  if(reset){
    reset.hidden=false;reset.style.removeProperty('display');reset.classList.add('wheel-reset');
    reset.setAttribute('aria-label','恢复五行圆盘初始状态');reset.title='恢复初始状态';
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M20 7v5h-5 M19.1 11a7.2 7.2 0 1 0-1.6 5.8');
    icon.append(path);reset.replaceChildren(icon);document.querySelector('.board-wrap').append(reset);
  }
  document.querySelector('.brand small').textContent='转一转，点一点';
  document.querySelector('.edition')?.remove();
  const nav=document.querySelector('.page-nav');nav.replaceChildren();nav.setAttribute('role','tablist');nav.setAttribute('aria-label','五行视图');
  const tabs={};for(const[id,label]of[['disc','圆盘'],['layers','完整列表']]){const tab=el('button',{id:'view-'+id,type:'button',role:'tab','aria-controls':id},label);tabs[id]=tab;nav.append(tab);}
  const layers=el('section',{id:'layers',role:'tabpanel','aria-labelledby':'view-layers',tabindex:'-1'});layers.hidden=true;
  disc.setAttribute('role','tabpanel');disc.setAttribute('aria-labelledby','view-disc');disc.after(layers);
  layers.append(aside,atlas);
  const compare=el('details',{id:'wuxing-comparison'}),compareTitle=el('summary',{},'当前对读');compare.append(compareTitle);
  compare.append(aside.querySelector('.relation-card'),aside.querySelector('.top-section'));aside.append(compare);
  aside.querySelector('.section-eyebrow')?.remove();
  // Keep live controller targets in the DOM; only duplicate presentation copy is hidden.
  for(const n of aside.querySelectorAll('.instruction,#layer-help,#relation-context'))n.hidden=true;
  const heading=atlas.querySelector('.reference-heading');heading.replaceChildren(el('h2',{id:'atlas-title'},'笔记列表'));
  atlas.querySelectorAll('[data-filter]').forEach(b=>{b.textContent=({all:'全部',note:'首表',continuation:'续表',supplement:'补充'})[b.dataset.filter];});
  $('narrative')?.remove();
  const provenance=el('details',{id:'wuxing-provenance'});provenance.append(el('summary',{},'资料说明'));
  const sourceLabel=el('p',{},'按学习笔记列序整理，保留原字、空白及未核实的配属。此处用于学习对照。');
  provenance.append(sourceLabel);
  const boardContext=$('board-context');provenance.append(boardContext);
  const referenceNote=atlas.querySelector('.reference-note');if(referenceNote)provenance.append(referenceNote);
  const sourceButton=aside.querySelector('footer .source-open');sourceButton.textContent='笔记原文';heading.append(sourceButton);
  aside.querySelector('footer')?.remove();document.querySelector('.page-footnote')?.remove();
  document.querySelector('.scene-hint').hidden=true;
  layers.after(provenance);
  // Keep every original category and preserve option values/listeners.
  const picker=$('category-picker'), options=$('category-options');
  const count=Object.keys(window.WuXing.categories).length;
  const summary=el('p',{class:'picker-summary'},`${count} 种五行列序`);
  options.before(summary);
  const flatten=()=>{
    const host=$('layer-list'); layerObserver.disconnect();
    for(const select of host.querySelectorAll('select')){
      const selected=select.value, groups=select.querySelectorAll('optgroup');
      if(groups.length){const children=[...select.options]; select.replaceChildren(...children);select.value=selected;}
    }
    layerObserver.observe(host,{childList:true,subtree:true});
  };
  const layerObserver=new MutationObserver(flatten);flatten();
  atlas.querySelectorAll('[data-filter]').forEach(button=>{if(button.dataset.filter!=='all')button.hidden=true;});
  let current='disc';
  function show(view,{scroll=true,focus=false}={}){
    view=['layers','atlas'].includes(view)?'layers':'disc';current=view;
    disc.hidden=view!=='disc';layers.hidden=view!=='layers';
    for(const[id,tab]of Object.entries(tabs)){const active=id===view;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    if(view==='disc')window.TCMWheelView?.repaint();
    if(scroll)scrollTo(0,0);
    if(focus)tabs[view].focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('wuxing-view-change',{detail:{view}}));return view;
  }
  for(const[id,tab]of Object.entries(tabs)){
    tab.addEventListener('click',()=>show(id));
    tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();show(event.key==='Home'?'disc':event.key==='End'?'layers':id==='disc'?'layers':'disc',{focus:true});});
  }
  function legacyHash(){const hash=location.hash.slice(1);if(['disc','atlas','layers'].includes(hash))show(hash);if(hash==='narrative'){show('layers');provenance.open=true;}}
  window.addEventListener('hashchange',legacyHash);
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();show('disc');});
  window.TCMWuXingViews={show,getView:()=>current};show('disc',{scroll:false});legacyHash();
})();
