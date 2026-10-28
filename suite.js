'use strict';
(() => {
  const apps = {home:{name:'主页',title:'布医'},formulas:{name:'经方方库',title:'经方'},meridians:{name:'经络观察',title:'经络'},wuxing:{name:'五行关系',title:'五行'},about:{name:'关于布医',title:'关于'}};
  const modules = ['wuxing','formulas','meridians'];
  const sessionKey = 'buyi-suite-session-v1';
  const navigation = '[data-app],[data-menu-app],[data-about-app],[data-home-app]';
  const $ = id => document.getElementById(id);
  const formulaQuery=$('formula-query'),meridianQuery=$('meridian-query');
  const moduleName = link => link.dataset.app||link.dataset.menuApp||link.dataset.aboutApp||link.dataset.homeApp;
  const isObject = value => value && typeof value==='object' && !Array.isArray(value);
  const validChild = hash => hash==='' || /^#card\/[1-9]\d{0,5}$/.test(hash);
  const finite = value => typeof value==='number' && Number.isFinite(value);
  function validState(name,state){
    if(!isObject(state))return false;
    const scalar=(key,test)=>!(key in state)||test(state[key]);
    if(!scalar('scroll',v=>finite(v)&&v>=0))return false;
    if(name==='formulas')return scalar('hash',v=>typeof v==='string'&&validChild(v))
      && scalar('query',v=>typeof v==='string'&&v.length<=8192)
      && scalar('filter',v=>['all','favorites','recent'].includes(v))
      && scalar('comfort',v=>typeof v==='boolean');
    return scalar('inputs',v=>Array.isArray(v)&&v.length<=100&&v.every(item=>isObject(item)
      &&typeof item.id==='string'&&item.id.length<=200&&(item.label===null||typeof item.label==='string')
      &&typeof item.value==='string'&&item.value.length<=8192&&(!('checked' in item)||typeof item.checked==='boolean')))
      &&scalar('details',v=>Array.isArray(v)&&v.length<=100&&v.every(id=>typeof id==='string'&&id.length<=200))
      &&scalar('rotation',finite)
      &&scalar('wuxingView',v=>['disc','layers'].includes(v))
      &&['point','sideText','sideMode','tab'].every(key=>scalar(key,v=>typeof v==='string'&&v.length<=200));
  }
  let states={}, lastView=null, active='', frame=null, frameReady=false, generation=0, timer;
  try {
    const raw=sessionStorage.getItem(sessionKey);
    const saved=raw&&raw.length<=64000?JSON.parse(raw):null;
    if(saved?.version===1 && isObject(saved.states) && isObject(saved.lastView)){
      const v=saved.lastView;
      if(modules.includes(v.name) && validState(v.name,saved.states[v.name]) && modules.every(name=>!(name in saved.states)||validState(name,saved.states[name])) && typeof v.hash==='string' && (v.name==='formulas'?validChild(v.hash):v.hash==='') && typeof v.label==='string' && v.label.length>0 && v.label.length<=120){
        lastView={name:v.name,hash:v.hash,label:v.label};
        for(const name of modules)if(isObject(saved.states[name]))states[name]=saved.states[name];
      }
    }
  } catch (_) { /* A blocked or invalid store must never prevent local navigation. */ }
  function persist(){
    if(!lastView)return;
    try{sessionStorage.setItem(sessionKey,JSON.stringify({version:1,states,lastView}));}catch(_){}
  }
  const route = () => {
    const [name,...rest]=location.hash.slice(1).split('/');
    return {name:apps[name]?name:'home',child:name==='formulas'&&rest.length?'#'+rest.join('/'):''};
  };
  function remember(){
    if(!frameReady || !frame || !modules.includes(active))return;
    try{
      const state=frame.contentWindow.TCMSuite.capture();
      if(!isObject(state))return;
      states[active]=state;
      let hash='',label=apps[active].name;
      if(active==='formulas'){
        if(document.activeElement!==formulaQuery&&!pendingSearch)formulaQuery.value=state.query||'';
        const match=typeof state.hash==='string'&&state.hash.match(/^#card\/(\d+)$/);
        const card=match&&frame.contentWindow.CardLibrary?.data.cards.find(c=>c.id===Number(match[1]));
        if(card){hash='#card/'+card.id;label='经方 · '+card.title;}
      }
      if(active==='meridians'&&document.activeElement!==meridianQuery&&!pendingSearch)meridianQuery.value=frame.contentWindow.TCMSuite.getSearch();
      lastView={name:active,hash,label};persist();
    }catch(_){}
  }
  function save(){
    remember();
    if(frame)try{frame.contentWindow.dispatchEvent(new Event('pagehide'));}catch(_){}
  }
  function open(force=false){
    if(!apps[location.hash.slice(1).split('/')[0]])history.replaceState(null,'','#home');
    const target=route();
    if(pendingSearch && pendingSearch.name!==target.name)pendingSearch=null;
    if(!force && active===target.name && frame){
      try{frame.contentWindow.TCMSuite?.route(target.child);applyPendingSearch();remember();}catch(_){}
      return;
    }
    save();active=target.name;frameReady=false;const token=++generation;
    clearTimeout(timer);$('load-error').hidden=true;
    const isModule=modules.includes(active);
    $('load-status').hidden=!isModule;$('load-status').textContent='正在打开'+apps[active].name+'…';
    $('page-title').textContent=apps[active].title;
    $('page-title').hidden=['home','formulas','meridians'].includes(active);
    $('formula-search').hidden=active!=='formulas';
    $('meridian-search').hidden=active!=='meridians';
    $('module-help-open').hidden=!['meridians','wuxing'].includes(active);
    $('module-help-open').setAttribute('aria-label',apps[active].title+'使用说明');
    $('module-help-open').title=apps[active].title+'使用说明';
    $('formula-help-open').hidden=active!=='formulas';
    $('search-open').hidden=modules.includes(active);
    if(active==='formulas')formulaQuery.value=pendingSearch?.name==='formulas'?pendingSearch.query:states.formulas?.query||'';
    if(active==='meridians')meridianQuery.value=pendingSearch?.name==='meridians'?pendingSearch.query:states.meridians?.inputs?.find(x=>x.id==='point-search')?.value||'';
    document.querySelector('.identity').hidden=active!=='home';
    document.title=active==='home'?'布医 · 中医资料室':apps[active].name+' · 布医';
    document.querySelectorAll(navigation).forEach(a=>{if(moduleName(a)===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.body.classList.toggle('home-route',active==='home');
    document.body.classList.toggle('formulas-route',active==='formulas');
    document.body.classList.toggle('meridians-route',active==='meridians');
    document.body.classList.toggle('wuxing-route',active==='wuxing');
    $('home-view').hidden=active!=='home';$('about-view').hidden=active!=='about';$('frame-host').hidden=!isModule;
    if(!isModule){
      frame=null;$('frame-host').replaceChildren();
      $(active+'-view').focus({preventScroll:true});return;
    }
    const src='apps/'+active+'.html';$('fallback').href=src;
    frame=document.createElement('iframe');frame.title=apps[active].name;frame.id='app-frame';
    frame.setAttribute('allow','fullscreen');frame.referrerPolicy='no-referrer';
    frame.addEventListener('load',()=>{
      if(token!==generation)return;
      clearTimeout(timer);
      try{
        if(!frame.contentWindow.TCMSuite)throw new Error('App did not initialize');
        frame.contentWindow.TCMSuite.restore(states[active]||{},target.child);
        frameReady=true;$('load-status').hidden=true;applyPendingSearch();remember();
      }catch(_){$('load-status').hidden=true;$('load-error').hidden=false;}
    });
    frame.src=src+target.child;$('frame-host').replaceChildren(frame);
    timer=setTimeout(()=>{if(token===generation){$('load-status').hidden=true;$('load-error').hidden=false;}},30000);
  }
  function navigate(name,child){
    if(!apps[name])return;
    if($('module-menu').open)$('module-menu').close();
    if(name===active && child===undefined)return;
    const remembered=child===undefined&&name==='formulas'?states.formulas?.hash:child;
    const hash=name==='formulas'&&typeof remembered==='string'&&validChild(remembered)?remembered:'';
    const target='#'+name+(hash?'/'+hash.slice(1):'');
    if(location.hash!==target)history.pushState(null,'',target);
    if(pendingSearch && pendingSearch.name!==name)pendingSearch=null;
    open();
  }
  document.querySelectorAll(navigation).forEach(a=>a.addEventListener('click',e=>{e.preventDefault();navigate(moduleName(a));}));
  window.addEventListener('popstate',()=>open());window.addEventListener('hashchange',()=>open());
  window.addEventListener('message',e=>{
    if(!frame || e.source!==frame.contentWindow)return;
    if(e.origin!==location.origin && !(location.protocol==='file:'&&e.origin==='null'))return;
    if(e.data?.type==='tcm-search'){openSearch();return;}
    if((active==='formulas'&&e.data?.type==='tcm-query')||(active==='meridians'&&e.data?.type==='tcm-meridian-query')){remember();return;}
    if(active==='meridians'&&e.data?.type==='tcm-cun-help'){openCun();return;}
    if(active==='formulas'&&e.data?.type==='tcm-formula-help'){$('formula-help-open').click();return;}
    if(e.data?.type!=='tcm-route')return;
    const child=e.data.hash;
    if(active!=='formulas'||typeof child!=='string'||!validChild(child))return;
    const hash='#'+active+(child?'/'+child.slice(1):'');
    if(location.hash!==hash)history.pushState(null,'',hash);
    remember();
  });
  const menu=$('module-menu'),menuToggle=$('menu-toggle');
  menuToggle.addEventListener('click',()=>{menu.showModal();menuToggle.setAttribute('aria-expanded','true');menu.querySelector('[aria-current="page"]')?.focus();});
  menu.addEventListener('close',()=>{menuToggle.setAttribute('aria-expanded','false');menuToggle.focus();});
  $('menu-close').addEventListener('click',()=>menu.close());
  menu.addEventListener('click',e=>{if(e.target!==menu)return;const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)menu.close();});
  let pendingSearch=null;
  const searchDialog=$('search-dialog'),scope=$('search-scope'),query=$('suite-query');
  const placeholders={formulas:'方名、拼音或条辨',meridians:'穴名、拼音或编号',wuxing:'类别或配属文字'};
  function updateSearchScope(){
    query.placeholder=placeholders[scope.value];
    query.value=frameReady&&active===scope.value?frame.contentWindow.TCMSuite.getSearch():'';
  }
  function openSearch(){
    if(['formulas','meridians'].includes(active)){const field=active==='formulas'?formulaQuery:meridianQuery;field.focus();field.select();return;}
    scope.value=modules.includes(active)?active:modules[0];updateSearchScope();
    searchDialog.showModal();query.focus();query.select();
  }
  function applyPendingSearch(){
    if(!pendingSearch || !frameReady || pendingSearch.name!==active)return;
    frame.contentWindow.TCMSuite.search(pendingSearch.query,{focusResults:pendingSearch.focusResults!==false});pendingSearch=null;
  }
  function searchFormulas(focusResults=false){
    pendingSearch={name:'formulas',query:formulaQuery.value,focusResults};
    navigate('formulas','');applyPendingSearch();remember();
  }
  formulaQuery.addEventListener('input',e=>{if(!e.isComposing)searchFormulas();});
  formulaQuery.addEventListener('compositionend',()=>searchFormulas());
  $('formula-search').addEventListener('submit',e=>{e.preventDefault();searchFormulas(true);});
  function searchMeridians(focusResults=false){
    pendingSearch={name:'meridians',query:meridianQuery.value,focusResults};
    applyPendingSearch();remember();
  }
  meridianQuery.addEventListener('input',e=>{if(!e.isComposing)searchMeridians();});
  meridianQuery.addEventListener('compositionend',()=>searchMeridians());
  $('meridian-search').addEventListener('submit',e=>{e.preventDefault();searchMeridians(true);});
  const moduleHelp=$('module-help-dialog'),cunHelp=$('cun-help-dialog');
  $('module-help-open').addEventListener('click',()=>{
    $('module-help-title').textContent=apps[active].title+'怎么用';
    $('meridian-help-content').hidden=active!=='meridians';
    $('wuxing-help-content').hidden=active!=='wuxing';
    moduleHelp.showModal();
  });
  $('module-help-close').addEventListener('click',()=>moduleHelp.close());
  moduleHelp.addEventListener('close',()=>$('module-help-open').focus());
  function openCun(){cunHelp.showModal();}
  $('cun-help-close').addEventListener('click',()=>cunHelp.close());
  cunHelp.addEventListener('close',()=>{try{frame?.contentDocument.getElementById('buyi-cun-help')?.focus({preventScroll:true});}catch(_){}});
  const helpDialog=$('formula-help-dialog');
  $('formula-help-open').addEventListener('click',()=>helpDialog.showModal());
  $('formula-help-close').addEventListener('click',()=>helpDialog.close());
  helpDialog.addEventListener('close',()=>$('formula-help-open').focus());
  $('search-open').addEventListener('click',openSearch);
  $('search-close').addEventListener('click',()=>searchDialog.close());
  searchDialog.addEventListener('close',()=>$('search-open').focus());
  scope.addEventListener('change',updateSearchScope);
  $('search-form').addEventListener('submit',e=>{
    e.preventDefault();pendingSearch={name:scope.value,query:query.value.trim()};
    searchDialog.close();navigate(scope.value,'');applyPendingSearch();remember();
  });
  $('retry').addEventListener('click',()=>open(true));
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();$('workspace').focus();});
  document.addEventListener('keydown',e=>{if(((e.key==='/'&&!e.target.closest('input,textarea,select,[contenteditable]'))||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'))&&!menu.open&&!searchDialog.open&&!helpDialog.open&&!moduleHelp.open&&!cunHelp.open){e.preventDefault();openSearch();}});
  window.addEventListener('pagehide',save);
  if(!location.hash || !apps[location.hash.slice(1).split('/')[0]])history.replaceState(null,'','#home');
  open();
})();
