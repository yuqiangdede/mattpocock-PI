"""Regression tests for shared source evidence versioning."""
import tempfile
import unittest
from pathlib import Path

from evidence_registry import inspect, record, save, hash_file


class EvidenceRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'src' / 'Handler.java'
        self.source.parent.mkdir(parents=True)
        self.source.write_text(
            'public class Handler {\n  @GetMapping("/events")\n}\n', encoding='utf-8')
        self.data = {'schema': 1, 'root': str(self.root), 'entries': []}

    def tearDown(self):
        self.temp.cleanup()

    def add(self, consumer='api-integration-docs:HTTP-001', refresh=False):
        return record(self.data, self.root, source=self.source,
                      line=2, end_line=2, needle='@GetMapping',
                      claim='Candidate HTTP route; registration not verified',
                      kind='java-annotation', basis='candidate',
                      consumer=consumer, refresh=refresh)

    def test_multiple_skills_share_single_evidence(self):
        first = self.add()
        second = self.add('requirements-spec:REQ-001')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(len(self.data['entries']), 1)
        self.assertEqual(len(first['consumers']), 2)
        view = inspect(self.data, self.root, consumer='requirements-spec:REQ-001')
        self.assertTrue(view['valid'])
        self.assertEqual(view['count'], 1)
        self.assertEqual(view['entries'][0]['basis'], 'candidate')

    def test_stale_source_rejects_implicit_refresh(self):
        self.add()
        self.source.write_text(
            'public class Handler {\n  @GetMapping("/events")\n  // edit\n}\n',
            encoding='utf-8')
        self.assertFalse(inspect(self.data, self.root)['valid'])
        with self.assertRaisesRegex(ValueError, 'source version changed'):
            self.add()
        refreshed = self.add(refresh=True)
        self.assertEqual(len(self.data['entries']), 1)
        self.assertEqual(refreshed['source_sha256'], hash_file(self.source))
        self.assertTrue(inspect(self.data, self.root)['valid'])

    def test_invalid_source_location_and_conflict(self):
        with self.assertRaisesRegex(ValueError, 'source snippet not found'):
            record(self.data, self.root, source=self.source, line=2,
                   end_line=2, needle='@DeleteMapping',
                   claim='x', kind='java-annotation')
        self.add()
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            record(self.data, self.root, source=self.source, line=2,
                   end_line=2, needle='@GetMapping',
                   claim='Verified deployed endpoint', kind='java-annotation',
                   basis='runtime')
        other = self.root.parent / 'outside-code.java'
        with self.assertRaisesRegex(ValueError, 'outside'):
            record(self.data, self.root, source=other, line=1,
                   end_line=1, needle='test', claim='x', kind='source')

    def test_atomic_registry_write_guards_existing_content(self):
        path = self.root / 'scratch' / 'evidence.json'
        save(path, self.data)
        old = hash_file(path)
        path.write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'registry changed'):
            save(path, self.data, old)


if __name__ == '__main__':
    unittest.main()
