"""Read-only Markdown structural QA; no claim of semantic or visual validation."""
import argparse
import json
import re
from pathlib import Path
from collections import Counter
from urllib.parse import unquote, urlsplit

FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})(.*)$')
LINK = re.compile(r'!?\[[^\]\n]*\]\((<?[^)\n]+>?)\)')


def expected_headings(path: Path) -> list[str]:
    headings = [line.strip() for line in path.read_text(encoding='utf-8-sig').splitlines()
                if line.strip()]
    if not headings or any(not re.match(r'^#{1,6}\s+\S', line) for line in headings):
        raise ValueError('heading manifest must contain nonempty Markdown heading lines')
    if len(set(headings)) != len(headings):
        raise ValueError('heading manifest contains duplicate entries')
    return headings


def inspect_text(content: str, path: Path, *, check_links=True, headings=None):
    errors = []
    stats = {'headings': 0, 'json_blocks': 0, 'links_checked': 0}
    actual_headings = []
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
            actual_headings.append(line.strip())
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
    if headings is not None:
        required = list(headings)
        counts = Counter(actual_headings)
        desired = set(required)
        for heading in required:
            if counts[heading] == 0:
                errors.append(f'missing required heading: {heading}')
            elif counts[heading] > 1:
                errors.append(f'duplicate required heading: {heading} (count={counts[heading]})')
        observed = [heading for heading in actual_headings if heading in desired]
        if observed != required and all(counts[h] == 1 for h in required):
            errors.append('required heading order mismatch')
        extras = [heading for heading in actual_headings if heading not in desired]
        if extras:
            errors.append(f'unexpected heading(s) outside manifest: {extras[:8]}')
        stats['required_headings'] = len(required)
        stats['heading_order_checked'] = True
    return errors, stats


def inspect(path: Path, headings=None):
    try:
        content = path.read_text(encoding='utf-8-sig')
    except (UnicodeError, OSError) as exc:
        return {'file': str(path), 'errors': [f'UTF-8/read error: {exc}'], 'stats': {}}
    errors, stats = inspect_text(content, path, headings=headings)
    return {'file': str(path), 'errors': errors, 'stats': stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='+', type=Path, help='Markdown files or directories')
    parser.add_argument('--report', type=Path, help='Write UTF-8 JSON report')
    parser.add_argument('--headings-file', type=Path, help='Complete ordered Markdown headings, one per line')
    args = parser.parse_args()
    paths = sorted({p.resolve() for arg in args.paths for p in (arg.rglob('*.md') if arg.is_dir() else [arg])})
    if not paths:
        parser.error('no Markdown files found')
    required = expected_headings(args.headings_file) if args.headings_file else None
    results = [inspect(p, headings=required) for p in paths]
    output = {'files': len(results), 'failed_files': sum(bool(r['errors']) for r in results), 'results': results}
    encoded = json.dumps(output, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded + '\n', encoding='utf-8')
    print(encoded)
    return 1 if output['failed_files'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
