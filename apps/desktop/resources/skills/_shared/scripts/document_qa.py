"""Read-only Markdown structural QA; no claim of semantic or visual validation."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})(.*)$')
LINK = re.compile(r'!?\[[^\]\n]*\]\((<?[^)\n]+>?)\)')


def inspect_text(content: str, path: Path, *, check_links=True):
    errors = []
    stats = {'headings': 0, 'json_blocks': 0, 'links_checked': 0}
    if '\ufffd' in content:
        errors.append('Replacement character U+FFFD found')
    fence = None
    block = []
    start = 0
    for i, line in enumerate(content.splitlines(), 1):
        match = FENCE.match(line)
        if fence:
            if match and match.group(1)[0] == fence[0][0] and len(match.group(1)) >= len(fence[0]) and not match.group(2).strip():
                if fence[1] == 'json':
                    stats['json_blocks'] += 1
                    try:
                        json.loads('\n'.join(block))
                    except json.JSONDecodeError as exc:
                        errors.append(f'Line {start}: invalid JSON fence: {exc.msg} at block line {exc.lineno}')
                fence = None
                block = []
            else:
                block.append(line)
            continue
        if match:
            info = match.group(2).strip().split(' ', 1)[0].lower()
            fence = (match.group(1), info)
            start = i
            continue
        if re.match(r'^ {0,3}#{1,6}\s+\S', line):
            stats['headings'] += 1
        elif re.match(r'^ {4,}#{1,6}\s+\S', line):
            errors.append(f'Line {i}: indented heading; check accidental leading spaces')
        if not check_links:
            continue
        for found in LINK.finditer(line):
            raw = found.group(1).strip().strip('<>')
            raw = re.split(r'\s+["\']', raw, maxsplit=1)[0]
            parts = urlsplit(raw)
            if parts.scheme or parts.netloc or not parts.path or raw.startswith('#'):
                continue
            if re.match(r'^[a-zA-Z]:[\\/]', raw):
                errors.append(f'Line {i}: nonportable absolute link: {raw}')
                continue
            target = (path.parent / unquote(parts.path)).resolve()
            stats['links_checked'] += 1
            if not target.exists():
                errors.append(f'Line {i}: missing local link: {parts.path}')
    if fence:
        errors.append(f'Line {start}: unclosed {fence[1] or "text"} code fence')
    return errors, stats


def inspect(path: Path):
    try:
        content = path.read_text(encoding='utf-8-sig')
    except (UnicodeError, OSError) as exc:
        return {'file': str(path), 'errors': [f'UTF-8/read error: {exc}'], 'stats': {}}
    errors, stats = inspect_text(content, path)
    return {'file': str(path), 'errors': errors, 'stats': stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='+', type=Path, help='Markdown files or directories')
    parser.add_argument('--report', type=Path, help='Write UTF-8 JSON report')
    args = parser.parse_args()
    paths = sorted({p.resolve() for arg in args.paths for p in (arg.rglob('*.md') if arg.is_dir() else [arg])})
    if not paths:
        parser.error('no Markdown files found')
    results = [inspect(p) for p in paths]
    output = {'files': len(results), 'failed_files': sum(bool(r['errors']) for r in results), 'results': results}
    encoded = json.dumps(output, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded + '\n', encoding='utf-8')
    print(encoded)
    return 1 if output['failed_files'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
