"""Rebuild the single-file demo without modifying the frozen v0.1 kernel."""
from pathlib import Path
import hashlib, re, shutil

root = Path(__file__).resolve().parent
source = root.parent / 'v0.1' / 'source' / '业务仿真与压力测试_UI_demo.html'
core_path = root / 'simulation-core.js'
if source.exists():
    original = re.search(r'<script id="simulation-core">([\s\S]*?)</script>', source.read_text())[1]
    if core_path.exists() and core_path.read_text() != original:
        raise SystemExit('Kernel mismatch: v0.1 must remain unchanged')
    core_path.write_text(original)
else:
    original = core_path.read_text()
digest = hashlib.sha256(original.encode()).hexdigest()
html = (root / 'template.html').read_text()
for marker, content in [('/* STYLE */', (root/'style.css').read_text()), ('/* CORE */', original), ('/* APP */', (root/'app.js').read_text().replace('__CORE_HASH__',digest))]:
    html = html.replace(marker, content)
(root/'index.html').write_text(html)
(root/'research'/'core-sha256.txt').write_text(digest+'\n')
print('index.html built; frozen core SHA-256:',digest)
