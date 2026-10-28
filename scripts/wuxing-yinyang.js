// Separate classification metadata: existing wheel words carry ink, never new labels.
(() => {
  const categories=window.WuXing?.categories;
  if(!categories)return;
  let source=null;
  try{source=JSON.parse(document.getElementById('suite-yinyang-data').textContent);}catch(_){}
  const records=source?.version===1&&source.categories&&typeof source.categories==='object'?source.categories:{};
  const known=value=>value==='yin'||value==='yang';
  const validAssignment=record=>record&&known(record.polarity)&&typeof record.basis==='string'&&record.basis.trim();
  function assignment(id,value){
    const record=records[id];if(!record||!categories[id])return {polarity:'unknown',basis:''};
    const item=record.items&&Object.prototype.hasOwnProperty.call(record.items,value)?record.items[value]:null;
    if(item){if(item.polarity==='unknown')return {polarity:'unknown',basis:typeof item.basis==='string'?item.basis:''};return validAssignment(item)?{polarity:item.polarity,basis:item.basis}:{polarity:'unknown',basis:''};}
    return known(record.default)&&typeof record.basis==='string'&&record.basis.trim()?{polarity:record.default,basis:record.basis}:{polarity:'unknown',basis:''};
  }
  function categoryAssignment(id){const values=categories[id]?.values||[],polarities=[...new Set(values.map(v=>assignment(id,v).polarity))];return polarities.length===1?polarities[0]:'mixed';}
  const namespace='http://www.w3.org/2000/svg';
  const groups=[...document.querySelectorAll('#tokens>g[data-category]')];
  const labelGroups=[...document.querySelectorAll('#token-labels>g')];
  if(groups.length!==labelGroups.length)throw new Error('YinYang wheel label mapping changed');
  let styled=0,unclassified=0;
  groups.forEach((group,position)=>{
    const id=group.dataset.category,values=categories[id]?.values;
    const tokens=[...group.querySelectorAll('.token[data-index]')],labels=[...labelGroups[position].querySelectorAll('text')];
    if(!values||tokens.length!==values.length||labels.length!==values.length)throw new Error('YinYang category label mapping changed: '+id);
    tokens.forEach((token,index)=>{
      if(Number(token.dataset.index)!==index)throw new Error('YinYang token order changed');
      const record=assignment(id,values[index]),label=labels[index];
      label.dataset.yyCategory=id;label.dataset.yyIndex=String(index);
      // The original text group is aria-hidden. Semantics belong to its actual
      // keyboard-operable token, with an SVG title for pointer users.
      label.dataset.yyPolarity=record.polarity;token.dataset.yyPolarity=record.polarity;
      const meaning=record.polarity==='yin'?'阴（黑字）':record.polarity==='yang'?'阳（白字）':'未标注（褐字）';
      // Retain the original action wording if this presentation is initialized again.
      if(!token.dataset.yyBaseLabel)token.dataset.yyBaseLabel=token.getAttribute('aria-label')||'';
      token.setAttribute('aria-label',token.dataset.yyBaseLabel+'；阴阳显示：'+meaning);
      token.querySelector('.yy-tooltip')?.remove();
      const title=document.createElementNS(namespace,'title');title.classList.add('yy-tooltip');
      title.textContent=categories[id].short+' · '+(values[index]||'原文空白')+'：'+meaning+(record.basis?'。'+record.basis:'');
      token.prepend(title);if(known(record.polarity))styled++;else unclassified++;
    });
  });
  window.TCMYinYang={assignment,categoryAssignment,coverage:{categories:Object.keys(categories).length,filled:Object.keys(categories).filter(id=>known(categoryAssignment(id))).length},presentation:{yin:'black',yang:'white-on-warm-brown-chip',unknown:'red-brown-with-cream-outline',styledTokens:styled,unclassifiedTokens:unclassified}};
})();
