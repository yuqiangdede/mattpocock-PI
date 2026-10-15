"""Shared, versioned source evidence registry for document Skills.

A recorded source excerpt is a traceable observation, NOT proof of a
running interface, current database schema, or product-level requirement.
Only Python stdlib; no source execution or automatic dependency installs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile


def hash_file(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def relative(root, path):
    try:
        return Path(path).resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        raise ValueError('source or registry is outside the selected project root') from None


def source_excerpt(root, path, line, end_line, needle):
    rel = relative(root, path)
    absolute = root / rel
    content = absolute.read_text(encoding='utf-8-sig').splitlines()
    if line < 1 or end_line < line or end_line > len(content) or end_line - line > 500:
        raise ValueError('invalid source line range (max 501 lines)')
    excerpt = '\n'.join(content[line - 1:end_line])
    if not needle or needle not in excerpt:
        raise ValueError('source snippet not found in the specified line range')
    return rel, hash_file(absolute), excerpt


def record(data, root, *, source, line, end_line, needle, claim, kind,
           basis='candidate', consumer=None, refresh=False):
    if basis not in {'candidate', 'static', 'documentation', 'runtime'}:
        raise ValueError(f'unsupported evidence basis: {basis}')
    if not claim or not kind:
        raise ValueError('a nonempty claim and kind are required')
    rel, sha, excerpt = source_excerpt(root, source, line, end_line, needle)
    key = hashlib.sha256(f'{rel}\0{line}\0{end_line}\0{needle}'.encode('utf-8')).hexdigest()[:16]
    existing = next((item for item in data['entries'] if item['id'] == key), None)
    if existing:
        if existing['source_sha256'] != sha and not refresh:
            raise ValueError('source version changed; explicitly re-check then --refresh')
        if (existing['claim'], existing['kind'], existing['basis']) != (claim, kind, basis):
            if not refresh:
                raise ValueError('conflicting evidence claims; --refresh after review')
        existing.update(source_sha256=sha, excerpt=excerpt, claim=claim,
                        kind=kind, basis=basis)
        entry = existing
    else:
        entry = {'id': key, 'source': rel, 'line': line, 'end_line': end_line,
                 'needle': needle, 'source_sha256': sha, 'excerpt': excerpt,
                 'claim': claim, 'kind': kind, 'basis': basis, 'consumers': []}
        data['entries'].append(entry)
    if consumer and consumer not in entry['consumers']:
        entry['consumers'].append(consumer)
    return entry


def inspect(data, root, consumer=None):
    stale, entries = [], []
    if Path(data['root']).resolve() != root.resolve():
        raise ValueError('registry root changed')
    for item in data['entries']:
        if consumer and consumer not in item['consumers']:
            continue
        path = root / item['source']
        current = path.is_file() and hash_file(path) == item['source_sha256']
        entry = {k: item[k] for k in ['id', 'source', 'line', 'end_line',
                                     'claim', 'kind', 'basis', 'consumers']}
        entry['fresh'] = bool(current)
        entries.append(entry)
        if not current:
            stale.append(item['id'])
    return {'entries': entries, 'count': len(entries), 'stale_ids': stale,
            'valid': not stale,
            'notice': 'Source locations only; semantic/runtime truth needs independent checks'}


def save(path, data, old_sha=None):
    if path.exists():
        if old_sha is None or hash_file(path) != old_sha:
            raise ValueError('registry changed during update; review before writing')
    elif old_sha is not None:
        raise ValueError('registry disappeared during update')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.evidence-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        if path.exists() and hash_file(path) != old_sha:
            raise ValueError('registry changed during write')
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'record', 'check'])
    parser.add_argument('registry', type=Path)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--source', type=Path)
    parser.add_argument('--line', type=int)
    parser.add_argument('--end-line', type=int)
    parser.add_argument('--snippet')
    parser.add_argument('--claim')
    parser.add_argument('--kind')
    parser.add_argument('--basis', default='candidate')
    parser.add_argument('--consumer')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    root, registry = args.root.resolve(), args.registry.resolve()
    if not root.is_dir() or not registry.is_relative_to(root):
        parser.error('registry must be inside project root')
    if args.action == 'init':
        if registry.exists():
            parser.error('registry exists; do not overwrite existing evidence')
        data = {'schema': 1, 'root': str(root), 'entries': []}
        save(registry, data)
        result = inspect(data, root)
    else:
        old_sha = hash_file(registry)
        data = json.loads(registry.read_text(encoding='utf-8-sig'))
        if args.action == 'record':
            if not args.source or args.line is None or not args.snippet:
                parser.error('record requires --source, --line and --snippet')
            record(data, root, source=args.source, line=args.line,
                   end_line=args.end_line or args.line, needle=args.snippet,
                   claim=args.claim, kind=args.kind, basis=args.basis,
                   consumer=args.consumer, refresh=args.refresh)
            save(registry, data, old_sha)
        result = inspect(data, root, consumer=args.consumer if args.action == 'check' else None)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['valid'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
