"""Optional manifest for resumable document jobs; never executes skipped work.

Run from project root. All sources and outputs are kept as root-relative paths.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile


def digest(path):
    if not path.is_file():
        raise FileNotFoundError(path)
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def rel(root, path):
    target = Path(path).resolve()
    try:
        return target.relative_to(root.resolve()).as_posix()
    except ValueError:
        raise ValueError(f'path is outside project root: {path}') from None


def snapshot(root, paths):
    result = {}
    for path in paths:
        key = rel(root, path)
        result[key] = digest(root / key)
    return result


def initialize(root, sources, stages, decisions=None):
    if not stages or len(set(stages)) != len(stages):
        raise ValueError('provide unique stage names in execution order')
    return {
        'schema': 1,
        'root': str(root.resolve()),
        'inputs': snapshot(root, sources),
        'decisions': decisions or {},
        'stages': [{'name': name, 'status': 'pending', 'outputs': {},
                    'checks': [], 'reason': None} for name in stages],
    }


def inspect(manifest, root):
    stale = []
    if Path(manifest['root']).resolve() != root.resolve():
        raise ValueError('manifest belongs to a different project root')
    for path, expected in manifest['inputs'].items():
        full = root / path
        if not full.is_file() or digest(full) != expected:
            stale.append(f'input changed or missing: {path}')
    for stage in manifest['stages']:
        if stage['status'] == 'done':
            if not stage['outputs']:
                stale.append(f'done stage has no outputs: {stage["name"]}')
            for path, expected in stage['outputs'].items():
                full = root / path
                if not full.is_file() or digest(full) != expected:
                    stale.append(f'output changed or missing: {stage["name"]}: {path}')
    return {'valid': not stale, 'stale': stale,
            'stages': [{'name': stage['name'], 'status': stage['status']}
                       for stage in manifest['stages']]}


def finish(manifest, root, name, paths, checks):
    state = inspect(manifest, root)
    if not state['valid']:
        raise ValueError(f'inputs/outputs changed; re-read and reconcile: {state["stale"]}')
    stages = manifest['stages']
    matches = [i for i, stage in enumerate(stages) if stage['name'] == name]
    if len(matches) != 1:
        raise ValueError(f'unknown stage: {name}')
    index = matches[0]
    if any(stage['status'] not in {'done', 'skipped'} for stage in stages[:index]):
        raise ValueError('previous stages are not completed')
    if stages[index]['status'] == 'done':
        raise ValueError('stage already completed; do not repeat it')
    if not paths:
        raise ValueError('completed stage requires at least one existing output')
    stages[index].update(status='done', outputs=snapshot(root, paths),
                         checks=list(checks), reason=None)
    return inspect(manifest, root)


def failure(manifest, root, name, reason):
    state = inspect(manifest, root)
    if not state['valid']:
        raise ValueError(f'inputs/outputs changed; manual reconciliation required: {state["stale"]}')
    matches = [stage for stage in manifest['stages'] if stage['name'] == name]
    if len(matches) != 1 or not reason:
        raise ValueError('specify known stage and nonempty reason')
    stage = matches[0]
    if stage['status'] == 'done':
        raise ValueError('cannot mark verified completed stage failed; inspect its output first')
    stage.update(status='failed', reason=reason)
    return inspect(manifest, root)


def write_atomic(path, payload, *, expected=None):
    if path.exists():
        if expected is None or digest(path) != expected:
            raise ValueError('manifest changed; refusing blind overwrite')
    elif expected is not None:
        raise ValueError('manifest disappeared')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix='.checkpoint-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        if path.exists() and digest(path) != expected:
            raise ValueError('manifest changed while writing')
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['init', 'check', 'done', 'fail'])
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--input', type=Path, action='append', default=[])
    parser.add_argument('--stage', action='append', default=[])
    parser.add_argument('--output', type=Path, action='append', default=[])
    parser.add_argument('--decision', action='append', default=[])
    parser.add_argument('--check-result', action='append', default=[])
    parser.add_argument('--reason')
    args = parser.parse_args()
    root, path = args.root.resolve(), args.manifest.resolve()
    if not root.is_dir() or not path.is_relative_to(root):
        parser.error('manifest and root must be inside an existing project directory')
    if args.operation == 'init':
        if path.exists():
            parser.error('manifest exists; use check, never recreate to bypass conflicts')
        decisions = {}
        for item in args.decision:
            if '=' not in item:
                parser.error('decision must be KEY=VALUE')
            key, value = item.split('=', 1)
            if not key:
                parser.error('empty decision key')
            decisions[key] = value
        manifest = initialize(root, args.input, args.stage, decisions)
        write_atomic(path, manifest)
        result = inspect(manifest, root)
    else:
        baseline = digest(path)
        manifest = json.loads(path.read_text(encoding='utf-8'))
        if args.operation == 'check':
            result = inspect(manifest, root)
        elif args.operation == 'done':
            if len(args.stage) != 1:
                parser.error('done requires one --stage')
            result = finish(manifest, root, args.stage[0], args.output, args.check_result)
            write_atomic(path, manifest, expected=baseline)
        else:
            if len(args.stage) != 1:
                parser.error('fail requires one --stage')
            result = failure(manifest, root, args.stage[0], args.reason)
            write_atomic(path, manifest, expected=baseline)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['valid'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
