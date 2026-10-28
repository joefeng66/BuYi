#!/usr/bin/env python3
"""Build locally from this source tree; sanitize only a new generated directory."""
from __future__ import annotations

import argparse
import hashlib
from html import escape
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from release_rights import licensed_assets, preserve_notices

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.release-private'
NOTICE = '此发布副本未包含私人笔记原文；请在个人知识库中查看。'
RIGHTS_IDS = {'public-source', 'personal-data', 'supplied-content', 'licensed-dependencies'}


def exact(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Upstream layout changed; review sanitization rule: ' + before[:80])
    return text.replace(before, after, 1)


def payload(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def clean_metadata(value):
    """Keep bibliographic IDs/quotes; remove private filesystem provenance."""
    private_keys = {'source_path', 'source_note', 'source_snapshot', 'source_sha256',
                    'card_source', 'formula_source'}
    if isinstance(value, list):
        return [clean_metadata(item) for item in value]
    if isinstance(value, dict):
        return {key: clean_metadata(item) for key, item in value.items()
                if key not in private_keys and not (
                    key in {'source', 'note', 'path'} and isinstance(item, str) and
                    ('.md' in item or 'Raw Files/' in item or item.startswith(('21AI', '11本地'))))}
    if isinstance(value, str):
        return value.replace('阴阳字典.md', '用户分类表')
    return value


def rewrite_json_scripts(html):
    pattern = r'(<script\b[^>]*type="application/json"[^>]*>)(.*?)(</script>)'
    return re.sub(pattern, lambda m: m[1] + payload(clean_metadata(json.loads(m[2]))) + m[3], html, flags=re.S)


def sanitize_wuxing(html):
    marker = 'const data='
    start = html.index(marker) + len(marker)
    data, length = json.JSONDecoder().raw_decode(html[start:])
    data.update(source_file='私人笔记来源已移除', source_sha256='', source_snapshot='', source_text=NOTICE)
    # Do not expose original source line references or notebook fingerprints either.
    data.pop('web_extract', None)
    data.pop('source_note_modified', None)
    html = html[:start] + payload(data) + html[start + length:]
    html = exact(html,
        "  $('#source-description').textContent=`网页摘录 · 来源快照 ${D.date}。已省略两行并保留原行号；原始笔记未修改。黄色标记为本条出处。`;",
        "  $('#source-description').textContent='私人笔记原文未包含在发布副本中。';")
    return rewrite_json_scripts(html)


def remove_lecture_bridge(html):
    line = next((line for line in html.splitlines() if line.startswith('    const fixLinks=()=>')), None)
    if line is None:
        raise ValueError('Missing lecture bridge rule')
    html = exact(html, line, "    // Release: the native source renderer links directly to the bundled lecture.")
    return exact(html, "    fixLinks();new MutationObserver(fixLinks).observe(document.getElementById('point-sources'),{childList:true,subtree:true});", '')


def sanitize_meridians(html):
    marker = 'window.__PILOT_ASSETS__='
    start = html.index(marker) + len(marker)
    assets, length = json.JSONDecoder().raw_decode(html[start:])
    if (len(assets['annotations']['points']), len(assets['annotations']['instances']),
            len(assets['annotations']['meridians']), len(assets['audio'])) != (362, 671, 14, 376):
        raise ValueError('Unexpected embedded atlas inventory')
    assets = clean_metadata(assets)
    html = html[:start] + payload(assets) + html[start + length:]
    html = exact(html, '`./assets/audio/${encodeURIComponent(s)}.m4a`', 'null')
    fallback = r'await fetch\("\./assets/annotations\.json"\)\.then\(i=>\{if\(!i\.ok\)throw Error\("[^"\n]*"\);return i\.json\(\)\}\)'
    html, count = re.subn(fallback, '(()=>{throw Error("Embedded annotations missing")})()', html)
    if count != 1:
        raise ValueError('Annotation fallback layout changed')
    html = exact(html, 'await new Hr().loadAsync("./assets/human.glb")',
                 '(()=>{throw Error("Embedded model missing")})()')
    # Keep the lecture link inside the deployable artifact, never the vault path.
    pdf = r'"%E6%BA%90%E6%96%87%E4%BB%B6%E5%92%8C%E6%9D%90%E6%96%99/%E7%BB%8F%E7%BB%9C%E8%A7%82%E5%AF%9F%E5%AE%A4/"\+encodeURIComponent\("\\u9488\\u7078\\u7BC7\.pdf"\)\+`#page=\$\{parseInt\(s\.ni_pages\)\}`'
    html, count = re.subn(pdf, '"../assets/lecture.pdf"+`#page=${parseInt(s.ni_pages)}`', html)
    if count != 1:
        raise ValueError('Lecture link layout changed')
    html = exact(html,
        "      source.textContent=`来源 ${row.source_id} · ${row.source_path} · ${row.evidence_id}；来源笔记内容尚未逐页与原版核对。 `;",
        "      source.textContent=`来源 ${row.source_id} · ${row.evidence_id}；内容尚未逐页与原版核对。`;" )
    html = exact(html,
        "      noteLink.textContent='打开来源笔记';noteLink.href='obsidian://open?'+new URLSearchParams({vault:'WikiTCM',file:row.source_path});source.append(noteLink);details.append(summary,quote,source);panel.append(details);",
        "      details.append(summary,quote,source);panel.append(details);")
    html = rewrite_json_scripts(html)
    return html




def files_hashes(dest):
    return {p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(dest.rglob('*')) if p.is_file() and p.name != 'release-manifest.json'}


def release(require_approved=False):
    PRIVATE.mkdir(exist_ok=True)
    policy = json.loads((ROOT / 'release-policy.json').read_text())
    rows = policy.get('approvals')
    if (policy.get('version') != 3 or policy.get('base_path') != '/BuYi/' or
            policy.get('content_mode') != 'user-authorized' or
            not isinstance(rows, list) or len(rows) != len(RIGHTS_IDS) or
            any(not isinstance(row, dict) or not isinstance(row.get('id'), str) for row in rows) or
            {row.get('id') for row in rows} != RIGHTS_IDS or
            any(not isinstance(row.get('approved'), bool) or
                not isinstance(row.get('evidence'), str) for row in rows)):
        raise ValueError('Invalid release policy: recorded publication choices are required')
    notice = policy.get('rights_notice', {})
    email = notice.get('contact_email', '')
    if not isinstance(email, str) or not re.fullmatch(r'[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+', email):
        raise ValueError('A valid public rights contact email is required')
    if not isinstance(notice.get('text'), str) or email not in notice['text']:
        raise ValueError('Rights notice must contain the public contact')
    pending = [row['id'] for row in rows
               if not (row['approved'] is True and row['evidence'].strip())]
    if require_approved and pending:
        raise ValueError('Publication choices pending: ' + ', '.join(pending))
    asset_evidence = licensed_assets(ROOT)
    spec = importlib.util.spec_from_file_location('buyi_build', ROOT / 'build.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    dest = Path(tempfile.mkdtemp(prefix='build-', dir=PRIVATE))
    builder.build(dest, include_lecture=True)
    for file in (dest / 'apps').glob('*.html'):
        file.write_text(remove_lecture_bridge(file.read_text()))
    file = dest / 'apps/wuxing.html'
    file.write_text(sanitize_wuxing(file.read_text()))
    file = dest / 'apps/formulas.html'
    file.write_text(rewrite_json_scripts(file.read_text()))
    file = dest / 'apps/meridians.html'
    file.write_text(sanitize_meridians(file.read_text()))
    for file in [dest / 'index.html', dest / 'apps/meridians.html']:
        text = file.read_text()
        text = text.replace('源码开放计划：项目许可与仓库尚未确定；第三方模型、字体和书籍资料遵循各自许可。',
            '项目代码使用 MIT 许可；第三方资料和素材的权利归原权利人所有，并保留各自来源及许可说明。')
        file.write_text(text)
    preserve_notices(ROOT, dest)
    home = dest / 'index.html'
    html = home.read_text()
    anchor = '<h3>使用与保存</h3>'
    notice_html = '<h3>资料权利与免责声明</h3><p id="rights-notice">' + escape(notice['text']).replace(escape(email), '<a href="mailto:' + escape(email, quote=True) + '">' + escape(email) + '</a>') + '</p>\n          '
    html = exact(html, anchor, notice_html + anchor)
    home.write_text(html)
    shutil.copy2(ROOT / 'LICENSE', dest / 'LICENSE')
    license_dir = dest / 'third-party/opencc-js'
    license_dir.mkdir(parents=True)
    for name in ['LICENSE', 'THIRD_PARTY_LICENSES.md', 'LICENSES/Apache-2.0.txt', 'provenance.json']:
        target = license_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'vendor/opencc-js' / name, target)
    (dest / '.nojekyll').write_text('')
    (dest / 'CONTENT-NOTICE.txt').write_text(
        'MIT 仅覆盖项目自有代码；第三方资产各循原许可，个人整理数据经作者同意公开。\n'
        + notice['text'] + '\n完整第三方许可见 third-party/。\n')
    exclusion_report = '发布范围与隐私排除（2026-10-28 更新；替代此前内容排除清单）\n\n'
    for item in policy['included_materials']:
        exclusion_report += '\n'.join([item['id'], '来源：' + item['source'], '纳入范围：' + item['scope'], '状态：按用户最新明确要求纳入。', '原核查记录：' + item['review_note']]) + '\n\n'
    exclusion_report += '仍排除：\n' + '\n'.join(policy['always_excluded']) + '\n\n' + notice['text'] + '\n'
    (dest / 'COPYRIGHT-EXCLUSIONS.txt').write_text(exclusion_report)
    manifest = {'version': 3, 'content_mode': policy['content_mode'], 'base_path': policy['base_path'], 'publishable': not pending,
                'pending_approvals': pending, 'excluded': policy['always_excluded'],
                'rights_notice': notice, 'licensed_assets': asset_evidence,
                'unverified_rights': [row['id'] for row in policy['included_materials']],
                'approvals': [{'id': row['id'], 'approved': row['approved'],
                               'evidence': row['evidence']} for row in rows],
                'files': files_hashes(dest)}
    (dest / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    from verify_release import verify
    report = verify(dest, policy['base_path'], require_approved=require_approved)
    target = ROOT / 'dist'
    if target.exists():
        if target.is_symlink() or not target.is_dir():
            raise ValueError('Refusing to replace a symlink or non-directory dist')
        previous = PRIVATE / ('dist-before-' + dest.name)
        target.rename(previous)  # Preserve the previous generated output; never delete it.
    dest.rename(target)
    (ROOT / 'COPYRIGHT-EXCLUSIONS.txt').write_text(exclusion_report)
    (PRIVATE / 'latest-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'dist': 'dist/', 'publishable': not pending, 'pending_approvals': pending,
                      'verification': report}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-approved', action='store_true', help='require the recorded user publication choices')
    args = parser.parse_args()
    try:
        release(args.require_approved)
    except (ValueError, AssertionError, FileNotFoundError) as exc:
        print('Release failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
