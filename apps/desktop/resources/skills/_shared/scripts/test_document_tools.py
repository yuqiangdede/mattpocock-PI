"""Standard-library regressions for shared document utilities."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from document_qa import inspect_text
from document_workspace import state, assemble
from source_inventory import scan
from docx_text_check import check


class SharedDocumentToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_resume_external_change_refused(self):
        out = self.root / 'report.md'
        out.write_text('## Old\n', encoding='utf-8')
        before = state(out)
        out.write_text('## Externally completed\n', encoding='utf-8')
        part = self.root / 'part.md'
        part.write_text('## New\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'changed since snapshot'):
            assemble(out, [part], before, True, ['## New'])
        self.assertEqual(out.read_text(encoding='utf-8'), '## Externally completed\n')

    def test_assemble_required_headings_and_atomic_output(self):
        first = self.root / 'first.md'
        second = self.root / 'second.md'
        first.write_text('# 文档\n\n## 1 开始\n', encoding='utf-8')
        second.write_text('## 2 完成\n', encoding='utf-8')
        out = self.root / 'result.md'
        result = assemble(out, [first, second], None, False, ['## 1 开始', '## 2 完成'])
        self.assertEqual(result['parts'], 2)
        self.assertTrue(out.read_text(encoding='utf-8').endswith('## 2 完成\n'))
        with self.assertRaisesRegex(ValueError, 'exactly once'):
            assemble(self.root / 'missing.md', [first, second], None, False, ['## 3 缺失'])
        self.assertFalse((self.root / 'missing.md').exists())

    def test_reject_broken_markdown_and_json(self):
        errs, _ = inspect_text('## 标题\n```json\n{"broken": }\n```\n', self.root / 'x.md', check_links=False)
        self.assertTrue(any('invalid JSON' in x for x in errs))
        errs, _ = inspect_text('## 标题\n```json\n{}', self.root / 'x.md', check_links=False)
        self.assertTrue(any('unclosed' in x for x in errs))
        errs, _ = inspect_text('    ## Unexpected indent\n', self.root / 'x.md', check_links=False)
        self.assertTrue(any('indented heading' in x for x in errs))

    def test_candidate_not_claimed_as_true_registration(self):
        (self.root / 'Demo.java').write_text('@RestController\nclass Demo {}\n', encoding='utf-8')
        (self.root / 'init.sql').write_text('CREATE TABLE demo(id int);\n', encoding='utf-8')
        results = scan(self.root)
        self.assertEqual(len(results['candidates']), 2)
        self.assertIn('regex discovery hints', results['disclaimer'])
        self.assertTrue(all('sha256' in x for x in results['files']))

    def test_docx_split_runs_reassembled(self):
        file = self.root / 'demo.docx'
        with zipfile.ZipFile(file, 'w') as z:
            z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第五章 </w:t></w:r><w:r><w:t>验收报告</w:t></w:r></w:p></w:body></w:document>')
        result = check(file, ['第五章 验收报告'])
        self.assertEqual(result['matched'], 1)
        self.assertEqual(check(file, ['未出现'])['matched'], 0)


if __name__ == '__main__':
    unittest.main()
