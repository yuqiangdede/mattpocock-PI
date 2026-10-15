"""Crash-safe document assembly with optimistic file-state protection.

Commands:
  snapshot TARGET --report STATE.json
  assemble TARGET --part PART [--part PART ...] [--snapshot STATE.json]
      [--required-heading HEADING ...] [--overwrite]

A prior snapshot is mandatory when replacing an existing target. Snapshot uses
SHA-256 content identity, not mtime alone; external edits are never discarded.
"""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path


def state(path: Path) -> dict:
    if not path.exists():
        return {'exists': False}
    if not path.is_file():
        raise ValueError(f'not a regular file: {path}')
    data = path.read_bytes()
    text = data.decode('utf-8-sig')
    return {
        'exists': True,
        'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data),
        'lines': len(text.splitlines()),
        'mtime_ns': path.stat().st_mtime_ns,
    }


def assemble(target: Path, parts: list[Path], snapshot: dict | None,
             overwrite: bool, required: list[str], headings=None) -> dict:
    if not parts:
        raise ValueError('at least one --part is required')
    baseline = state(target)
    if baseline['exists'] and not overwrite:
        raise ValueError('existing output requires --overwrite and a baseline snapshot')
    if baseline['exists'] and snapshot is None:
        raise ValueError('existing output requires --snapshot for overwrite protection')
    if snapshot is not None and baseline != snapshot:
        raise ValueError('output changed since snapshot; re-read current file before assembly')
    chunks = []
    for part in parts:
        if not part.is_file():
            raise FileNotFoundError(part)
        text = part.read_text(encoding='utf-8-sig')
        if not text.strip():
            raise ValueError(f'empty part: {part}')
        chunks.append(text.rstrip('\r\n') + '\n')
    combined = '\n'.join(chunks)
    lines = combined.splitlines()
    for heading in required:
        matched = sum(line.strip() == heading.strip() for line in lines)
        if matched != 1:
            raise ValueError(f'required heading must occur exactly once: {heading!r} (got {matched})')
    if '\ufffd' in combined:
        raise ValueError('replacement character U+FFFD in assembled content')
    # Fail closed if a fenced code block spans a lost or incomplete part.
    try:
        from document_qa import inspect_text
        errors, _ = inspect_text(combined, target, check_links=False, headings=headings)
    except ImportError:
        raise RuntimeError('document_qa.py must be installed next to document_workspace.py')
    if errors:
        raise ValueError(f'assembly QA failed: {errors[:6]}')
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f'.{target.name}.', suffix='.tmp', dir=target.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
            f.write(combined)
            f.flush()
            os.fsync(f.fileno())
        if state(target) != baseline:
            raise ValueError('output changed during assembly; refusing to overwrite')
        os.replace(temp_name, target)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return {'output': str(target), 'parts': len(parts), 'sha256': state(target)['sha256'],
            'bytes': state(target)['bytes'], 'lines': len(lines), 'required_headings': len(required)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    sp = sub.add_parser('snapshot')
    sp.add_argument('target', type=Path)
    sp.add_argument('--report', type=Path, required=True)
    ap = sub.add_parser('assemble')
    ap.add_argument('target', type=Path)
    ap.add_argument('--part', type=Path, action='append', required=True)
    ap.add_argument('--snapshot', type=Path)
    ap.add_argument('--overwrite', action='store_true')
    ap.add_argument('--required-heading', action='append', default=[])
    ap.add_argument('--headings-file', type=Path, help='Complete ordered heading manifest')
    args = parser.parse_args()
    try:
        if args.action == 'snapshot':
            result = state(args.target)
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            old = json.loads(args.snapshot.read_text(encoding='utf-8')) if args.snapshot else None
            from document_qa import expected_headings
            headings = expected_headings(args.headings_file) if args.headings_file else None
            result = assemble(args.target, args.part, old, args.overwrite, args.required_heading, headings)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError, RuntimeError) as exc:
        parser.exit(1, f'{type(exc).__name__}: {exc}\n')


if __name__ == '__main__':
    raise SystemExit(main())
