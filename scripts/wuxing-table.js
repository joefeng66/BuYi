// Merge presentation rows only. Run after script-search so its normalized
// filtering finishes before the table is assembled; keep native row listeners.
(() => {
  'use strict';
  const search=document.getElementById('atlas-search');
  if(search&&!document.getElementById('wuxing-search-icon')){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.id='wuxing-search-icon';icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const circle=document.createElementNS(icon.namespaceURI,'circle');circle.setAttribute('cx','10.5');circle.setAttribute('cy','10.5');circle.setAttribute('r','6.5');
    const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','m15.5 15.5 5 5');
    icon.append(circle,path);search.parentElement.append(icon);
  }
  const root=document.getElementById('relation-tables');
  if(!root||!window.WuXing?.categories)return;
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const originalText=node=>node?(window.BuyiText?.originalText(node)??node.textContent):'';
  const watch=()=>observer.observe(root,{childList:true});

  function merge(){
    const sections=[...root.children].filter(node=>node.classList.contains('table-section'));
    if(!sections.length||(sections.length===1&&sections[0].classList.contains('wuxing-unified-table')))return;
    const groups=sections.map(section=>({
      title:originalText(section.querySelector('.table-heading h3')),
      note:originalText(section.querySelector(':scope > .continuation-notice,:scope > .reference-note')),
      columns:[...section.querySelectorAll('thead th')].slice(1,6).map(originalText),
      rows:[...section.querySelectorAll('tbody tr[data-category]')]
    }));
    const rows=groups.flatMap(group=>group.rows);
    if(!rows.length)return;
    const focused=root.contains(document.activeElement)?document.activeElement:null;
    observer.disconnect();
    try{
      const section=el('section','table-section wuxing-unified-table');
      const heading=el('div','table-heading');
      heading.append(el('h3',null,'全部关系'),el('span',null,`${rows.length} 组`));
      section.append(heading);
      const wrap=el('div','table-scroll');
      wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','笔记关系列表，可横向滚动');
      const table=el('table');
      table.append(el('caption','sr-only','笔记关系列表；各行保留所属资料及原列序'));
      const head=el('thead'),headRow=el('tr');
      ['类别','第 1 列','第 2 列','第 3 列','第 4 列','第 5 列','来源详情'].forEach((label,index)=>{
        const cell=el('th',null,label);cell.scope='col';
        if(rows[0].children[index]?.classList.contains('selected-column'))cell.classList.add('selected-column');
        headRow.append(cell);
      });
      head.append(headRow);table.append(head);
      const body=el('tbody');
      for(const group of groups){
        for(const row of group.rows){
          const label=row.querySelector('th');
          label.append(el('small','table-origin',group.title));
          // These labels come from this row's own original table header. In
          // particular, continuation columns must not acquire phase names.
          [...row.children].slice(1,6).forEach((cell,index)=>{cell.dataset.columnLabel=group.columns[index];});
          const source=row.querySelector('.source-cell');
          const scope=el('details','table-column-source');
          scope.append(el('summary',null,'列序'));
          scope.append(el('p',null,group.columns.join(' · ')));
          if(group.note)scope.append(el('p',null,group.note));
          source.append(scope);
          body.append(row);
        }
      }
      table.append(body);wrap.append(table);section.append(wrap);root.replaceChildren(section);
      if(focused?.isConnected)focused.focus({preventScroll:true});
    }finally{watch();}
  }
  // The private renderer replaces root children. Observe only that boundary,
  // not text conversion or row content; disconnect for our own moves.
  const observer=new MutationObserver(merge);
  watch();merge();
  window.TCMWuXingTable={refresh:merge};
})();
