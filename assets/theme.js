// Local presentation preference only; source data and module identities stay intact.
(() => {
  'use strict';
  const key='buyi-theme-v1',choices=['light','dark'];
  let theme='light';
  try{const saved=localStorage.getItem(key);if(choices.includes(saved))theme=saved;else theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(_){}
  try{if(parent!==window&&choices.includes(parent.BuyiTheme?.theme))theme=parent.BuyiTheme.theme;}catch(_){}
  function controls(){
    const select=document.getElementById('theme-choice');if(select)select.value=theme;
    const button=document.getElementById('theme-toggle');if(!button)return;
    button.textContent=theme==='dark'?'☀':'☾';
    button.setAttribute('aria-label',theme==='dark'?'目前深色主题，切换为浅色':'目前浅色主题，切换为深色');button.title=theme==='dark'?'切换为浅色':'切换为深色';button.setAttribute('aria-pressed',String(theme==='dark'));
  }
  function set(next,{persist=true}={}){
    if(!choices.includes(next))return;
    theme=next;document.documentElement.dataset.theme=theme;
    if(persist)try{localStorage.setItem(key,theme);}catch(_){}
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#211b17':'#f4ebde';
    controls();for(const frame of document.querySelectorAll('iframe'))try{frame.contentWindow.BuyiTheme?.set(theme,{persist:false});}catch(_){}
    document.dispatchEvent(new CustomEvent('buyi-theme-change',{detail:{theme}}));
  }
  window.BuyiTheme={get theme(){return theme;},set};
  set(theme,{persist:false});
  function bind(){controls();document.getElementById('theme-toggle')?.addEventListener('click',()=>set(theme==='dark'?'light':'dark'));document.getElementById('theme-choice')?.addEventListener('change',e=>set(e.target.value));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  window.addEventListener('storage',event=>{if(event.key===key)set(choices.includes(event.newValue)?event.newValue:'light',{persist:false});});
})();
