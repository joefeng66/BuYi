// A reversible relationship view over the unchanged original wheel controller.
// Source indices, never rotated screen positions, determine the five-element cycle.
(() => {
  'use strict';
  const C=window.WuXing,board=document.getElementById('board');
  if(!C||!board||!window.TCMWheelView)return;
  const NS='http://www.w3.org/2000/svg',TAU=Math.PI*2,RADIUS=270,FLAT=.918;
  const categories=C.categories,tokenGroups=[...board.querySelectorAll('#tokens>g[data-category]')];
  const labelGroups=[...board.querySelectorAll('#token-labels>g')];
  if(tokenGroups.length!==labelGroups.length)return;
  const records=new Map();
  for(let n=0;n<tokenGroups.length;n++){
    const group=tokenGroups[n],id=group.dataset.category;
    const tokens=[...group.querySelectorAll('.token')],labels=[...labelGroups[n].querySelectorAll('text')];
    if(!categories[id]||tokens.length!==5||labels.length!==5)return;
    records.set(id,{group,labelGroup:labelGroups[n],tokens,labels});
  }
  const svg=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const html=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};
  const setText=(node,value)=>{if(window.BuyiText?.originalText(node)!==value&&node.textContent!==value)node.textContent=value;};
  const setAttr=(node,name,value)=>{if(node.getAttribute(name)!==String(value))node.setAttribute(name,String(value));};
  const mod=value=>(value%5+5)%5;
  const sourceCycle=Array.isArray(C.source.phase_order)&&C.source.phase_order.join(',')==='木,火,土,金,水';
  const supported=id=>sourceCycle&&['note','supplement'].includes(categories[id]?.group);
  let order=[...document.querySelectorAll('#layer-list select')].map(select=>select.value);
  if(order.length!==3)order=[...C.create().order];
  let focus=null,pointer=null,blockedClickUntil=0,pendingCategorySlot=null;
  let lastStep=window.TCMRotation.value,tokenScale=1,unit=1;
  const centers=[...board.querySelectorAll('.center-label')];
  const centerOriginals=centers.map(node=>({transform:node.getAttribute('transform'),rect:[...node.querySelector('rect').attributes].map(a=>[a.name,a.value])}));
  const savedLabels=new Map();
  for(const [id,record]of records)for(const [index,token]of record.tokens.entries()){
    const original=window.BuyiText?.originalAttribute(token,'aria-label')||token.getAttribute('aria-label')||'';
    const label=original.replace(/；点击更换这一层的内容/,'')+'；点击查看本层五行关系，盘心可更换内容';
    savedLabels.set(token,label);token.setAttribute('aria-label',label);
    token.removeAttribute('aria-haspopup');token.setAttribute('aria-controls','wuxing-focus-status');
    token.setAttribute('aria-describedby','wuxing-focus-instruction');
  }
  const toolbar=html('div',{id:'wuxing-focus-toolbar'});
  const idleInstruction='点击棋子看关系；盘心换关系；拖动旋转换焦点';
  const focusedInstruction='点击当前棋子返回，点击其他棋子换焦点';
  const instruction=html('p',{id:'wuxing-focus-instruction'},idleInstruction);
  const exitButton=html('button',{id:'wuxing-focus-exit',type:'button'},'返回三层');exitButton.hidden=true;
  instruction.setAttribute('role','presentation');document.querySelector('.page-nav').append(instruction);toolbar.append(exitButton);
  const status=html('p',{id:'wuxing-focus-status',role:'status','aria-live':'polite'});status.hidden=true;
  // Reserve both control rows in every mode: text and the return button may
  // change, but the SVG viewport must never move or rescale with them.
  const controls=html('div',{id:'wuxing-focus-controls'});
  controls.append(toolbar,status);document.querySelector('.board-wrap').before(controls);
  // Keep the original step controls and their native listeners. Only their
  // visible labels change; the SVGs are decorative beside accessible names.
  for(const [id,label,mirror]of [['ccw','逆时针旋转一格',true],['cw','顺时针旋转一格',false]]){
    const button=document.getElementById(id);
    const icon=svg('svg',{viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false'});
    // Conventional rotate-left icon, mirrored for rotate-right; arrowheads show direction.
    const shape=svg('g');
    shape.append(svg('path',{d:'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'}),svg('path',{d:'M3 3v5h5'}));
    if(!mirror)shape.setAttribute('transform','translate(24 0) scale(-1 1)');
    icon.append(shape);button.replaceChildren(icon);button.setAttribute('aria-label',label);button.setAttribute('title',label);
  }
  const edgeGroup=svg('g',{id:'wuxing-focus-edges','aria-hidden':'true','pointer-events':'none'});
  const labelGroup=svg('g',{id:'wuxing-focus-labels','aria-hidden':'true','pointer-events':'none'});
  const dragRing=svg('ellipse',{id:'wuxing-focus-drag-ring',cx:420,cy:406,rx:RADIUS,ry:RADIUS*FLAT});
  board.insertBefore(dragRing,document.getElementById('tokens'));
  board.insertBefore(edgeGroup,document.getElementById('tokens'));
  board.insertBefore(labelGroup,document.getElementById('center-labels'));
  // Both views share a pointed head. Put its tip beyond the shaft endpoint,
  // so a thick butt cap cannot flatten the visible point (the reported defect).
  const arrowAttributes={viewBox:'0 0 14 10',refX:10,refY:5,markerWidth:5.5,markerHeight:4,orient:'auto',markerUnits:'strokeWidth'};
  const arrowShape='M 1 1 L 13 5 L 1 9 L 4 5 Z';
  const originalMarker=document.getElementById('clockwise-arrow');
  for(const [name,value]of Object.entries(arrowAttributes))setAttr(originalMarker,name,value);
  setAttr(originalMarker.querySelector('path'),'d',arrowShape);
  const marker=svg('marker',{id:'wuxing-focus-arrow',...arrowAttributes});
  marker.append(svg('path',{d:arrowShape}));board.querySelector('defs').append(marker);
  let edgeRecords=[];
  function edgesFor(index){return [
    {relation:'mother',label:'母',fromIndex:mod(index-1),toIndex:index,kind:'arc'},
    {relation:'child',label:'子',fromIndex:index,toIndex:mod(index+1),kind:'arc'},
    {relation:'control',label:'相克',fromIndex:index,toIndex:mod(index+2),kind:'chord'},
    {relation:'control',label:'相克',fromIndex:mod(index+3),toIndex:index,kind:'chord'}
  ];}
  function configureEdges(){
    edgeGroup.replaceChildren();labelGroup.replaceChildren();edgeRecords=[];
    if(!focus?.supported)return;
    const focal=edgesFor(focus.index),key=edge=>`${edge.fromIndex}:${edge.toIndex}:${edge.kind}`;
    const focalKeys=new Set(focal.map(key));
    const all=Array.from({length:5},(_,i)=>[
      {relation:'generating',fromIndex:i,toIndex:mod(i+1),kind:'arc'},
      {relation:'control',fromIndex:i,toIndex:mod(i+2),kind:'chord'}
    ]).flat();
    // Draw six remaining edges first so focal arrows and labels stay prominent.
    for(const edge of all.filter(edge=>!focalKeys.has(key(edge)))){
      const path=svg('path',{'class':'secondary-relation','data-relation':edge.relation,'data-from-index':edge.fromIndex,'data-to-index':edge.toIndex,'data-kind':edge.kind,'marker-end':'url(#wuxing-focus-arrow)'});
      edgeGroup.append(path);edgeRecords.push({...edge,path,secondary:true});
    }
    for(const edge of focal){
      const path=svg('path',{'data-relation':edge.relation,'data-from-index':edge.fromIndex,'data-to-index':edge.toIndex,'data-kind':edge.kind,'marker-end':'url(#wuxing-focus-arrow)'});
      const group=svg('g',{'data-relation':edge.relation});
      const plate=svg('rect',{rx:6}),text=svg('text',{'text-anchor':'middle','dominant-baseline':'central'});text.textContent=edge.label;
      group.append(plate,text);edgeGroup.append(path);labelGroup.append(group);edgeRecords.push({...edge,path,group,plate,text});
    }
  }
  const angle=(index,step)=>((index+step)*TAU/5)-Math.PI/2;
  const point=(a,r=RADIUS)=>({x:420+Math.cos(a)*r,y:406+Math.sin(a)*r*FLAT});
  const location=(index,step)=>point(angle(index,step));
  function clippedLine(from,to){
    const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
    const inset=1/Math.sqrt((ux/(37*tokenScale))**2+(uy/(34.5*tokenScale))**2)+10;
    return `M ${from.x+ux*inset} ${from.y+uy*inset} L ${to.x-ux*inset} ${to.y-uy*inset}`;
  }
  function dimensions(){
    const matrix=board.getScreenCTM();unit=matrix?Math.hypot(matrix.a,matrix.b):board.getBoundingClientRect().width/840;
    unit=Math.max(.1,unit||1);tokenScale=Math.max(1.15,44/(69*unit));
  }
  function paintEdges(step){
    const halfHeight=15/unit,fontSize=18/unit;
    for(const edge of edgeRecords){
      const from=location(edge.fromIndex,step),to=location(edge.toIndex,step);let labelPoint;
      if(edge.kind==='arc'){
        const start=angle(edge.fromIndex,step),trim=Math.asin(Math.min(.45,(40*tokenScale+6)/RADIUS));
        const a=point(start+trim),b=point(start+TAU/5-trim);
        edge.path.setAttribute('d',`M ${a.x} ${a.y} A ${RADIUS} ${RADIUS*FLAT} 0 0 1 ${b.x} ${b.y}`);
        labelPoint=point(start+TAU/10,311);
      }else{
        edge.path.setAttribute('d',clippedLine(from,to));
        // Both labels sit nearer the opposite node, clear of the center selector.
        const selected=location(focus.index,step),other=location(edge.fromIndex===focus.index?edge.toIndex:edge.fromIndex,step);
        labelPoint={x:selected.x+(other.x-selected.x)*.62,y:selected.y+(other.y-selected.y)*.62};
        const dx=labelPoint.x-420,dy=labelPoint.y-406,d=Math.hypot(dx,dy)||1;
        const offset=23+Math.min(37,15/unit);
        labelPoint.x+=dx/d*offset;labelPoint.y+=dy/d*offset;
      }
      if(edge.secondary)continue;
      const halfWidth=(edge.label.length>1?23:15)/unit;
      edge.group.setAttribute('transform',`translate(${labelPoint.x} ${labelPoint.y})`);
      for(const [key,value]of Object.entries({x:-halfWidth,y:-halfHeight,width:halfWidth*2,height:halfHeight*2,rx:5/unit}))edge.plate.setAttribute(key,String(value));
      edge.text.setAttribute('font-size',String(fontSize));
    }
  }
  function apply(step=window.TCMRotation.value){
    lastStep=step;if(!focus)return;dimensions();
    board.dataset.focusCategory=focus.categoryId;board.dataset.focusIndex=String(focus.index);
    dragRing.dataset.slot=String(focus.slot);
    for(const [id,record]of records){
      const visible=id===focus.categoryId;record.group.style.display=visible?'':'none';record.labelGroup.style.display=visible?'':'none';
      setAttr(record.group,'aria-hidden',!visible);
      record.tokens.forEach((token,index)=>{
        setAttr(token,'tabindex',visible?'0':'-1');setAttr(token,'aria-pressed',visible&&index===focus.index);
        token.classList.toggle('relationship-selected',visible&&index===focus.index);
        if(!visible)return;
        token.classList.toggle('selected',index===focus.index);
        const p=location(index,step),transform=`translate(${p.x} ${p.y}) scale(${tokenScale})`;
        token.setAttribute('transform',transform);record.labels[index].setAttribute('transform',transform);
      });
    }
    centers.forEach((node,slot)=>{
      const visible=slot===focus.slot;node.style.display=visible?'':'none';setAttr(node,'aria-hidden',!visible);setAttr(node,'tabindex',visible?'0':'-1');
      if(!visible)return;
      node.setAttribute('transform','translate(420 406)');const rect=node.querySelector('rect');
      const width=Math.max(50,(categories[focus.categoryId].short.length*14)+24)/unit,height=44/unit;
      for(const [key,value]of Object.entries({x:-width/2,y:-height/2,width,height,rx:10/unit}))rect.setAttribute(key,String(value));
      node.querySelector('.center-name').style.fontSize=`${14/unit}px`;
    });
    paintEdges(step);
  }
  function describe(){
    if(!focus)return;
    const category=categories[focus.categoryId],word=C.display(category.values[focus.index]);
    const provenance=category.group==='supplement'?'旧版补充列序':'笔记首表列序';
    const message=focus.supported?`${category.short} · ${word}。按${provenance}看母、子与克；箭头表示方向。`:`${category.short} · ${word}。续表只保留原列序，五行配属未核实，暂不画关系线。`;
    setText(status,message);
    for(const [id,record]of records)record.tokens.forEach((token,index)=>{
      let label=savedLabels.get(token);
      if(id===focus.categoryId){
        label=label.replace('点击查看本层五行关系',index===focus.index?'点击返回三层':'点击以此项为中心查看关系');
        if(index===focus.index)label+='；当前关系焦点';
        else if(focus.supported){
          const edge=edgesFor(focus.index).find(item=>item.fromIndex===index||item.toIndex===index);
          if(edge)label+='；'+(edge.relation==='mother'?'母，指向当前焦点':edge.relation==='child'?'子，由当前焦点指向':edge.fromIndex===focus.index?'当前焦点克此项':'此项克当前焦点');
        }
      }
      setAttr(token,'aria-label',label);
    });
  }
  function notify(){document.dispatchEvent(new CustomEvent('wuxing-focus-change',{detail:{state:focus?{...focus}:null}}));}
  function enter(categoryId,index){
    const slot=order.indexOf(categoryId);if(slot<0||!records.has(categoryId)||!Number.isInteger(index)||index<0||index>4)return false;
    focus={categoryId,index,slot,supported:supported(categoryId)};
    document.querySelector('.workspace').classList.add('relationship-focus');board.classList.add('relationship-focus');
    exitButton.hidden=false;status.hidden=false;setText(instruction,focusedInstruction);configureEdges();describe();apply();notify();return true;
  }
  function exit({restoreFocus=true}={}){
    if(!focus)return false;
    const previous=focus;focus=null;delete board.dataset.focusCategory;delete board.dataset.focusIndex;
    document.querySelector('.workspace').classList.remove('relationship-focus');board.classList.remove('relationship-focus');
    exitButton.hidden=true;status.hidden=true;setText(instruction,idleInstruction);edgeGroup.replaceChildren();labelGroup.replaceChildren();edgeRecords=[];
    for(const record of records.values())record.tokens.forEach(token=>{token.classList.remove('relationship-selected');token.removeAttribute('aria-pressed');setAttr(token,'aria-label',savedLabels.get(token));});
    centers.forEach((node,slot)=>{
      node.style.display='';node.removeAttribute('aria-hidden');node.setAttribute('tabindex','0');node.setAttribute('transform',centerOriginals[slot].transform);
      const rect=node.querySelector('rect');for(const [key,value]of centerOriginals[slot].rect)rect.setAttribute(key,value);
      node.querySelector('.center-name').style.fontSize=categories[order[slot]].short.length>2?'18px':'22px';
    });
    window.TCMWheelView.repaint();notify();
    if(restoreFocus&&order.includes(previous.categoryId))records.get(previous.categoryId).tokens[previous.index].focus({preventScroll:true});
    return true;
  }
  function nodeFrom(event){return event.target instanceof Element?event.target.closest('.token[data-category][data-index]'):null;}
  function toggleToken(token){
    const categoryId=token.dataset.category,index=Number(token.dataset.index);
    if(focus?.categoryId===categoryId&&focus.index===index){
      exit({restoreFocus:false});token.focus({preventScroll:true});
    }else enter(categoryId,index);
  }
  function activate(event){
    const token=nodeFrom(event);if(!token)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.detail>0&&performance.now()<blockedClickUntil)return;
    toggleToken(token);
  }
  board.addEventListener('click',event=>{
    const center=event.target.closest?.('.center-label');if(center){pendingCategorySlot=Number(center.dataset.centerSlot);return;}
    activate(event);
  },true);
  board.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const center=event.target.closest?.('.center-label');if(center){pendingCategorySlot=Number(center.dataset.centerSlot);return;}
    const token=nodeFrom(event);if(!token)return;event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat)toggleToken(token);
  },true);
  board.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest?.('.center-label'))return;
    blockedClickUntil=0;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  },true);
  window.addEventListener('pointermove',event=>{if(pointer&&pointer.id===event.pointerId&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>4)pointer.moved=true;},true);
  const endPointer=event=>{if(!pointer||pointer.id!==event.pointerId)return;if(pointer.moved||event.type==='pointercancel')blockedClickUntil=performance.now()+600;pointer=null;};
  window.addEventListener('pointerup',endPointer,true);window.addEventListener('pointercancel',endPointer,true);
  exitButton.addEventListener('click',()=>exit());
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!focus||document.querySelector('dialog[open]'))return;
    event.preventDefault();event.stopPropagation();exit();
  });
  document.getElementById('reset').addEventListener('click',()=>exit({restoreFocus:false}),true);
  document.getElementById('layer-list').addEventListener('change',event=>{const row=event.target.closest('.layer-row');if(row)pendingCategorySlot=Number(row.dataset.slot);},true);
  document.addEventListener('wuxing-choose',event=>{pendingCategorySlot=event.detail.slot;},true);
  document.getElementById('category-picker').addEventListener('close',()=>{pendingCategorySlot=null;});
  document.addEventListener('wuxing-render',event=>{
    const next=event.detail.order,changed=order.join(',')!==next.join(',');order=[...next];
    if(focus){
      if(changed){
        const id=pendingCategorySlot===focus.slot?order[focus.slot]:order.includes(focus.categoryId)?focus.categoryId:order[focus.slot];
        focus={categoryId:id,index:focus.index,slot:order.indexOf(id),supported:supported(id)};configureEdges();describe();notify();
      }
      apply();
    }
    if(changed)pendingCategorySlot=null;
    const context=document.getElementById('relation-context');
    if(!C.columnOnly(order))setText(context,'本卡保留三层对读；点圆牌看本层关系，盘心换内容。');
  });
  document.addEventListener('wuxing-paint',event=>apply(event.detail.step));
  const resize=new ResizeObserver(()=>{if(focus)apply(lastStep);});resize.observe(board);
  setText(document.querySelector('.scene-hint'),'拖动旋转，松开吸附到整格 · 点圆牌看关系，盘心换内容');
  if(!C.columnOnly(order))setText(document.getElementById('relation-context'),'本卡保留三层对读；点圆牌看本层关系，盘心换内容。');
  window.TCMWuXingFocus={getState:()=>focus?{...focus}:null,enter,exit,edges:()=>edgeRecords.filter(edge=>!edge.secondary).map(({relation,label,fromIndex,toIndex,kind})=>({relation,label,fromIndex,toIndex,kind})),secondaryEdges:()=>edgeRecords.filter(edge=>edge.secondary).map(({relation,fromIndex,toIndex,kind})=>({relation,fromIndex,toIndex,kind}))};
})();
