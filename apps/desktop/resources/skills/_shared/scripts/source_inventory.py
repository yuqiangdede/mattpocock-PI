"""Deterministic read-only candidate index; NOT proof of live interfaces or SQL schema."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

IGNORE = {'.git', 'node_modules', 'dist', 'build', 'target', '.next', '.venv'}
PATTERNS = {
    '.java': [('java-annotation', re.compile(r'@(?:RestController|Controller|RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|MessageMapping|KafkaListener|RabbitListener|JmsListener|EventListener)\b'))],
    '.kt': [('kotlin-annotation', re.compile(r'@(?:RestController|Controller|RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|KafkaListener|RabbitListener)\b'))],
    '.sql': [('sql-definition', re.compile(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW|INDEX|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE)\b', re.I))],
    '.py': [('python-route', re.compile(r'@\w+\.(?:get|post|put|patch|delete|route|websocket)\s*\('))],
    '.ts': [('typescript-route-candidate', re.compile(r'@(?:Controller|Get|Post|Put|Patch|Delete|MessagePattern)\s*\('))],
}


def scan(root: Path, max_file_bytes: int = 8_000_000):
    candidates, files = [], []
    for directory, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in IGNORE)
        for filename in sorted(names):
            path = Path(directory) / filename
            rules = PATTERNS.get(path.suffix.lower())
            if not rules or not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(root).as_posix()
            try:
                if path.stat().st_size > max_file_bytes:
                    files.append({'path': relative, 'status': 'too_large'})
                    continue
                blob = path.read_bytes()
                content = blob.decode('utf-8-sig')
            except (UnicodeError, OSError):
                files.append({'path': relative, 'status': 'unreadable'})
                continue
            files.append({'path': relative, 'sha256': hashlib.sha256(blob).hexdigest()})
            for i, line in enumerate(content.splitlines(), 1):
                for kind, pattern in rules:
                    if pattern.search(line):
                        candidates.append({'path': relative, 'line': i, 'kind': kind, 'excerpt': line.strip()[:180]})
    return {'root': str(root), 'scanned_files': len(files), 'candidates': candidates, 'files': files,
            'disclaimer': 'Only regex discovery hints. Verify registration, SQL migrations, DTO fields, and runtime behavior before documenting.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--quiet', action='store_true', help='Print counts only (use with --report)')
    parser.add_argument('--max-file-bytes', type=int, default=8_000_000)
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir() or args.max_file_bytes < 1:
        parser.error('root must be a directory and --max-file-bytes must be positive')
    if args.quiet and not args.report:
        parser.error('--quiet requires --report')
    result = scan(root, args.max_file_bytes)
    encoded = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded + '\n', encoding='utf-8')
    if args.quiet:
        print(json.dumps({'scanned_files': result['scanned_files'], 'candidates': len(result['candidates']),
                          'report': str(args.report)}, ensure_ascii=False))
    else:
        print(encoded)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
