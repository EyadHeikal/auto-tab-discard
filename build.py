import copy
import hashlib
import json
import posixpath
import re
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'v3'
SUFFIXES = {'.js', '.mjs', '.json', '.html', '.css', '.png', '.svg'}


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        name = 'href' if tag == 'link' else 'src'
        if tag in {'script', 'link', 'img', 'iframe'} and attributes.get(name):
            self.references.append(attributes[name])


def require(files, origin, reference):
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path:
        return
    name = unquote(url.path)
    name = name.lstrip('/') if name.startswith('/') else posixpath.join(posixpath.dirname(origin), name)
    name = posixpath.normpath(name)
    if name not in files:
        raise ValueError(f'{origin} references missing resource: {reference}')


def validate(files):
    manifest = json.loads(files['manifest.json'])
    references = list(manifest['icons'].values())
    references += [manifest['action']['default_popup'], manifest['options_ui']['page']]
    if 'storage' in manifest:
        references += [manifest['storage']['managed_schema']]
    references += [value for key, value in manifest['background'].items() if key != 'type']
    references += [script for group in manifest['content_scripts'] for script in group.get('js', []) + group.get('css', [])]
    references += [resource for group in manifest['web_accessible_resources'] for resource in group['resources']]
    for reference in references:
        require(files, 'manifest.json', reference)
    for name, data in files.items():
        if name.endswith('.json'):
            json.loads(data)
        elif name.endswith('.html'):
            parser = Resources()
            parser.feed(data.decode())
            for reference in parser.references:
                require(files, name, reference)
        elif name.endswith('.mjs'):
            for reference in re.findall(r'''\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["']([^"']+)["']''', data.decode()):
                require(files, name, reference)
    require(files, 'manifest.json', 'data/inject/meta.js')


def package(output, browser, source, manifest):
    files = dict(source)
    manifest = copy.deepcopy(manifest)
    if browser == 'chrome':
        manifest['background'] = {'service_worker': manifest['background']['service_worker'], 'type': 'module'}
        manifest.pop('browser_specific_settings', None)
    else:
        manifest['background'] = {'page': manifest['background']['page']}
        manifest.pop('minimum_chrome_version', None)
        manifest.pop('storage', None)
    files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    validate(files)
    stage = output / browser
    stage.mkdir()
    for name, data in files.items():
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
    suffix = 'chrome.zip' if browser == 'chrome' else 'firefox-unsigned.xpi'
    archive = output / f'auto-tab-discard-{manifest["version"]}-call-protection-{suffix}'
    with ZipFile(archive, 'x', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in sorted(files.items()):
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, data, compresslevel=9)
    with ZipFile(archive) as bundle:
        if bundle.testzip() is not None or set(bundle.namelist()) != set(files):
            raise ValueError(f'Invalid archive: {archive}')
        if any(bundle.read(name) != data for name, data in files.items()):
            raise ValueError(f'Archive content mismatch: {archive}')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(f'{browser}: {stage}')
    print(f'{archive} ({archive.stat().st_size:,} bytes; {len(files)} files)')
    print(f'SHA256 {digest}')
    return f'{digest}  {archive.name}\n'


def main():
    files = {}
    for path in sorted(SOURCE.rglob('*')):
        relative = path.relative_to(SOURCE)
        if any(part.startswith('.') for part in relative.parts) or path.suffix not in SUFFIXES:
            continue
        if path.is_symlink():
            raise ValueError(f'Unexpected source symlink: {path}')
        if path.is_file():
            files[relative.as_posix()] = path.read_bytes()
    files['LICENSE'] = (ROOT / 'LICENSE').read_bytes()
    manifest = json.loads(files['manifest.json'])
    dist = ROOT / 'dist'
    if dist.is_symlink():
        raise ValueError('Refusing to build into a symlinked dist directory')
    dist.mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix=f'auto-tab-discard-{manifest["version"]}-call-protection-', dir=dist))
    checksums = ''.join(package(output, browser, files, manifest) for browser in ('chrome', 'firefox'))
    (output / 'SHA256SUMS').write_text(checksums)
    print('Validated manifests, local references, JSON, archive CRCs, and packaged bytes.')


if __name__ == '__main__':
    main()
