"""Verify expected DOCX paragraph phrases after joining split OOXML text runs.

Structural or layout validity is NOT established by this check.
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        if archive.testzip():
            raise ValueError('corrupted DOCX ZIP member')
        root = ET.fromstring(archive.read('word/document.xml'))
    result = []
    for paragraph in root.iter(W + 'p'):
        # Reconstruct visible text across run boundaries; XML tags are not text.
        text = ''.join((node.text or '') if node.tag == W + 't' else
                       '\t' if node.tag == W + 'tab' else
                       '\n' if node.tag in (W + 'br', W + 'cr') else ''
                       for node in paragraph.iter())
        result.append(re.sub(r'\s+', ' ', text).strip())
    return result


def check(path: Path, phrases: list[str]):
    entries = paragraphs(path)
    missing = [phrase for phrase in phrases if not any(
        re.sub(r'\s+', ' ', phrase).strip() in item for item in entries
    )]
    return {'file': str(path), 'paragraphs': len(entries),
            'expected': len(phrases), 'matched': len(phrases) - len(missing),
            'missing': missing, 'note': 'content-only; not pagination or visual verification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('docx', type=Path)
    parser.add_argument('--phrase', action='append', default=[])
    parser.add_argument('--phrases-file', type=Path, help='UTF-8 text file, one expected phrase per line')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    phrases = list(args.phrase)
    if args.phrases_file:
        phrases.extend(line.strip() for line in args.phrases_file.read_text(encoding='utf-8-sig').splitlines()
                       if line.strip() and not line.lstrip().startswith('#'))
    if not phrases:
        parser.error('specify --phrase or --phrases-file')
    try:
        result = check(args.docx, phrases)
    except (OSError, ValueError, ET.ParseError, zipfile.BadZipFile, KeyError) as exc:
        parser.exit(2, f'{type(exc).__name__}: {exc}\n')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result['missing'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
