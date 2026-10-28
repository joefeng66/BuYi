// Presentation-only script choice. Convert from retained source nodes, never round-trip.
(() => {
  'use strict';
  const key='buyi-script-v1', choices=['simplified','traditional'];
  if(!window.OpenCC){
    for(const control of document.querySelectorAll('#script-toggle,#script-choice')){control.disabled=true;control.title='转换词典未加载，请重新载入页面';}
    const status=document.getElementById('script-status');if(status)status.textContent='转换词典未加载，保留原字显示。';
    return;
  }
  const toSimplified=OpenCC.Converter({from:'tw',to:'cn'});
  const toTraditional=OpenCC.Converter({from:'cn',to:'tw'});
  const textSources=new WeakMap(),attributeSources=new WeakMap();
  const attributes=['title','aria-label','placeholder','alt'];
  const excluded='script,style,noscript,textarea,input,code,pre,[data-script-original],#source-lines,.narrative-card blockquote,.relationship-phrases';
  let mode='simplified',pending=false,observer;
  const roots=new Set();
  try{const saved=localStorage.getItem(key);if(choices.includes(saved))mode=saved;}catch(_){}
  try{if(parent!==window&&choices.includes(parent.BuyiText?.mode))mode=parent.BuyiText.mode;}catch(_){}
  const convert=value=>mode==='original'?value:mode==='traditional'?toTraditional(value):toSimplified(value);
  function originalText(element){
    if(!element)return '';
    if(element.nodeType===Node.TEXT_NODE){const saved=textSources.get(element);return saved&&element.nodeValue===saved.last?saved.source:element.nodeValue;}
    return [...element.childNodes].map(originalText).join('');
  }
  function originalAttribute(element,name){const current=element?.getAttribute(name),saved=attributeSources.get(element)?.get(name);return saved&&current===saved.last?saved.source:current;}
  function text(node){
    if(!node.parentElement||node.parentElement.closest(excluded))return false;
    // An option without value uses its text as its identity. Leave that text exact.
    const option=node.parentElement.closest('option');if(option&&!option.hasAttribute('value'))return false;
    const current=node.nodeValue,record=textSources.get(node);
    const source=record&&current===record.last?record.source:current;
    const next=convert(source);textSources.set(node,{source,last:next});
    if(current===next)return false;node.nodeValue=next;return true;
  }
  function element(node){
    if(node.closest('script,style,noscript,[data-script-original],#source-lines'))return false;
    let changed=false,saved=attributeSources.get(node);if(!saved){saved=new Map();attributeSources.set(node,saved);}
    for(const name of attributes){
      const current=node.getAttribute(name);if(current===null){saved.delete(name);continue;}
      const record=saved.get(name),source=record&&current===record.last?record.source:current,next=convert(source);
      saved.set(name,{source,last:next});if(current!==next){node.setAttribute(name,next);changed=true;}
    }
    return changed;
  }
  function walk(root){
    if(root.nodeType===Node.TEXT_NODE)return text(root);
    let changed=false;
    if(root.nodeType===Node.ELEMENT_NODE)changed=element(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    while(walker.nextNode())changed=(walker.currentNode.nodeType===Node.TEXT_NODE?text(walker.currentNode):element(walker.currentNode))||changed;
    return changed;
  }
  const watch=()=>{const root=document.documentElement;if(root)observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});};
  function collect(records){for(const record of records){if(record.type==='childList')record.addedNodes.forEach(n=>roots.add(n));else roots.add(record.target);}}
  function flush(){
    pending=false;
    // An iframe can be removed while a text-conversion microtask is queued.
    if(!document.documentElement){observer.disconnect();roots.clear();return;}
    collect(observer.takeRecords());observer.disconnect();
    let changed=false;for(const root of roots)if(root.isConnected)changed=walk(root)||changed;roots.clear();watch();
    if(changed)document.dispatchEvent(new CustomEvent('buyi-text-rendered',{detail:{mode}}));
  }
  function schedule(records){collect(records);if(!pending){pending=true;queueMicrotask(flush);}}
  function controls(){
    document.documentElement.lang=mode==='traditional'?'zh-Hant':mode==='simplified'?'zh-Hans':'zh';
    const toggle=document.getElementById('script-toggle');
    if(toggle){toggle.textContent={simplified:'简',traditional:'繁',original:'原'}[mode];toggle.setAttribute('aria-label',mode==='traditional'?'目前繁體顯示，切換為簡體':mode==='original'?'目前原字顯示，切换为简体':'目前简体显示，切换为繁体');toggle.title=toggle.getAttribute('aria-label');}
    const select=document.getElementById('script-choice');if(select)select.value=mode;
  }
  function set(next,{persist=true,announce=false}={}){
    if(!choices.includes(next))return;
    mode=next;if(persist)try{localStorage.setItem(key,mode);}catch(_){}
    controls();roots.add(document.documentElement);flush();
    for(const frame of document.querySelectorAll('iframe'))try{frame.contentWindow.BuyiText?.set(mode,{persist:false});}catch(_){}
    if(announce){const status=document.getElementById('script-status');if(status)status.textContent={simplified:'已切换为简体显示',traditional:'已切換為繁體顯示',original:'已恢复原字显示'}[mode];}
    document.dispatchEvent(new CustomEvent('buyi-script-change',{detail:{mode}}));
  }
  window.BuyiText={get mode(){return mode;},set,toSimplified,toTraditional,originalText,originalAttribute};
  observer=new MutationObserver(schedule);watch();
  document.getElementById('script-toggle')?.addEventListener('click',()=>set(mode==='simplified'?'traditional':'simplified',{announce:true}));
  document.getElementById('script-choice')?.addEventListener('change',event=>set(event.target.value,{announce:true}));
  window.addEventListener('storage',event=>{if(event.key===key)set(choices.includes(event.newValue)?event.newValue:'simplified',{persist:false});});
  let fitting=false;
  document.addEventListener('buyi-text-rendered',()=>{
    if(!window.CardLibrary||fitting)return;
    fitting=true;requestAnimationFrame(()=>{fitting=false;window.CardLibrary?.fit();});
  });
  set(mode,{persist:false});
})();
