"""Regression tests for optional document checkpoint manifest."""
import tempfile
import unittest
from pathlib import Path

from job_checkpoint import digest, finish, failure, initialize, inspect, write_atomic


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.input = self.root / 'source.md'
        self.input.write_text('# 输入\n', encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_complete_and_resume_without_redo(self):
        job = initialize(self.root, [self.input], ['extract', 'convert'],
                         {'format': 'formal'})
        self.assertEqual(job['decisions']['format'], 'formal')
        self.assertTrue(inspect(job, self.root)['valid'])
        first = self.root / 'extract.md'
        first.write_text('## 已完成\n', encoding='utf-8')
        finish(job, self.root, 'extract', [first], ['document_qa passed'])
        second = self.root / 'report.docx'
        second.write_bytes(b'fake-test-output')
        finish(job, self.root, 'convert', [second], [])
        self.assertEqual(inspect(job, self.root)['stages'][-1]['status'], 'done')
        with self.assertRaisesRegex(ValueError, 'already completed'):
            finish(job, self.root, 'convert', [second], [])

    def test_stale_input_and_output_detected(self):
        job = initialize(self.root, [self.input], ['extract'])
        first = self.root / 'extract.md'
        first.write_text('# 提取结果\n', encoding='utf-8')
        finish(job, self.root, 'extract', [first], [])
        first.write_text('# 外部修改\n', encoding='utf-8')
        self.assertFalse(inspect(job, self.root)['valid'])
        with self.assertRaisesRegex(ValueError, 'reconcile'):
            finish(job, self.root, 'extract', [first], [])
        first.write_text('# 提取结果\n', encoding='utf-8')
        self.input.write_text('# 源码改动\n', encoding='utf-8')
        self.assertTrue(any('input changed' in reason
                            for reason in inspect(job, self.root)['stale']))

    def test_order_failure_and_optimistic_manifest_write(self):
        job = initialize(self.root, [self.input], ['read', 'write'])
        data = self.root / 'data.txt'
        data.write_text('value', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'previous stages'):
            finish(job, self.root, 'write', [data], [])
        failure(job, self.root, 'read', 'temporary IO error')
        self.assertEqual(job['stages'][0]['status'], 'failed')
        finish(job, self.root, 'read', [data], [])
        path = self.root / 'scratch' / 'job-manifest.json'
        write_atomic(path, job)
        old = digest(path)
        path.write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'changed'):
            write_atomic(path, job, expected=old)


if __name__ == '__main__':
    unittest.main()
