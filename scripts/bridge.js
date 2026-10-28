/* Small adapter: navigation, search and presentation state. No clinical data mutations. */
(() => {
  const app = document.documentElement.dataset.suiteApp;
  if(parent!==window)document.documentElement.classList.add('suite-embedded');
  const originalText=e=>window.BuyiText?.originalText(e)??e?.textContent;
  const originalAttribute=(e,a)=>window.BuyiText?.originalAttribute(e,a)??e.getAttribute(a);
  const inputState = () => [...document.querySelectorAll('input[id],select[id],select[aria-label]')].map(e=>({id:e.id,label:originalAttribute(e,'aria-label'),value:e.value,checked:e.checked}));
  if (app === 'formulas' && parent !== window) {
    history.pushState = (state, unused, url) => {
      history.replaceState(state,unused,url);
      parent.postMessage({type:'tcm-route',hash:location.hash},location.origin==='null'?'*':location.origin);
    };
  }
  if(app==='formulas'){
    const letters=document.createElement('select');letters.id='compact-letters';letters.setAttribute('aria-label','字母定位');
    const updateLetters=()=>{letters.replaceChildren(new Option('字母定位',''),...[...document.querySelectorAll('#alphabet button')].map(b=>new Option(b.dataset.letter,b.dataset.letter)));letters.disabled=letters.options.length<2;};
    letters.addEventListener('change',()=>{if(letters.value)jumpLetter(letters.value,0);});
    document.querySelector('.catalog-heading').append(letters);updateLetters();
    new MutationObserver(updateLetters).observe(document.getElementById('alphabet'),{childList:true});
  }
  if(app==='formulas'&&parent!==window){
    const nativeSetQuery=setQuery;
    setQuery=function(value){
      const result=nativeSetQuery(value);
      parent.postMessage({type:'tcm-query'},location.origin==='null'?'*':location.origin);
      return result;
    };
    document.addEventListener('click',event=>{
      if(!event.target.closest('.help-open'))return;
      event.preventDefault();event.stopImmediatePropagation();
      parent.postMessage({type:'tcm-formula-help'},location.origin==='null'?'*':location.origin);
    },true);
  }
  const searchInput=()=>document.getElementById({formulas:'search',meridians:'point-search',wuxing:'atlas-search'}[app]);
  window.TCMSuite = {
    getSearch(){return searchInput()?.value||'';},
    search(query,{focusResults=true}={}){
      for(const dialog of document.querySelectorAll("dialog[open]"))dialog.close();
      if(app==='formulas'){
        this.route('');setFilter('all');setQuery(query);
        const catalog=document.getElementById('catalog');catalog.scrollTop=0;
        catalog.setAttribute('tabindex','-1');if(focusResults)catalog.focus({preventScroll:true});
        return;
      }
      if(app==='meridians'&&window.BuyiMeridians){window.BuyiMeridians.search(query,{focusResults});return;}
      if(app==='meridians'){
        const filter=document.getElementById('meridian-filter');filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));
        document.getElementById('point-directory').open=true;
      }
      if(app==='wuxing'){
        window.TCMWuXingViews.show('layers',{scroll:false});
        document.querySelector('[data-filter="all"]').click();
      }
      const input=searchInput();input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}));
      input.scrollIntoView({block:'start'});
      const results=document.getElementById(app==='meridians'?'point-results':'relation-tables');
      results.setAttribute('tabindex','-1');results.focus({preventScroll:true});
    },
    capture() {
      if(app==='formulas')return {hash:location.hash,query:document.getElementById('search').value,filter:document.querySelector('.filter.active')?.dataset.filter,comfort:document.getElementById('reader').classList.contains('comfort'),scroll:document.getElementById('catalog').scrollTop};
      const state={inputs:inputState(),scroll:scrollY,details:[...document.querySelectorAll('details[id]')].filter(e=>e.open).map(e=>e.id)};
      if(app==='wuxing'){state.rotation=window.TCMRotation?.target;state.wuxingView=window.TCMWuXingViews?.getView()||'disc';}
      if(app==='meridians')Object.assign(state,{point:document.querySelector('#selected-name span')?.textContent.trim(),sideText:originalText(document.getElementById('selected-meridian')),sideMode:document.querySelector('[data-side][aria-pressed="true"]')?.dataset.side,tab:document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab});
      return state;
    },
    restore(state,hash) {
      if(app==='formulas'){
        if(state.filter)setFilter(state.filter);
        if(state.query)setQuery(state.query);
        if(state.comfort)CardLibrary.setMode(true);
        // URL owns card selection; module navigation supplies the remembered card.
        this.route(hash || '');
        if(state.scroll)document.getElementById('catalog').scrollTop=state.scroll;
        return;
      }
      if(app==='meridians'&&state.point){
        const filter=document.getElementById('meridian-filter'),search=document.getElementById('point-search');
        filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
        const side=state.sideText?.includes('人体右侧')?'R':state.sideText?.includes('人体左侧')?'L':null;
        if(side)document.querySelector(`[data-side="${side}"]`)?.click();
        [...document.querySelectorAll('#point-results [data-point]')].find(e=>e.dataset.point===state.point)?.click();
        if(state.sideMode)[...document.querySelectorAll('[data-side]')].find(e=>e.dataset.side===state.sideMode)?.click();
      }
      for(const item of state.inputs||[]){const e=item.id?document.getElementById(item.id):[...document.querySelectorAll('select[aria-label]')].find(e=>originalAttribute(e,'aria-label')===item.label);if(!e)continue;if(app==='wuxing'&&e.tagName==='SELECT'&&![...e.options].some(option=>option.value===item.value))continue;e.value=item.value;if('checked' in e)e.checked=item.checked;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
      if(app==='wuxing'){if(Number.isFinite(state.rotation))window.TCMRotation?.reset(state.rotation);window.TCMWuXingViews?.show(state.wuxingView||'disc',{scroll:false});}
      if(app==='meridians'&&state.tab)[...document.querySelectorAll('[data-tab]')].find(e=>e.dataset.tab===state.tab)?.click();
      for(const id of state.details||[]){const e=document.getElementById(id);if(e)e.open=true;}
      if(state.scroll)scrollTo(0,state.scroll);
    },
    route(hash) {
      if(app!=='formulas')return;
      history.replaceState(null,'',location.pathname+location.search+hash);
      handleRoute();
    }
  };
  document.addEventListener('keydown',e=>{if(parent!==window&&((e.key==='/'&&!e.target.closest('input,textarea,select,[contenteditable]'))||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'))){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'tcm-search'},location.origin==='null'?'*':location.origin);}},true);
  if(app==='meridians'){
    const jump=document.createElement('button');jump.className='suite-find';jump.textContent='查穴位 ↓';
    jump.addEventListener('click',()=>{document.getElementById('point-directory').open=true;document.getElementById('point-search').scrollIntoView({block:'start',behavior:'smooth'});document.getElementById('point-search').focus({preventScroll:true});});
    document.querySelector('.masthead').insertBefore(jump,document.getElementById('help-open'));
    const fixLinks=()=>{for(const a of document.querySelectorAll('a[href]')){let href;try{href=decodeURIComponent(a.getAttribute('href'));}catch{continue;}if(href.startsWith('源文件和材料/经络观察室/针灸篇.pdf'))a.href='../assets/lecture.pdf'+(a.hash||'');}};
    fixLinks();new MutationObserver(fixLinks).observe(document.getElementById('point-sources'),{childList:true,subtree:true});
  }
  // Keep informative provenance; tighten external-link privacy without network prefetching.
  for(const a of document.querySelectorAll('a[href^="http"]')){a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}
})();
