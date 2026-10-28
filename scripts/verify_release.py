"""Read-only checks for the locally built BuYi Pages artifact (stdlib only)."""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit

MANIFEST = "release-manifest.json"
REQUIRED_APPROVAL_IDS = frozenset({"public-source", "personal-data", "supplied-content", "licensed-dependencies"})
ALLOWED_SUFFIXES = {".html", ".css", ".js", ".json", ".txt", ".md", ".svg", ".woff", ".woff2"}
ALLOWED_EXTENSIONLESS = {"LICENSE", "NOTICE", ".nojekyll"}
PRIVATE_KEYS = {"source_path", "source_note", "card_source", "formula_source"}
PRIVATE_DIRECTORIES = {"backups", "originals", "evidence", "__pycache__", "node_modules"}
ORIGIN = "https://release.invalid"


def decoded(value: str) -> str:
    """Expose URL/HTML/JSON-escaped local paths before checking them."""
    for _ in range(5):
        clean = unquote(unescape(re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m[1], 16)), value))).replace(r"\/", "/")
        if clean == value:
            break
        value = clean
    return value


def inspect_text(text: str, label: str) -> None:
    visible = decoded(text)
    if re.search(r"/Users/|/home/|file\s*://|obsidian\s*://|[A-Za-z]:[\\/]+Users[\\/]", visible, re.I):
        raise ValueError(f"{label}: local filesystem or Obsidian URL remains")
    if '源文件和材料/' in visible:
        raise ValueError(f"{label}: local vault lecture dependency remains")
    for match in re.finditer(r'"([^"\\]+)"\s*:\s*"((?:\\.|[^"\\])*)"', text):
        if match[1] in PRIVATE_KEYS:
            value = json.loads('"' + match[2] + '"')
            if value:
                raise ValueError(f"{label}: private metadata key {match[1]} remains")


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str, str]] = []
        self.in_style = False
        self.styles: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "base":
            raise ValueError("HTML base elements are not permitted in a relocatable artifact")
        if tag == "style":
            self.in_style = True
        if values.get("srcdoc"):
            raise ValueError("iframe srcdoc needs explicit release validation")
        for attribute in ("src", "href", "xlink:href", "poster", "data"):
            if values.get(attribute):
                if attribute == "data" and tag != "object":
                    continue
                self.links.append((tag, attribute, values[attribute]))
        if values.get("srcset"):
            # No current artifact uses srcset; reject ambiguity instead of mis-parsing data URIs.
            raise ValueError("srcset needs an explicit release validation rule")
        if values.get("style"):
            self.styles.append(values["style"])
        if tag == "meta" and values.get("http-equiv", "").lower() == "refresh":
            raise ValueError("HTML refresh redirects are not permitted")

    def handle_endtag(self, tag: str) -> None:
        if tag == "style":
            self.in_style = False

    def handle_data(self, value: str) -> None:
        if self.in_style:
            self.styles.append(value)


def css_links(css: str) -> list[str]:
    return [m[2].strip() for m in re.finditer(r"url\(\s*(['\"]?)(.*?)\1\s*\)", css, re.I | re.S)]


def check_link(root: Path, base: str, source: str, value: str, external_anchor: bool = False) -> bool:
    value = decoded(value).strip()
    if not value or value.startswith("#"):
        return False
    parsed = urlsplit(value)
    if parsed.scheme in {"data", "blob"}:
        return False
    if parsed.scheme or parsed.netloc:
        if external_anchor and parsed.scheme in {"http", "https", "mailto"}:
            return False
        raise ValueError(f"{source}: external runtime resource or unsupported link: {value[:140]}")
    resolved = urlsplit(urljoin(ORIGIN + base + source, value))
    target = unquote(resolved.path)
    if not target.startswith(base):
        raise ValueError(f"{source}: link escapes deployment base {base}: {value[:140]}")
    relative = target[len(base):]
    candidate = root / relative
    if target.endswith("/"):
        candidate /= "index.html"
    if not candidate.is_file() or candidate.is_symlink() or not candidate.resolve().is_relative_to(root):
        raise ValueError(f"{source}: missing or unsafe static resource: {value[:140]}")
    return True


def extract_json_assignment(text: str, prefix: str, label: str) -> dict:
    offset = text.find(prefix)
    if offset < 0:
        raise ValueError(f"{label}: missing embedded assignment {prefix}")
    try:
        value, _ = json.JSONDecoder().raw_decode(text[offset + len(prefix):].lstrip())
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label}: malformed embedded JSON") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label}: embedded object expected")
    return value


def inspect_apps(root: Path) -> dict:
    wuxing = (root / "apps/wuxing.html").read_text(encoding="utf-8")
    data = extract_json_assignment(wuxing, "const data=", "wuxing")
    if data.get("source_snapshot") or data.get("source_sha256"):
        raise ValueError("wuxing: private source snapshot/hash remains")
    source_file = data.get("source_file", "")
    if not isinstance(source_file, str) or (source_file and (len(source_file) > 120 or not re.search("私人|隐私|个人|未包含|未打包|已移除", source_file) or "/" in source_file or "\\" in source_file)):
        raise ValueError("wuxing: private source filename remains")
    source_text = data.get("source_text", "")
    if not isinstance(source_text, str) or len(source_text) > 240 or not re.search("私人|隐私|个人|未包含|未打包", source_text):
        raise ValueError("wuxing: private note must be replaced by a short privacy notice")
    meridians = (root / "apps/meridians.html").read_text(encoding="utf-8")
    for fallback in ("./assets/annotations.json", "./assets/human.glb", "/assets/audio/"):
        if fallback in meridians:
            raise ValueError(f"meridians: unresolved local asset fallback: {fallback}")
    assets = extract_json_assignment(meridians, "window.__PILOT_ASSETS__=", "meridians")
    annotations = assets.get("annotations", {})
    if not isinstance(annotations, dict):
        raise ValueError("meridians: embedded annotations object required")
    counts = {"points": 362, "instances": 671, "meridians": 14}
    for key, size in counts.items():
        value = annotations.get(key)
        if not isinstance(value, list) or len(value) != size:
            raise ValueError(f"meridians: embedded {key} must contain {size} records")
    try:
        glb = base64.b64decode(assets["glb"], validate=True)
    except (KeyError, TypeError, ValueError, binascii.Error) as exc:
        raise ValueError("meridians: embedded GLB is absent or malformed") from exc
    if len(glb) < 12 or glb[:4] != b"glTF" or int.from_bytes(glb[4:8], "little") != 2 or int.from_bytes(glb[8:12], "little") != len(glb):
        raise ValueError("meridians: embedded GLB header/length is invalid")
    audio = assets.get("audio")
    if not isinstance(audio, dict):
        raise ValueError("meridians: explicit embedded audio dictionary required")
    for key, clip in audio.items():
        try:
            if not isinstance(clip, dict):
                raise ValueError("audio object required")
            if clip.get("mime") not in {"audio/wav", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/mpeg"}:
                raise ValueError("unsupported MIME")
            if not base64.b64decode(clip["data"], validate=True):
                raise ValueError("empty audio")
        except (KeyError, TypeError, ValueError, binascii.Error) as exc:
            raise ValueError(f"meridians: malformed embedded audio {key}") from exc
    return {**counts, "audio_clips": len(audio), "glb_bytes": len(glb)}


def embedded_json(text: str, identifier: str) -> dict:
    match = re.search(r'<script\b[^>]*id="' + re.escape(identifier) + r'"[^>]*>(.*?)</script>', text, re.S)
    if not match:
        raise ValueError('missing filtered content payload: ' + identifier)
    return json.loads(match[1])




def inspect_publication_notice(root: Path, manifest: dict) -> None:
    notice = manifest.get('rights_notice', {})
    email = notice.get('contact_email', '')
    if not isinstance(email, str) or not re.fullmatch(r'[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+', email):
        raise ValueError('public rights contact email is missing or invalid')
    home = (root / 'index.html').read_text()
    if 'id="rights-notice"' not in home or 'href="mailto:' + email + '"' not in home:
        raise ValueError('public rights notice/contact link is missing')
    plain = unescape(re.sub(r'<[^>]*>', '', home))
    if not isinstance(notice.get('text'), str) or not notice['text'] or notice['text'] not in plain:
        raise ValueError('public rights notice does not match the recorded text')
    for name in ['assets/lecture.pdf', 'COPYRIGHT-EXCLUSIONS.txt', 'third-party/makehuman/LICENSE',
                 'third-party/three-js/LICENSE', 'third-party/ma-shan-zheng/LICENSE']:
        if not (root / name).is_file():
            raise ValueError('missing publication report or preserved license: ' + name)


def verify(root: Path | str, base_path: str = "/BuYi/", require_approved: bool = False) -> dict:
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("artifact root must be an existing real directory")
    root = root.resolve()
    if not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*", base_path):
        raise ValueError("base_path must be a normalized absolute directory URL")
    files: dict[str, str] = {}
    texts: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError(f"{relative}: symlink is forbidden")
        if any(part.lower() in PRIVATE_DIRECTORIES for part in path.relative_to(root).parts):
            raise ValueError(f"{relative}: private/build input directory is forbidden")
        if any(part.startswith(".") for part in path.relative_to(root).parts) and relative != ".nojekyll":
            raise ValueError(f"{relative}: hidden files/directories are forbidden")
        if path.is_dir():
            continue
        is_lecture = relative == 'assets/lecture.pdf'
        if not path.is_file() or (path.suffix.lower() not in ALLOWED_SUFFIXES and path.name not in ALLOWED_EXTENSIONLESS and not is_lecture):
            raise ValueError(f"{relative}: unexpected artifact file type")
        files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        if is_lecture and not path.read_bytes().startswith(b'%PDF-'):
            raise ValueError('bundled lecture PDF has an invalid header')
        if path.suffix.lower() not in {".woff", ".woff2"} and not is_lecture:
            try:
                texts[relative] = path.read_text(encoding="utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError(f"{relative}: invalid UTF-8 release text") from exc
            inspect_text(texts[relative], relative)
    for required in ("index.html", "apps/formulas.html", "apps/meridians.html", "apps/wuxing.html", MANIFEST):
        if required not in files:
            raise ValueError(f"missing required artifact file: {required}")
    try:
        manifest = json.loads(texts[MANIFEST])
    except ValueError as exc:
        raise ValueError("invalid release manifest JSON") from exc
    if not isinstance(manifest, dict):
        raise ValueError("release manifest must be an object")
    if manifest.get("base_path") != base_path:
        raise ValueError("release manifest base_path does not match requested deployment base")
    expected = manifest.get("files")
    actual = {k: v for k, v in files.items() if k != MANIFEST}
    if not isinstance(expected, dict) or expected != actual:
        raise ValueError("release manifest file inventory/hash mismatch")
    if not isinstance(manifest.get("publishable"), bool) or not isinstance(manifest.get("pending_approvals"), list):
        raise ValueError("release manifest must declare publishable and pending_approvals")
    if require_approved:
        if manifest.get('version') != 3 or manifest.get('content_mode') != 'user-authorized':
            raise ValueError('publication is blocked: the current version 3 publication manifest is required')
        if manifest["publishable"] is not True or manifest["pending_approvals"]:
            raise ValueError("publication is blocked: recorded publication choices are pending")
        approvals = manifest.get("approvals")
        if (not isinstance(approvals, list) or len(approvals) != len(REQUIRED_APPROVAL_IDS)
                or not all(isinstance(row, dict) and isinstance(row.get("id"), str) for row in approvals)
                or {row["id"] for row in approvals} != REQUIRED_APPROVAL_IDS):
            raise ValueError("publication is blocked: exactly the required approval IDs must be present")
        for row in approvals:
            evidence = row.get("evidence")
            if row.get("approved") is not True or not isinstance(evidence, str) or not evidence.strip():
                raise ValueError("publication is blocked: every approval needs approved=true and nonempty text evidence")
    link_count = 0
    for relative, text in texts.items():
        styles: list[str] = []
        if relative.endswith((".html", ".svg")):
            parser = Links()
            parser.feed(text)
            for tag, attribute, value in parser.links:
                link_count += check_link(root, base_path, relative, value, external_anchor=tag == "a" and attribute in {"href", "xlink:href"})
            styles = parser.styles
        elif relative.endswith(".css"):
            styles = [text]
        for style in styles:
            if re.search(r"@import\b", style, re.I):
                raise ValueError(f"{relative}: CSS @import requires explicit validation")
            for value in css_links(style):
                link_count += check_link(root, base_path, relative, value)
    counts = inspect_apps(root)
    if manifest.get('content_mode') == 'user-authorized':
        inspect_publication_notice(root, manifest)
    return {"base_path": base_path, "files": len(files), "static_links": link_count,
            "publishable": manifest["publishable"], "pending_approvals": manifest["pending_approvals"],
            "embedded_assets": counts}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default="dist")
    parser.add_argument("--base-path", default="/BuYi/")
    parser.add_argument("--require-approved", action="store_true")
    args = parser.parse_args()
    try:
        result = verify(args.root, args.base_path, args.require_approved)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Release verification failed: {exc}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
