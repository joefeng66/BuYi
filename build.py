"""Reproducible presentation wrapper. Reads snapshots; never writes WikiTCM sources."""
from pathlib import Path
import hashlib, json, re

ROOT = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()

def build(dest=None, *, include_lecture=True, evidence_dir=None):
    records = json.loads((ROOT/'originals/manifest.json').read_text())
    for record in records:
        if record['file'].endswith('.pdf') and not include_lecture:
            continue
        assert sha((ROOT/'originals'/record['file']).read_bytes()) == record['sha256'], 'Original snapshot changed: '+record['file']
    dest = Path(dest) if dest is not None else ROOT/'dist'
    dest.mkdir(parents=True, exist_ok=True)
    (dest/'apps').mkdir(parents=True,exist_ok=True)
    (dest/'assets').mkdir(exist_ok=True)
    shell=(ROOT/'index.html').read_text()
    formula_source=(ROOT/'originals/formulas.html').read_text()
    formula_match=re.search(r'<script id="card-data" type="application/json">(.*?)</script>',formula_source,re.S)
    assert formula_match, 'Missing formula cards'
    formula_data=json.loads(formula_match.group(1))
    cards=formula_data['cards']
    def usable(value):
        return isinstance(value,str) and bool(value.strip()) and value.strip() not in {'—','未载','待核','不详'}
    coverage=sum(all(usable(c.get(k)) for k in ('dose','method','book','refs')) for c in cards)
    shell=shell.replace('方剂卡片 · 剂量、煎服与来源',f'{coverage} 方 · 剂量、煎服与来源',1)
    assert 'id="formula-coverage"' in shell
    (dest/'index.html').write_text(shell)
    for file in ['suite.css','suite.js']:
        (dest/file).write_bytes((ROOT/file).read_bytes())
    vendor=ROOT/'vendor/opencc-js'
    provenance=json.loads((vendor/'provenance.json').read_text())
    assert sha((vendor/'opencc.js').read_bytes())==provenance['sha256'], 'Conversion dependency changed'
    (dest/'assets/opencc.js').write_bytes((vendor/'opencc.js').read_bytes())
    (dest/'assets/script-display.js').write_bytes((ROOT/'scripts/script-display.js').read_bytes())
    (dest/'assets/theme.js').write_bytes((ROOT/'scripts/theme.js').read_bytes())
    (dest/'assets/theme.css').write_bytes((ROOT/'styles/theme.css').read_bytes())
    bridge = (ROOT/'scripts/bridge.js').read_text()
    checks=[]
    for name in ['formulas','meridians','wuxing']:
        source=(ROOT/'originals'/f'{name}.html').read_text()
        html=source.replace('<html lang="zh-CN">',f'<html lang="zh-CN" data-suite-app="{name}">',1)
        css=(ROOT/'styles'/f'{name}.css').read_text()
        html=html.replace('</head>','<style id="suite-theme">\n'+css+'\n</style>\n</head>',1)
        if name=='wuxing':
            html=html.replace('</head>','<link rel="icon" href="data:,"></head>',1)
            assert '<span class="seal">象</span>' in html
            html=html.replace('<span class="seal">象</span>','<span class="seal">五</span>',1)
            scripts=list(re.finditer(r'<script[^>]*>(.*?)</script>',html,re.S))
            assert 'WuXingMotion' in scripts[2].group(1), 'Unexpected rotation script layout'
            pos=scripts[2].end()
            adapter=(ROOT/'scripts/wuxing-state.js').read_text()
            html=html[:pos]+'<script id="suite-rotation">'+adapter+'</script>'+html[pos:]
        if name=='formulas':
            html=html.replace("script-src 'unsafe-inline'","script-src 'self' 'unsafe-inline'",1)
            refs=json.loads((ROOT/'content/formula-references.json').read_text())
            data=json.loads(re.search(r'<script id="card-data" type="application/json">(.*?)</script>',source,re.S).group(1))
            assert set(refs['base'])=={str(c['id']) for c in data['cards']}
            for card in data['cards']:
                assert refs['base'][str(card['id'])]['reference']==card['refs']
            payload=json.dumps(refs,ensure_ascii=False).replace('<','\\u003c')
            adapter=(ROOT/'scripts/formula-references.js').read_text()
            html=html.replace('</body>','<script id="suite-reference-data" type="application/json">'+payload+'</script><script id="suite-references">'+adapter+'</script></body>',1)
            indications=json.loads((ROOT/'content/formula-indications.json').read_text())
            assert indications['version']==1
            for key,entry in indications['entries'].items():
                card=next(c for c in data['cards'] if str(c['id'])==key)
                assert entry['name']==card['title'] and entry['book']==card['book'] and entry['reference']==card['refs']
                assert entry['source_id']==refs['base'][key]['source_id'] and entry['evidence']
            indication_payload=json.dumps(indications,ensure_ascii=False).replace('<','\\u003c')
            indication_adapter=(ROOT/'scripts/formula-indications.js').read_text()
            html=html.replace('</body>','<script id="suite-indications-data" type="application/json">'+indication_payload+'</script><script id="suite-indications">'+indication_adapter+'</script></body>',1)
            variant_indications=json.loads((ROOT/'content/formula-variant-indications.json').read_text())
            assert variant_indications['version']==1
            variant_refs={(v['card_id'],v['formula_source_id']):v for v in refs['variants']}
            for key,entry in variant_indications['entries'].items():
                identity=(entry['card_id'],entry['formula_source_id'])
                assert key==f"{identity[0]}:{identity[1]}" and identity in variant_refs
                assert entry['title']==variant_refs[identity]['title'] and entry['reference']==variant_refs[identity]['display_reference'] and entry['evidence']
                card=next(c for c in data['cards'] if c['id']==identity[0])
                assert sum(b['title']==entry['title'] for b in card['back'])==1
            variant_payload=json.dumps(variant_indications,ensure_ascii=False).replace('<','\\u003c')
            variant_adapter=(ROOT/'scripts/formula-variant-indications.js').read_text()
            html=html.replace('</body>','<script id="suite-variant-indications-data" type="application/json">'+variant_payload+'</script><script id="suite-variant-indications">'+variant_adapter+'</script></body>',1)
        if name=='wuxing':
            yy=json.loads((ROOT/'content/wuxing-yinyang.json').read_text())
            source_script=re.search(r'<script[^>]*>(.*?)</script>',source,re.S).group(1)
            original_data,_=json.JSONDecoder().raw_decode(source_script.split('const data=',1)[1].lstrip())
            original_categories={row['id']:row for row in original_data['rows']+original_data['supplements']}
            assert yy['version']==1 and set(yy['categories'])==set(original_categories), 'Unknown/missing YinYang category'
            for category_id,record in yy['categories'].items():
                assert record['default'] in ['yin','yang','unknown'], category_id
                assert record['source_name']==original_categories[category_id]['name'], category_id
                assert record['default']=='unknown' or isinstance(record['basis'],str) and record['basis'].strip(), category_id
                assert set(record['items']).issubset(set(original_categories[category_id]['values'])), category_id
                for item in record['items'].values():
                    assert item['polarity'] in ['yin','yang','unknown'], category_id
                    assert item['polarity']=='unknown' or isinstance(item['basis'],str) and item['basis'].strip(), category_id
            yy_css=(ROOT/'styles/wuxing-yinyang.css').read_text()
            html=html.replace('</head>','<style id="suite-yinyang-theme">'+yy_css+'</style></head>',1)
            yy_payload=json.dumps(yy,ensure_ascii=False).replace('<','\\u003c')
            yy_script=(ROOT/'scripts/wuxing-yinyang.js').read_text()
            html=html.replace('</body>','<script id="suite-yinyang-data" type="application/json">'+yy_payload+'</script><script id="suite-yinyang">'+yy_script+'</script></body>',1)
            type_adapter=(ROOT/'scripts/wuxing-type.js').read_text()
            html=html.replace('</body>','<script id="suite-type">'+type_adapter+'</script></body>',1)
            views_css=(ROOT/'styles/wuxing-views.css').read_text()
            html=html.replace('</head>','<style id="suite-views-theme">'+views_css+'</style></head>',1)
            views_adapter=(ROOT/'scripts/wuxing-views.js').read_text()
            html=html.replace('</body>','<script id="suite-views">'+views_adapter+'</script></body>',1)
            focus_css=(ROOT/'styles/wuxing-focus.css').read_text()
            html=html.replace('</head>','<style id="suite-focus-theme">'+focus_css+'</style></head>',1)
            focus_adapter=(ROOT/'scripts/wuxing-focus.js').read_text()
            html=html.replace('</body>','<script id="suite-focus">'+focus_adapter+'</script></body>',1)
        html=html.replace('</body>','<script id="suite-bridge">\n'+bridge+'\n</script>\n</body>',1)
        search_adapter=(ROOT/'scripts/script-search.js').read_text()
        html=html.replace('</body>','<script id="suite-opencc" src="../assets/opencc.js"></script><script id="suite-script-display" src="../assets/script-display.js"></script><script id="suite-script-search">'+search_adapter+'</script></body>',1)
        if name=='meridians':
            guide=re.search(r'(<dialog id="cun-help-dialog".*?</dialog>)',shell,re.S)
            assert guide, 'Missing same-body guide'
            html=html.replace('</body>',guide.group(1)+'</body>',1)
            meridian_css=(ROOT/'styles/meridians-ui.css').read_text()
            html=html.replace('</head>','<style id="suite-meridian-ui-theme">'+meridian_css+'</style></head>',1)
            pronunciation=json.loads((ROOT/'content/meridian-pronunciation-overrides.json').read_text())
            pronunciation_payload=json.dumps(pronunciation,ensure_ascii=False).replace('<','\\u003c')
            meridian_adapter=(ROOT/'scripts/meridians-ui.js').read_text()
            indications=(ROOT/'content/meridian-indications.json').read_text().replace('<','\\u003c')
            html=html.replace('</body>','<script id="suite-indications" type="application/json">'+indications+'</script></body>',1)
            html=html.replace('</body>','<script id="suite-meridian-pronunciation">window.BuyiMeridianPronunciation='+pronunciation_payload+';</script><script id="suite-meridian-ui">'+meridian_adapter+'</script></body>',1)
        if name=='wuxing':
            table_adapter=(ROOT/'scripts/wuxing-table.js').read_text()
            html=html.replace('</body>','<script id="suite-wuxing-table">'+table_adapter+'</script></body>',1)
        if name=='formulas':
            html=html.replace("style-src 'unsafe-inline'","style-src 'self' 'unsafe-inline'",1)
        html=html.replace('</head>','<link rel="stylesheet" href="../assets/theme.css"><script id="suite-theme-controller" src="../assets/theme.js"></script></head>',1)
        (dest/'apps'/f'{name}.html').write_text(html)
        # Existing scripts (including embedded data/assets) must remain byte exact.
        old_scripts=re.findall(r'<script[^>]*>(.*?)</script>',source,re.S)
        new_scripts=[body for attrs,body in re.findall(r'<script([^>]*)>(.*?)</script>',html,re.S) if 'id="suite-' not in attrs]
        assert old_scripts==new_scripts, f'{name}: source scripts/data changed'
        checks.append({'app':name,'original_sha256':sha(source.encode()),'output_sha256':sha(html.encode()),'original_scripts_unchanged':True})
    if include_lecture:
        (dest/'assets/lecture.pdf').write_bytes((ROOT/'originals/针灸篇.pdf').read_bytes())
    if evidence_dir is not None:
        evidence_dir = Path(evidence_dir)
        evidence_dir.mkdir(parents=True, exist_ok=True)
        (evidence_dir/'build.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
    return checks

if __name__=='__main__':
    print(json.dumps(build(evidence_dir=ROOT/'evidence'),ensure_ascii=False,indent=2))
