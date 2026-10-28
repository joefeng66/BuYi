// Centre each existing label line by its actual ink, without changing source words.
(() => {
  const context=document.createElement('canvas').getContext('2d');
  const spans=[...document.querySelectorAll('#token-labels tspan')];
  const centres=new Map(spans.map(span=>[span,Number(span.getAttribute('y'))]));
  function centreLabels(){
    for(const span of spans){
      const style=getComputedStyle(span);
      context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics=context.measureText(span.textContent);
      const ascent=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
      if(Number.isFinite(ascent)&&Number.isFinite(descent)){
        span.setAttribute('y',String(centres.get(span)+(ascent-descent)/2));
      }
    }
  }
  document.addEventListener('buyi-text-rendered',centreLabels);
  document.fonts.ready.then(centreLabels);
  document.fonts.addEventListener('loadingdone',centreLabels);
})();
