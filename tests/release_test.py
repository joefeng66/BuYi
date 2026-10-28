"""Publication-boundary regression tests; no browser or private vault inputs."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/verify_release.py"
spec = importlib.util.spec_from_file_location("verify_release", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="buyi-release-test-")
        self.root = Path(self.temp.name)
        (self.root / "apps").mkdir()
        (self.root / "assets").mkdir()
        (self.root / "index.html").write_text('<html><link rel="stylesheet" href="assets/theme.css"><a href="apps/wuxing.html">五行</a></html>')
        self.notice = {'contact_email': 'rights@example.com', 'text': 'Rights queries: rights@example.com'}
        (self.root / 'index.html').write_text((self.root / 'index.html').read_text() + '<p id="rights-notice">Rights queries: <a href="mailto:rights@example.com">rights@example.com</a></p>')
        (self.root / 'assets/lecture.pdf').write_bytes(b'%PDF-1.7\nTest fixture')
        (self.root / "assets/theme.css").write_text("body{color:#123}")
        self.card = {"id": 1, "title": "测试方", "dose": "Supplied test text", "method": "Supplied test text",
                     "back": [], "backPlain": ""}
        self.formula_payloads = {"card-data": {"cards": [self.card]}, "suite-indications-data": {"entries": {}},
                                 "suite-variant-indications-data": {"entries": {}}}
        (self.root / "apps/formulas.html").write_text(''.join('<script id="' + key + '" type="application/json">' + json.dumps(value) + '</script>' for key, value in self.formula_payloads.items()))
        (self.root / "apps/wuxing.html").write_text('<script>const data=' + json.dumps({"source_file": "私人笔记未包含", "source_snapshot": "", "source_sha256": "", "source_text": "本发布包未包含私人笔记。", "blocks": [], "rows": []}) + ';</script>')
        glb = b"glTF" + (2).to_bytes(4, "little") + (12).to_bytes(4, "little")
        point = {"location": "Supplied test text", "traditional": "Supplied test text", "steps": []}
        assets = {"glb": base64.b64encode(glb).decode(), "annotations": {"points": [point] * 362, "instances": [{}] * 671,
                  "meridians": [{"introduction": {"surface_route": "Supplied test text"}}] * 14,
                  "learning": {"overview_text": "Supplied test text"}}, "audio": {}}
        (self.root / "apps/meridians.html").write_text('<script>window.__PILOT_ASSETS__=' + json.dumps(assets) + ';</script><script id="suite-indications" type="application/json">{"points":{}}</script>')
        (self.root / 'COPYRIGHT-EXCLUSIONS.txt').write_text('Supplied content included; private files excluded.')
        for name in ['makehuman', 'three-js', 'ma-shan-zheng']:
            target = self.root / 'third-party' / name / 'LICENSE'
            target.parent.mkdir(parents=True)
            target.write_text('License fixture')
        self.manifest()

    def tearDown(self):
        self.temp.cleanup()

    def approvals(self):
        return [{"id": key, "approved": True, "evidence": "Recorded publication choice for test."}
                for key in sorted(module.REQUIRED_APPROVAL_IDS)]

    def manifest(self, **overrides):
        files = {path.relative_to(self.root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                 for path in self.root.rglob("*") if path.is_file() and path.name != "release-manifest.json"}
        value = {"version": 3, "content_mode": "user-authorized", "rights_notice": self.notice, "base_path": "/BuYi/", "files": files, "publishable": False, "pending_approvals": ["test-approval"]}
        value.update(overrides)
        (self.root / "release-manifest.json").write_text(json.dumps(value))

    def append(self, relative, value):
        path = self.root / relative
        path.write_text(path.read_text() + value)
        self.manifest()

    def test_review_artifact_checks_without_permission_to_publish(self):
        result = module.verify(self.root)
        self.assertFalse(result["publishable"])
        self.assertEqual(result["static_links"], 2)
        with self.assertRaisesRegex(ValueError, "publication is blocked"):
            module.verify(self.root, require_approved=True)
        self.manifest(publishable=True, pending_approvals=[], approvals=self.approvals())
        self.assertTrue(module.verify(self.root, require_approved=True)["publishable"])

    def test_publishable_flag_does_not_replace_required_approval_records(self):
        for approvals in (None, [], self.approvals()[:2], self.approvals() + [self.approvals()[0]],
                          [self.approvals()[0]] * 3):
            with self.subTest(approvals=approvals):
                self.manifest(publishable=True, pending_approvals=[], approvals=approvals)
                with self.assertRaisesRegex(ValueError, "required approval IDs"):
                    module.verify(self.root, require_approved=True)

    def test_approval_evidence_must_be_nonempty_text_and_explicitly_approved(self):
        for evidence in (None, {}, [], True, 12, "", " \n\t"):
            with self.subTest(evidence=evidence):
                approvals = self.approvals()
                approvals[0]["evidence"] = evidence
                self.manifest(publishable=True, pending_approvals=[], approvals=approvals)
                with self.assertRaisesRegex(ValueError, "nonempty text evidence"):
                    module.verify(self.root, require_approved=True)
        for approved in (False, None, 1, "true"):
            with self.subTest(approved=approved):
                approvals = self.approvals()
                approvals[0]["approved"] = approved
                self.manifest(publishable=True, pending_approvals=[], approvals=approvals)
                with self.assertRaisesRegex(ValueError, "nonempty text evidence"):
                    module.verify(self.root, require_approved=True)

    def test_private_paths_in_plain_encoded_and_escaped_forms(self):
        target = self.root / "assets/leak.json"
        for content in ('{"x":"/Users/private/note.md"}', '{"x":"%252FUsers%252Fprivate%252Fnote.md"}', r'{"x":"\u006fbsidian:\/\/open?file=secret"}'):
            with self.subTest(content=content):
                target.write_text(content)
                self.manifest()
                with self.assertRaisesRegex(ValueError, "filesystem or Obsidian"):
                    module.verify(self.root)
        target.unlink()

    def test_private_source_metadata(self):
        self.append("index.html", '<script type="application/json">{"source_note":"private/note"}</script>')
        with self.assertRaisesRegex(ValueError, "private metadata"):
            module.verify(self.root)

    def test_hash_tampering_fails_even_when_new_text_looks_safe(self):
        (self.root / "assets/theme.css").write_text("body{color:red}")
        with self.assertRaisesRegex(ValueError, "inventory/hash mismatch"):
            module.verify(self.root)

    def test_uninventoried_extra_file_fails(self):
        (self.root / "assets/extra.js").write_text("void 0;")
        with self.assertRaisesRegex(ValueError, "inventory/hash mismatch"):
            module.verify(self.root)

    def test_root_relative_resource_cannot_escape_project_base(self):
        self.append("index.html", '<script src="/assets/extra.js"></script>')
        with self.assertRaisesRegex(ValueError, "escapes deployment base"):
            module.verify(self.root)

    def test_parent_traversal_cannot_escape_project_base(self):
        self.append("index.html", '<a href="../private.html">link</a>')
        with self.assertRaisesRegex(ValueError, "escapes deployment base"):
            module.verify(self.root)

    def test_missing_static_resource(self):
        self.append("index.html", '<script src="assets/missing.js"></script>')
        with self.assertRaisesRegex(ValueError, "missing or unsafe static resource"):
            module.verify(self.root)

    def test_runtime_external_dependency_rejected_but_citation_allowed(self):
        self.append("index.html", '<a href="https://example.com/book">citation</a>')
        module.verify(self.root)
        self.append("index.html", '<script src="https://example.com/cdn.js"></script>')
        with self.assertRaisesRegex(ValueError, "external runtime resource"):
            module.verify(self.root)

    def test_stylesheet_external_dependency_rejected(self):
        self.append("assets/theme.css", 'body{background:url("https://example.com/a.svg")}')
        with self.assertRaisesRegex(ValueError, "external runtime resource"):
            module.verify(self.root)

    def test_pdf_and_private_directories_rejected(self):
        pdf = self.root / "assets/private-notes.pdf"
        pdf.write_bytes(b"%PDF-1.7")
        self.manifest()
        with self.assertRaisesRegex(ValueError, "unexpected artifact file type"):
            module.verify(self.root)
        pdf.unlink()
        private = self.root / ".private"
        private.mkdir()
        (private / "log.txt").write_text("private")
        self.manifest()
        with self.assertRaisesRegex(ValueError, "hidden files/directories"):
            module.verify(self.root)

    def test_symlink_rejected(self):
        (self.root / "assets/link.css").symlink_to("theme.css")
        self.manifest()
        with self.assertRaisesRegex(ValueError, "symlink"):
            module.verify(self.root)

    def test_annotation_and_audio_fallback_rejected(self):
        self.append("apps/meridians.html", '<script>fetch("./assets/annotations.json");</script>')
        with self.assertRaisesRegex(ValueError, "asset fallback"):
            module.verify(self.root)

    def test_incomplete_embedded_model_rejected(self):
        path = self.root / "apps/meridians.html"
        path.write_text(path.read_text().replace('Z2xURgIAAAAMAAAA', 'bm90LWEtbW9kZWw='))
        self.manifest()
        with self.assertRaisesRegex(ValueError, "GLB header/length"):
            module.verify(self.root)

    def test_current_publication_choice_and_notice_are_required(self):
        self.manifest(version=2, content_mode='personal-data-only', publishable=True, pending_approvals=[], approvals=self.approvals())
        with self.assertRaisesRegex(ValueError, 'current version 3'):
            module.verify(self.root, require_approved=True)
        self.manifest(publishable=True, pending_approvals=[], approvals=self.approvals(), rights_notice={'contact_email': '', 'text': ''})
        with self.assertRaisesRegex(ValueError, 'contact email'):
            module.verify(self.root, require_approved=True)

    def test_only_the_bundled_pdf_route_is_allowed_and_checked(self):
        module.verify(self.root)
        (self.root / 'assets/lecture.pdf').write_bytes(b'not a PDF')
        self.manifest()
        with self.assertRaisesRegex(ValueError, 'invalid header'):
            module.verify(self.root)




if __name__ == "__main__":
    unittest.main()
