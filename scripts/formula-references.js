// Presentation adapter: source references are separate from stable card/storage IDs.
(() => {
  const refs=JSON.parse(document.getElementById('suite-reference-data').textContent);
  const reference=c=>refs.base[String(c.id)]||{reference:'',label:'条辨未载',status:'missing',book:c.book};
  const detail=c=>{const r=reference(c);return r.status==='needs_review'?`${r.book} · 条辨待核（原记录 ${r.reference}，关联原文待复核）`:`${r.book} · 条辨 ${r.label}`;};
  icon=c=>{const r=reference(c);return `<span class="formula-icon ${iconMode==='number'?'numeric':''}" data-reference-status="${esc(r.status)}">${iconMode==='number'?esc(r.label):esc(c.title[0])}<small>${esc(r.label)}</small></span>`;};
  const oldRender=renderLibrary;
  renderLibrary=function(){
    oldRender();
    for(const button of document.querySelectorAll('#catalog [data-card]')){
      const c=byId.get(Number(button.dataset.card));
      button.setAttribute('aria-label',c.title+'，'+detail(c));button.title=c.title+' · '+detail(c);
      const small=button.querySelector('.result-info>small');if(small)small.textContent=c.pinyinSpaced+' · '+detail(c);
    }
    $('#icon-toggle').setAttribute('aria-label',iconMode==='name'?'当前方字图标，切换为条辨编号':'当前条辨编号，切换为方字');
  };
  const oldOpen=openCard;
  openCard=function(...args){
    oldOpen(...args);if(!current)return;
    const r=reference(current);$('#reader-counter').textContent=r.status==='recorded'?'条辨 '+r.label:r.label;
    $('#reader-source').textContent=detail(current);
    for(const [i,block] of [...document.querySelectorAll('.back-block')].entries()){
      const variant=refs.variants.find(v=>v.card_id===current.id&&v.title===current.back[i]?.title);
      if(!variant)continue;
      let tag=block.querySelector('h3 .ref');if(!tag){tag=document.createElement('span');tag.className='ref';block.querySelector('h3').append(tag);}
      tag.textContent=variant.display_reference?'条辨 '+variant.recommended_label:'条辨未载（加味，无独立出处）';
    }
    scheduleFit();
  };
  const oldSearch=searchCards;
  searchCards=function(text,subset=cards){
    // An explicit #number still opens the historical card index. Clause queries
    // may have several results; a clause is never used as the unique identity.
    if(/^\s*[#＃]\d+\s*$/.test(text))return oldSearch(text,subset);
    const cleaned=String(text).trim().replace(/^(伤寒论|金匮要略)\s*/,'').replace(/^条辨?\s*/,'');
    const book=String(text).match(/^(伤寒论|金匮要略)/)?.[1];
    const matches=subset.flatMap(c=>{
      const r=reference(c);if(book&&r.book!==book)return [];
      if(cleaned===r.reference)return [{card:c,result:{rank:160,match:null}}];
      const v=refs.variants.find(v=>v.card_id===c.id&&v.display_reference&&v.display_reference===cleaned);
      return v?[{card:c,result:{rank:155,match:{name:v.title,target:v.title,kind:'variant'}}}]:[];
    });
    const found=new Set(matches.map(x=>x.card.id));return [...matches,...oldSearch(text,subset).filter(x=>!found.has(x.card.id))];
  };
  const oldSay=say;say=text=>oldSay(text==='方名首字＋卡号'?'方名首字＋条辨':text==='卡号图标'?'条辨编号图标':text);
  const search=$('#search');search.placeholder='方名 / 拼音 / 条辨';search.setAttribute('aria-label','搜索方名、拼音或条辨；#卡号兼容旧编号');
  const example=document.querySelector('[data-example="#119"]');example.dataset.example='03-02';example.textContent='03-02';
  const ideas=document.querySelector('.icon-ideas');ideas.innerHTML='<div><span class="idea-icon">百<small>03-02</small></span><strong>方字＋条辨</strong><p>沿用现有来源所记编号；条辨待核时不以旧卡号代替。</p></div><div><span class="idea-icon number-idea">03-02</span><strong>条辨编号</strong><p>同一条可有多个方，阅读页同时显示书名。条辨未载时明确标注。</p></div>';
  const examples=document.querySelector('.search-examples');examples.nextElementSibling.textContent='支持方名、拼音、首字母、条辨及卡片正文。旧卡号仍可用 #119 这样的形式查询，收藏和旧链接保持有效。变方检索会标出对应背面。';
  renderLibrary();if(current)openCard(current.id,'',false);
  window.TCMReferences={coverage:refs.coverage,reference,detail};
})();
