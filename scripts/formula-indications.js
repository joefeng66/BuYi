// Presentation-only adapter over source-linked, reviewed-as-draft excerpts.
(() => {
  const data=JSON.parse(document.getElementById('suite-indications-data').textContent);
  const create=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const oldOpen=openCard;
  openCard=function(...args){
    oldOpen(...args);
    document.getElementById('formula-indication')?.remove();
    if(!current)return;
    const entry=data.entries[String(current.id)];if(!entry)return;
    const section=create('section','indication-section');section.id='formula-indication';
    const heading=create('h3','section-label','主治');section.append(heading);
    section.append(create('p','indication-summary',entry.summary));
    document.getElementById('front-content').prepend(section);scheduleFit();
  };
})();
