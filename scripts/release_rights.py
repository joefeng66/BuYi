"""Pinned third-party asset identities and preservation of their license notices."""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.parse import unquote

MODEL_SHA = 'ce24f106ab786529753978c457f725bd7ce664db42d6a7290a0d89ce9373ec2a'
FONT_SHA = '6d2546bb189c732a8ca29af9e22457b152387d158aa459e4ac2ce1e51788b7fb'
ATLAS_SCRIPT_SHA = '09f7f06656fcc74bb3dd7787520c10fd9e6f977562e992b69365fd676611c7af'




def assignment(text, marker):
    start = text.index(marker) + len(marker)
    value, count = json.JSONDecoder().raw_decode(text[start:].lstrip())
    start += len(text[start:]) - len(text[start:].lstrip())
    return value, start, start + count




def licensed_assets(root):
    """Verify the exact embedded assets and preserve their existing licenses."""
    atlas = (root / 'originals/meridians.html').read_text()
    assets, _, _ = assignment(atlas, 'window.__PILOT_ASSETS__=')
    glb = base64.b64decode(assets['glb'], validate=True)
    if hashlib.sha256(glb).hexdigest() != MODEL_SHA:
        raise ValueError('Model changed; review the asset provenance before release')
    size = int.from_bytes(glb[12:16], 'little')
    metadata = json.loads(glb[20:20 + size])['asset']
    if metadata.get('copyright') != 'MakeHuman core basemesh, CC0 1.0':
        raise ValueError('Model copyright metadata changed')
    script = re.search(r'<script[^>]*>(.*?)</script>', atlas, re.S)[1]
    if hashlib.sha256(script.encode()).hexdigest() != ATLAS_SCRIPT_SHA:
        raise ValueError('Bundled Three.js/application script changed; review license correspondence')
    if 'SPDX-License-Identifier: MIT' not in script:
        raise ValueError('Three.js license header missing')
    wuxing = (root / 'originals/wuxing.html').read_text()
    font = base64.b64decode(re.search(r'data:font/[^;]+;base64,([A-Za-z0-9+/=]+)', wuxing)[1], validate=True)
    if hashlib.sha256(font).hexdigest() != FONT_SHA:
        raise ValueError('Font changed; review its copyright and OFL before release')
    names = {}
    for i in range(struct.unpack('>H', font[4:6])[0]):
        tag, _, off, _ = struct.unpack('>4sIII', font[12 + 16*i:28 + 16*i])
        if tag != b'name':
            continue
        _, count, strings = struct.unpack('>HHH', font[off:off + 6])
        for j in range(count):
            platform, _, _, key, length, pos = struct.unpack('>6H', font[off + 6 + j*12:off + 18 + j*12])
            raw = font[off + strings + pos:off + strings + pos + length]
            names[key] = raw.decode('utf-16-be' if platform in (0, 3) else 'latin1')
    if names.get(1) != 'Ma Shan Zheng' or 'SIL Open Font License' not in names.get(13, ''):
        raise ValueError('Embedded font identity/license mismatch')
    return [
        {'id': 'makehuman-core', 'license': 'CC0-1.0', 'sha256': MODEL_SHA,
         'evidence': 'GLB copyright metadata identifies the MakeHuman core basemesh; exact bytes pinned.',
         'source': 'https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md'},
        {'id': 'three-js-bundle', 'license': 'MIT', 'input_script_sha256': ATLAS_SCRIPT_SHA,
         'evidence': 'Existing bundle has Three.js copyright/SPDX and full MIT notice; exact input script pinned.',
         'source': 'https://github.com/mrdoob/three.js/blob/dev/LICENSE'},
        {'id': 'ma-shan-zheng', 'license': 'OFL-1.1', 'sha256': FONT_SHA,
         'version': names.get(5), 'evidence': 'Internal TTF name, copyright and OFL metadata match the preserved notice.',
         'source': 'https://github.com/google/fonts/blob/main/ofl/mashanzheng/OFL.txt'},
        {'id': 'opencc-js', 'license': 'MIT AND Apache-2.0',
         'sha256': json.loads((root / 'vendor/opencc-js/provenance.json').read_text())['sha256'],
         'source': 'https://github.com/nk2028/opencc-js',
         'evidence': 'Existing pinned vendored dependency and complete license files.'}
    ]








def preserve_notices(root, dest):
    atlas = (root / 'originals/meridians.html').read_text()
    cc0 = next((unquote(match[1]) for match in re.finditer(r'href="data:text/plain;charset=utf-8,([^"]+)"', atlas)
                if 'Creative%20Commons%20CC0' in match[1]), None)
    mit = re.search(r'<!--\s*(The MIT License\s+Copyright.*?)(?:\s*-->)', atlas, re.S)
    font = (root / 'originals/wuxing.html').read_text()
    ofl = re.search(r'<!--\s*Font license\s*(Copyright 2018 The Ma Shan Zheng Project Authors.*?)\s*-->', font, re.S)
    if not cc0 or not mit or not ofl:
        raise ValueError('An embedded third-party license notice is missing')
    for directory, text in [('makehuman', cc0), ('three-js', mit[1]), ('ma-shan-zheng', ofl[1])]:
        target = dest / 'third-party' / directory / 'LICENSE'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text.strip() + '\n')


