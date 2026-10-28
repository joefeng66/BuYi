// Variant summaries are keyed by parent card and immutable variant source ID.
(() => {
  const data=JSON.parse(document.getElementById('suite-variant-indications-data').textContent);
  const refs=JSON.parse(document.getElementById('suite-reference-data').textContent);
  const oldOpen=openCard;
  openCard=function(...args){
    oldOpen(...args);if(!current)return;
    for(const [index,block] of [...document.querySelectorAll('.back-block')].entries()){
      const back=current.back[index];if(!back)continue;
      const matches=refs.variants.filter(v=>v.card_id===current.id&&v.title===back.title);
      if(matches.length!==1)continue;
      const item=data.entries[`${current.id}:${matches[0].formula_source_id}`];
      if(!item||item.title!==back.title)continue;
      const section=document.createElement('section');section.className='variant-indication';
      const heading=document.createElement('h4');heading.textContent='主治';
      const text=document.createElement('p');text.textContent=item.summary;
      section.append(heading,text);block.insertBefore(section,block.children[1]||null);
    }
    scheduleFit();
  };
})();
