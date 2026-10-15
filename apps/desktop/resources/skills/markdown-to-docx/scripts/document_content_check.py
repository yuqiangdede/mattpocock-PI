"""Read-only content comparison of Pandoc JSON AST and Word's actual OOXML body.

This checks text sequence, heading sequence/count, and table count. It does NOT
verify formulas, image meaning, fields, pagination, layout, or visual quality.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def normalized(value):
    return re.sub(r'\s+', ' ', value).strip()


def inline_text(value):
    if isinstance(value, list):
        return ''.join(inline_text(part) for part in value)
    if not isinstance(value, dict):
        return ''
    kind, content = value.get('t'), value.get('c')
    if kind == 'Str':
        return content
    if kind in {'Space', 'SoftBreak', 'LineBreak'}:
        return ' '
    if kind == 'Code':
        return content[1]
    if kind in {'Math', 'Image', 'Note', 'RawInline'}:
        return ''
    if kind == 'Link' or kind == 'Span':
        return inline_text(content[1])
    if kind == 'Cite':
        return inline_text(content[1])
    if kind == 'Quoted':
        return inline_text(content[1])
    if kind is not None:
        return inline_text(content)
    return ''


def source_blocks(ast):
    """Include text inside table cells and lists, without treating images as text."""
    def walk(value):
        if isinstance(value, list):
            for item in value:
                yield from walk(item)
        elif isinstance(value, dict):
            kind = value.get('t')
            content = value.get('c')
            if kind in {'Para', 'Plain'}:
                text = normalized(inline_text(content))
                if text:
                    yield {'kind': 'text', 'text': text}
            elif kind == 'Header':
                text = normalized(inline_text(content[2]))
                if text:
                    yield {'kind': 'heading', 'text': text}
            elif kind == 'CodeBlock':
                text = normalized(content[1])
                if text:
                    yield {'kind': 'text', 'text': text}
            else:
                yield from walk(content if kind is not None else value.values())
    return list(walk(ast.get('blocks', [])))


def count_nodes(value, kind):
    if isinstance(value, dict):
        return (int(value.get('t') == kind)
                + sum(count_nodes(v, kind) for v in value.values()))
    if isinstance(value, list):
        return sum(count_nodes(v, kind) for v in value)
    return 0


def docx_body(path):
    with zipfile.ZipFile(path) as archive:
        failed = archive.testzip()
        if failed:
            raise ValueError(f'Corrupt DOCX ZIP member: {failed}')
        root = ET.fromstring(archive.read('word/document.xml'))
    paragraphs = []
    for paragraph in root.iter(W + 'p'):
        style = paragraph.find(W + 'pPr/' + W + 'pStyle')
        style_id = style.get(W + 'val', '') if style is not None else ''
        # TOC entries duplicate headings once Word has populated the TOC field.
        if re.match(r'^TOC[1-9]$', style_id, re.I):
            continue
        text = normalized(''.join(
            node.text or '' if node.tag == W + 't' else
            ' ' if node.tag in {W + 'tab', W + 'br', W + 'cr'} else ''
            for node in paragraph.iter()
        ))
        if text:
            paragraphs.append({'text': text,
                               'heading': bool(re.match(r'^Heading[\s-]*[1-9]$', style_id, re.I))})
    return paragraphs, sum(1 for _ in root.iter(W + 'tbl'))


def compare(ast, docx_path):
    expected = source_blocks(ast)
    actual, actual_tables = docx_body(docx_path)
    expected_heads = [item['text'] for item in expected if item['kind'] == 'heading']
    actual_heads = [item['text'] for item in actual if item['heading']]
    missing = []
    document_text = normalized(' '.join(item['text'] for item in actual))
    cursor = 0
    for index, block in enumerate(expected, 1):
        pattern = r'(?<!\w)' + re.escape(block['text']) + r'(?!\w)'
        match = re.search(pattern, document_text[cursor:])
        if match:
            cursor += match.end()
        else:
            missing.append({'index': index, 'kind': block['kind'],
                            'excerpt': block['text'][:100]})
    expected_counts = Counter(expected_heads)
    actual_counts = Counter(actual_heads)
    heading_differences = [
        {'heading': key, 'expected': count, 'actual': actual_counts[key]}
        for key, count in expected_counts.items()
        if actual_counts[key] != count
    ]
    filtered_actual = [text for text in actual_heads if text in expected_counts]
    heading_order_ok = filtered_actual == expected_heads
    tables_expected = count_nodes(ast.get('blocks', []), 'Table')
    # Equations are represented in OMML and intentionally excluded from text parity.
    excluded = {
        'math': count_nodes(ast.get('blocks', []), 'Math'),
        'images': count_nodes(ast.get('blocks', []), 'Image'),
        'notes': count_nodes(ast.get('blocks', []), 'Note'),
        'raw_inline': count_nodes(ast.get('blocks', []), 'RawInline'),
    }
    errors = []
    if missing:
        errors.append(f'{len(missing)} text blocks missing or out of order')
    if heading_differences:
        errors.append('heading counts differ')
    if not heading_order_ok:
        errors.append('heading sequence differs')
    if actual_tables != tables_expected:
        errors.append(f'table count differs: expected {tables_expected}, got {actual_tables}')
    return {
        'passed': not errors,
        'expected_text_blocks': len(expected),
        'matched_text_blocks': len(expected) - len(missing),
        'missing_or_out_of_order': missing[:30],
        'expected_headings': len(expected_heads),
        'actual_headings': len(actual_heads),
        'heading_differences': heading_differences[:30],
        'heading_order_ok': heading_order_ok,
        'tables_expected': tables_expected,
        'tables_actual': actual_tables,
        'excluded_from_text_comparison': excluded,
        'not_verified': ['equation equivalence', 'image semantics', 'footnote content',
                         'TOC field/page numbers', 'layout/visual rendering'],
        'errors': errors,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ast', type=Path, help='Pandoc JSON AST input')
    parser.add_argument('docx', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = compare(json.loads(args.ast.read_text(encoding='utf-8-sig')), args.docx)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
