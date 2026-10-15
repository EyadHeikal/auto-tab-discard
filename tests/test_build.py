import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('auto_tab_discard_build', ROOT / 'build.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class BrowserPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = {
            path.relative_to(BUILD.SOURCE).as_posix(): path.read_bytes()
            for path in BUILD.SOURCE.rglob('*')
            if path.is_file() and not path.is_symlink() and path.suffix in BUILD.SUFFIXES
            and not any(part.startswith('.') for part in path.relative_to(BUILD.SOURCE).parts)
        }
        cls.files['LICENSE'] = (ROOT / 'LICENSE').read_bytes()
        cls.manifest = json.loads(cls.files['manifest.json'])

    def package(self, browser):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with contextlib.redirect_stdout(io.StringIO()):
                BUILD.package(output, browser, self.files, self.manifest)
            archives = list(output.glob('*.zip' if browser == 'chrome' else '*.xpi'))
            self.assertEqual(len(archives), 1)
            with ZipFile(archives[0]) as archive:
                return {name: archive.read(name) for name in archive.namelist()}

    def test_firefox_omits_chrome_managed_storage_declaration(self):
        files = self.package('firefox')
        manifest = json.loads(files['manifest.json'])
        self.assertNotIn('storage', manifest)
        self.assertIn('storage', manifest['permissions'])
        self.assertEqual(manifest['browser_specific_settings'], self.manifest['browser_specific_settings'])
        self.assertEqual(manifest['background'], {'page': self.manifest['background']['page']})
        observers = [script for script in manifest['content_scripts']
                     if '/data/inject/calls.js' in script['js']]
        self.assertEqual(len(observers), 1)
        self.assertEqual(observers[0]['world'], 'MAIN')
        self.assertEqual(observers[0]['run_at'], 'document_start')
        self.assertTrue(observers[0]['all_frames'])
        self.assertIn('data/inject/calls.js', files)

    def test_chrome_retains_managed_storage_schema(self):
        files = self.package('chrome')
        manifest = json.loads(files['manifest.json'])
        self.assertEqual(manifest['storage'], self.manifest['storage'])
        self.assertIn('storage', manifest['permissions'])
        schema = json.loads(files[manifest['storage']['managed_schema']])
        self.assertEqual(schema['type'], 'object')
        self.assertEqual(schema['properties']['audio']['type'], 'boolean')
        self.assertEqual(manifest['background']['service_worker'], self.manifest['background']['service_worker'])
        self.assertNotIn('page', manifest['background'])


if __name__ == '__main__':
    unittest.main()
