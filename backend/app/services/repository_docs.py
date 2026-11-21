"""Deterministic documentation and a lossless export of indexed source."""
import collections
import io
import json
import re
import zipfile
from urllib.parse import quote


def documentation(data):
    def escaped(value):
        return re.sub(r'([\\`*{}\[\]<>|])', r'\\\1', str(value)).replace('\n', ' ')

    def link(path):
        return f"[{escaped(path)}]({data['url']}/blob/{data['sha']}/{quote(path, safe='/')})"

    files = data['files']
    counts = collections.Counter(f['language'] for f in files)
    directories = collections.Counter(f['path'].split('/')[0] if '/' in f['path'] else '(root)' for f in files)
    incoming = collections.Counter(e['target'] for e in data['edges'])
    outgoing = collections.Counter(e['source'] for e in data['edges'])
    lines = [f"# {escaped(data['repository'])} — repository documentation", '',
        f"Snapshot: [{data['sha']}]({data['url']}/tree/{data['sha']})", '',
        '## Coverage', '',
        f"{len(files):,} supported files, {data['coverage']['indexed_bytes']:,} source bytes, {len(data['omitted']):,} explicit exclusions.", '',
        data['coverage']['scope'], '',
        'This document inventories actual source and detected static imports. It does not execute code or infer runtime behavior, deployment state, or business purpose. The source bundle includes every indexed file without truncation; excluded files are listed below. Git history and submodule contents are not included.', '',
        '## Languages', '', '| Language | Files |', '| --- | ---: |']
    lines.extend(f'| {escaped(language)} | {count} |' for language, count in counts.most_common())
    lines += ['', '## Repository structure', '', '| Top-level directory | Indexed files |', '| --- | ---: |']
    lines.extend(f'| {escaped(path)} | {count} |' for path, count in sorted(directories.items()))
    lines += ['', '## Project configuration and commands', '']
    found = False
    for file in files:
        if file['path'].split('/')[-1] != 'package.json': continue
        try:
            manifest = json.loads(file['text'])
            if not isinstance(manifest, dict): continue
        except ValueError:
            continue
        found = True
        lines += [f"### {escaped(file['path'])}", '', f"Source: {link(file['path'])}", '']
        for field in ('name', 'description', 'packageManager'):
            if isinstance(manifest.get(field), str): lines += [f"- {field}: {escaped(manifest[field])}"]
        scripts = manifest.get('scripts', {})
        if isinstance(scripts, dict):
            lines += ['', '| Script | Defined command (not executed) |', '| --- | --- |']
            lines.extend(f'| {escaped(name)} | {escaped(command)} |' for name, command in sorted(scripts.items()))
        for field in ('dependencies', 'devDependencies', 'peerDependencies'):
            dependencies = manifest.get(field)
            if isinstance(dependencies, dict):
                lines += ['', f'#### {field}', '', '| Package | Version |', '| --- | --- |']
                lines.extend(f'| {escaped(name)} | {escaped(version)} |' for name, version in sorted(dependencies.items()))
        lines += ['']
    if not found:
        lines += ['No package.json manifest was indexed. Inspect the configuration files in the complete file inventory for this project’s build and run instructions.', '']
    configs = [f for f in files if f['path'].split('/')[-1] in {'pyproject.toml','requirements.txt','Cargo.toml','go.mod','Dockerfile','Makefile','docker-compose.yml','compose.yml'}]
    lines.extend(f"- Configuration: {link(file['path'])}" for file in configs)
    lines += ['', '## Source documentation', '', 'The following sections contain complete indexed Markdown/text documentation, quoted as source rather than interpreted instructions.', '']
    for file in files:
        if file['language'] not in {'md', 'mdx', 'txt'}: continue
        fence = '`' * max(3, 1 + max((len(m.group()) for m in re.finditer(r'`+', file['text'])), default=0))
        lines += [f"### {escaped(file['path'])}", '', f"Source: {link(file['path'])}", '', fence + 'text', file['text'], fence, '']
    lines += ['## Complete indexed file inventory', '', '| Source file | Lines | Bytes | Imports | Imported by |', '| --- | ---: | ---: | ---: | ---: |']
    for file in files:
        path = file['path']
        lines += [f"| {link(path)} | {file['lines']} | {file['bytes']} | {outgoing[path]} | {incoming[path]} |"]
    lines += ['', '## Detected static import connections', '', 'Python and JS/TS imports only. These are not runtime call traces. Missing edges do not prove files are unrelated.', '', '| Importing file | Imported file | Source line |', '| --- | --- | ---: |']
    lines.extend(f"| {link(edge['source'])} | {link(edge['target'])} | {edge['line']} |" for edge in data['edges'])
    lines += ['', '## Excluded files', '', '| File | Reason |', '| --- | --- |']
    lines.extend(f"| {escaped(file['path'])} | {escaped(file['reason'])} |" for file in data['omitted'])
    return '\n'.join(lines) + '\n'


def source_bundle(data, document):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        bundle.writestr('DOCUMENTATION.md', document)
        bundle.writestr('coverage.json', json.dumps({'commit': data['sha'], 'coverage': data['coverage'], 'excluded': data['omitted']}, indent=2))
        bundle.writestr('import-graph.json', json.dumps(data['edges'], indent=2))
        for file in data['files']:
            bundle.writestr('source/' + file['path'], file['text'])
    return buffer.getvalue()
