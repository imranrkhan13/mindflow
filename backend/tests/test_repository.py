import io
import os
import re
import zipfile
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
os.environ['DB_PATH']='/tmp/mf-unit-tests.db'
from app.routers import repository as r


def archive(files):
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w') as z:
        for path,text in files.items():z.writestr('repo-sha/'+path,text)
    return b.getvalue()


def sample():
    return r.index_archive(archive({'src/chat.py':'from app.store import save_message\n\ndef send_chat(message):\n    save_message(message)\n', 'app/store.py':'def save_message(message):\n    return message\n', 'README.md':'# A chat application\n', '.env':'API_KEY=not-a-real-secret', 'node_modules/x/a.js':'no', 'image.png':'asset', 'empty.py':'', 'src/ui.jsx':"import { send } from './client'\nexport const Chat = () => send('hello')",'src/client.js':'export function send(x) {return fetch(x)}'}),'owner','repo','a'*40)


def test_whole_source_inventory_not_readme():
    d=sample()
    assert d['coverage']['archive_entries']==9
    assert d['coverage']['indexed_files']==6
    assert d['coverage']['omitted_files']==3
    assert d['coverage']['truncated'] is False
    assert any(f['path']=='app/store.py' for f in d['files'])
    assert not any(f['path']=='.env' for f in d['files'])


def test_no_readme_required():
    d=r.index_archive(archive({'deep/service/order.py':'def checkout(order):\n    return order\n'}),'x','y','b'*40)
    assert r.retrieve(d,'checkout')[0]['path']=='deep/service/order.py'


def test_line_citations_are_exact():
    d=sample(); chunks=r.retrieve(d,'send chat save message')
    assert chunks
    for c in chunks:
        original=next(f['text'] for f in d['files'] if f['path']==c['path'])
        assert '\n'.join(original.splitlines()[c['start']-1:c['end']])==c['text']
        assert '/blob/'+d['sha']+'/' in c['url']


def test_import_edges_have_real_source_lines():
    d=sample()
    assert any(e['source']=='src/chat.py' and e['target']=='app/store.py' and e['line']==1 for e in d['edges'])
    assert any(e['source']=='src/ui.jsx' and e['target']=='src/client.js' for e in d['edges'])
    snippets=r.retrieve(d,'chat send client save message')
    g=r.evidence_graph(d,snippets)
    for e in g['edges']:
        assert any(c['path']==e['source'] and c['start']<=e['line']<=c['end'] for c in snippets)


@pytest.mark.parametrize('url',['https://github.com/x/y/extra','https://evil.com/x/y','http://github.com/x/y','https://github.com/x/y?ref=main','https://github.com@evil.com/x/y','https://github.com/x/y/tree/dev'])
def test_only_public_github_root(url):
    with pytest.raises(HTTPException):r.parse_url(url)


def test_large_test_file_is_indexed_and_searchable_to_the_end():
    text = '// ordinary test context\n' * 22000 + 'export const uniqueTailwindBoundary = "last line";\n'
    assert len(text.encode()) > 500_000
    path = 'packages/tailwindcss/src/utilities.test.ts'
    data = r.index_archive(archive({path: text}), 'x', 'y', 'b' * 40)
    assert data['files'][0]['text'] == text
    assert data['coverage']['indexed_bytes'] == len(text.encode())
    assert data['coverage']['truncated'] is False
    sources = r.retrieve(data, 'Where is uniqueTailwindBoundary?')
    assert any('uniqueTailwindBoundary' in source['text'] for source in sources)
    for source in sources:
        assert source['text'] == '\n'.join(text.splitlines()[source['start']-1:source['end']])


def test_source_over_total_budget_is_rejected(monkeypatch):
    monkeypatch.setattr(r, 'MAX_TEXT', 600_000)
    with pytest.raises(HTTPException) as ex:
        r.index_archive(archive({'huge.ts': 'a' * 600_001}), 'x', 'y', 'b' * 40)
    assert ex.value.status_code == 413


def test_combined_text_budget_still_applies(monkeypatch):
    monkeypatch.setattr(r, 'MAX_TEXT', 700_000)
    with pytest.raises(HTTPException) as ex:
        r.index_archive(archive({'one.ts': '// test\n' * 70_000, 'two.ts': '// test\n' * 20_000}), 'x', 'y', 'b' * 40)
    assert ex.value.status_code == 413


def test_unknown_terms_return_no_evidence():
    assert r.retrieve(sample(),'pterodactylquasar')==[]


def test_save_load_and_no_source_leak_in_summary():
    d=sample();r.save(d)
    assert r.load(d['id'])['files']==d['files']
    assert all('text' not in f for f in r.public(d)['files'])


def test_malformed_snapshot_id():
    with pytest.raises(HTTPException):r.load('../../anything')


def test_api_source_and_no_evidence_stream():
    app=FastAPI();app.include_router(r.router)
    with TestClient(app) as client:
        d=sample();r.save(d)
        assert client.get('/api/repository/'+d['id']).json()['coverage']['indexed_files']==6
        assert client.get('/api/repository/'+d['id']+'/file',params={'path':'app/store.py'}).json()['text'].startswith('def save_message')
        assert client.get('/api/repository/'+d['id']+'/file',params={'path':'.env'}).status_code==404
        response=client.post('/api/repository/'+d['id']+'/ask',json={'question':'pterodactylquasar'})
        assert 'could not find matching code evidence' in response.text
        assert 'event: done' in response.text


def test_provider_disabled_is_honest(monkeypatch):
    app=FastAPI();app.include_router(r.router)
    monkeypatch.setattr(r.settings,'openrouter_api_key',None)
    with TestClient(app) as client:
        d=sample();r.save(d)
        response=client.post('/api/repository/'+d['id']+'/ask',json={'question':'send chat'})
        assert 'event: sources' in response.text
        assert 'No free model key is configured' in response.text
        assert 'No paid provider was called' in response.text


def test_adjacent_windows_do_not_hide_cross_file_handler():
    text='\n'.join(['# context']*50+['def uploadDocument(file):','    return post(file)']+['# more context']*60)
    d=r.index_archive(archive({'handler.py':text}),'x','y','b'*40)
    chunks=r.retrieve(d,'How does uploadDocument call post?')
    assert any('return post(file)' in c['text'] for c in chunks)


def test_generated_builder_conversations_excluded():
    d=r.index_archive(archive({'.cloud-attachments/conversation.json':'a'*600000,'code.py':'print(1)'}),'x','y','b'*40)
    assert d['coverage']['indexed_files']==1
    assert d['omitted'][0]['reason']=='generated/dependency directory'


def test_alias_import_requires_real_configuration():
    files={'route.ts':"import { validate } from '@/lib/keys'", 'lib/keys.ts':'export function validate() {}'}
    no_config=r.index_archive(archive(files),'x','y','b'*40)
    assert not no_config['edges']
    files['tsconfig.json']='{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./*"]}}}'
    configured=r.index_archive(archive(files),'x','y','b'*40)
    assert configured['edges']==[{'source':'route.ts','target':'lib/keys.ts','line':1,'kind':'import'}]


def test_explicit_absent_symbol_does_not_retrieve_generic_code():
    data=r.index_archive(archive({'main.py':'# implemented in code\ndef main(): return 1'}),'x','y','b'*40)
    assert r.retrieve(data,'Where is QZXVATeleportRabbit32789 implemented? Explain its code.')==[]
    assert r.retrieve(data,'Where is main implemented?')


def test_explicit_file_paths_anchor_cross_file_retrieval():
    files={'lib/keys.ts':'export function resolveProjectByRawKey(key) { return key }', 'lib/event-store.ts':'export function ingest(items) { return items }'}
    files.update({'route'+str(i)+'.ts':'// route events batch API key validation persistence\nexport const route = true' for i in range(30)})
    data=r.index_archive(archive(files),'x','y','b'*40)
    paths={s['path'] for s in r.retrieve(data,'Trace events batch API key validation in lib/keys.ts and persistence in lib/event-store.ts')}
    assert {'lib/keys.ts','lib/event-store.ts'}<=paths


def test_provider_citation_format_normalization():
    assert r.normalize_citations('[S1] [S2:12-20] (S3 line 12) [S4, S5]')=='[S1] [S2] ([S3] line 12) [S4], [S5]'
    assert r.normalize_citations('CSS1 abcS2 S42')=='CSS1 abcS2 [S42]'


def test_adjacent_windows_merge_into_exact_contiguous_source():
    text='\n'.join('const item'+str(i)+' = "matching";' for i in range(130))
    data=r.index_archive(archive({'main.ts':text}),'x','y','b'*40)
    sources=r.retrieve(data,'Explain matching in main.ts')
    assert len(sources)==1
    source=sources[0]
    assert source['text']=='\n'.join(text.splitlines()[source['start']-1:source['end']])
    assert source['end']==130


def test_literal_quoted_filenames_preserve_paths_and_safety():
    assert r.exclusion('"README.md"') is None
    assert r.exclusion('"docs/API.md"') is None
    assert r.exclusion('prisma/schema.prisma') is None
    assert r.exclusion('".env"')=='potential credential file (not read)'
    data=r.index_archive(archive({'"README.md"':'quoted docs','README.md':'other docs','prisma/schema.prisma':'model User { id Int @id }'}),'x','y','b'*40)
    assert {f['path'] for f in data['files']}=={'"README.md"','README.md','prisma/schema.prisma'}


def test_import_wording_finds_executable_handler_amid_ui_markup():
    from app.routers.repository import retrieve, relationships
    files = [
      {'path':'src/page.jsx','text':'\n'.join(['<button>Importing a GitHub repository</button>']*240)},
      {'path':'src/app.js','text':"async function importRepo(value) {\n const result = await api('/import', {url:value});\n return result;\n}"},
      {'path':'src/client.js','text':"export async function importFromGithub(url) { return fetch('/api/github', {body:url}); }"}
    ]
    d={'files':files,'edges':relationships(files),'url':'https://github.com/test/repo','sha':'a'*40}
    snippets=retrieve(d,'How does importing a GitHub repository work?')
    assert any('function importRepo' in c['text'] for c in snippets)

def test_identifier_acronyms_and_natural_inflections_align():
    from app.routers.repository import tokens
    assert 'import' in tokens('importing')
    assert 'api' in tokens('resolveAPIKey')
    assert 'request' in tokens('requests')


def test_spooled_archive_above_previous_25_mb_limit_is_indexed():
    import tempfile
    with tempfile.SpooledTemporaryFile(max_size=1024, mode='w+b') as source:
        with zipfile.ZipFile(source, 'w', compression=zipfile.ZIP_STORED) as z:
            z.writestr('repo-sha/assets/large.png', b'x' * 26_000_000)
            z.writestr('repo-sha/main.ts', 'export const retainedSource = true;')
        assert source.tell() > 25_000_000
        assert source.tell() < r.MAX_ZIP
        source.seek(0)
        data = r.index_archive(source, 'x', 'y', 'b' * 40)
    assert data['coverage']['truncated'] is False
    assert data['files'][0]['text'] == 'export const retainedSource = true;'
    assert data['omitted'][0]['path'] == 'assets/large.png'


def test_stream_download_accepts_exact_budget_and_rejects_overflow(monkeypatch):
    import asyncio
    monkeypatch.setattr(r, 'MAX_ZIP', 10)
    class Response:
        def __init__(self, blocks): self.blocks = blocks
        async def aiter_bytes(self, chunk_size):
            for block in self.blocks: yield block
    output = io.BytesIO()
    assert asyncio.run(r.download_archive(Response([b'12345', b'67890']), output)) == 10
    assert output.getvalue() == b'1234567890'
    output = io.BytesIO()
    with pytest.raises(HTTPException) as ex:
        asyncio.run(r.download_archive(Response([b'12345', b'678901']), output))
    assert ex.value.status_code == 413
    assert output.getvalue() == b'12345'


def test_expanded_archive_budget_still_applies(monkeypatch):
    monkeypatch.setattr(r, 'MAX_UNPACKED', 10)
    with pytest.raises(HTTPException) as ex:
        r.index_archive(archive({'main.ts': 'x' * 11}), 'x', 'y', 'b' * 40)
    assert ex.value.status_code == 413


def test_large_file_tree_counts_exclusions_without_old_20000_entry_rejection():
    files = {f'assets/icon-{i}.png': 'asset' for i in range(20_001)}
    files['src/main.ts'] = 'export const fullImport = true;'
    data = r.index_archive(archive(files), 'x', 'y', 'b' * 40)
    assert data['coverage']['archive_entries'] == 20_002
    assert data['coverage']['indexed_files'] == 1
    assert data['coverage']['omitted_files'] == 20_001
    assert data['coverage']['truncated'] is False


def test_more_than_2500_supported_files_are_preserved():
    files = {f'source/file-{i}.ts': f'export const item{i} = true;' for i in range(2_501)}
    data = r.index_archive(archive(files), 'x', 'y', 'b' * 40)
    assert len(data['files']) == 2_501


def test_archive_entry_safety_budget_is_still_enforced(monkeypatch):
    monkeypatch.setattr(r, 'MAX_ENTRIES', 2)
    with pytest.raises(HTTPException) as ex:
        r.index_archive(archive({'a.ts':'a', 'b.ts':'b', 'c.ts':'c'}), 'x', 'y', 'b' * 40)
    assert ex.value.status_code == 413


def test_compressed_snapshots_and_legacy_snapshots_are_readable():
    import json
    import time
    data = sample()
    r.save(data)
    with r.connection() as con:
        stored = con.execute('SELECT data FROM code_snapshots WHERE id=?', (data['id'],)).fetchone()[0]
        assert isinstance(stored, bytes)
        assert len(stored) < len(json.dumps(data).encode())
    assert r.load(data['id']) == data
    with r.connection() as con:
        con.execute('UPDATE code_snapshots SET data=? WHERE id=?', (json.dumps(data), data['id']))
    assert r.load(data['id']) == data


def test_documentation_and_bundle_contain_every_indexed_file():
    import json
    from app.services.repository_docs import documentation, source_bundle
    data = sample()
    doc = documentation(data)
    assert data['sha'] in doc
    assert 'runtime' in doc
    for file in data['files']:
        assert file['path'] in doc
    for excluded in data['omitted']:
        assert excluded['path'] in doc
    with zipfile.ZipFile(io.BytesIO(source_bundle(data, doc))) as bundle:
        assert bundle.read('DOCUMENTATION.md').decode() == doc
        assert json.loads(bundle.read('import-graph.json')) == data['edges']
        for file in data['files']:
            assert bundle.read('source/' + file['path']).decode() == file['text']
        assert 'source/.env' not in bundle.namelist()


def test_documentation_exports_are_downloadable_via_api():
    app = FastAPI(); app.include_router(r.router)
    data = sample(); r.save(data)
    with TestClient(app) as client:
        response = client.get(f"/api/repository/{data['id']}/documentation")
        assert response.status_code == 200
        assert 'attachment;' in response.headers['content-disposition']
        assert 'Complete indexed file inventory' in response.text
        response = client.get(f"/api/repository/{data['id']}/documentation?bundle=true")
        assert response.status_code == 200
        assert response.headers['content-type'] == 'application/zip'
        with zipfile.ZipFile(io.BytesIO(response.content)) as bundle:
            assert 'source/src/chat.py' in bundle.namelist()


def test_summary_does_not_decompress_source_for_saved_projects(monkeypatch):
    data = sample(); r.save(data)
    monkeypatch.setattr(r, 'load', lambda sid: (_ for _ in ()).throw(AssertionError('Full source must not be loaded')))
    summary = r.load_summary(data['id'])
    assert summary['edge_count'] == len(data['edges'])
    assert 'edges' not in summary
    assert all('text' not in file for file in summary['files'])


def test_import_reuses_same_commit_without_archive_download(monkeypatch):
    data = sample(); r.save(data)
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, *args, **kwargs):
            return http_response()
        def stream(self, *args, **kwargs): raise AssertionError('Cached commit must not download an archive')
    def http_response():
        class Response:
            status_code = 200
            def json(self): return {'sha': data['sha']}
        return Response()
    monkeypatch.setattr(r.httpx, 'AsyncClient', Client)
    app = FastAPI(); app.include_router(r.router)
    with TestClient(app) as client:
        response = client.post('/api/repository/import', json={'url': 'https://github.com/owner/repo'})
    assert response.status_code == 200
    assert response.json()['reused'] is True
    assert response.json()['id'] == data['id']
    assert response.headers['content-encoding'] == 'gzip'


def test_expired_commits_are_not_reused():
    import time
    data = sample(); data['repository'] = 'expired/test-only'; r.save(data)
    with r.connection() as con:
        con.execute('UPDATE code_snapshots SET created=? WHERE id=?', (time.time()-86400*8, data['id']))
    assert r.cached_summary(data['repository'], data['sha']) is None


def test_chunk_windows_are_memoised_per_snapshot_files():
    d = sample()
    r._CHUNK_CACHE.clear()
    first = r.build_chunks(d['files'])
    second = r.build_chunks(d['files'])
    assert first is second
    # A different snapshot object with identical content must not share windows.
    other = sample()
    assert r.build_chunks(other['files']) is not first
    assert r.build_chunks(d['files']) is first


def _split_stream(parts):
    """Mirror of the /ask delta splitter: whole tokens only, IDs never cut."""
    answer = ''; pending = ''
    for text in parts:
        pending += text
        cut = max(pending.rfind(' '), pending.rfind('\n'), pending.rfind('\t'))
        if cut >= 0:
            ready, pending = pending[:cut + 1], pending[cut + 1:]
        elif len(pending) < 200:
            ready = ''
        else:
            ready, pending = pending, ''
        hold = re.search(r'\[?S(?:\d+|$)(?::?\d*-?\d*)?$', ready)
        if hold:
            ready, pending = ready[:hold.start()], ready[hold.start():] + pending
        answer += ready
    return answer + pending


def test_source_id_split_across_deltas_is_never_cut():
    parts = ['The ', 'handler ', 'is ', 'in [S', '1] ', 'and ', 'also [', 'S2:1', '0-1', '2] end']
    answer = _split_stream(parts)
    assert '[S1]' in answer and '[S2:10-12]' in answer
    assert _split_stream(['no space before', ' [S', '3] now']) == 'no space before [S3] now'


def test_retrieval_reuses_windows_for_follow_up_questions(monkeypatch):
    data = sample()
    r._CHUNK_CACHE.clear()
    calls = []
    real = r.build_chunks

    def counting(files):
        calls.append(1)
        return real(files)

    monkeypatch.setattr(r, 'build_chunks', counting)
    r.retrieve(data, 'send chat')
    r.retrieve(data, 'save message')
    assert len(calls) == 2
    monkeypatch.setattr(r, 'build_chunks', real)
    assert r._CHUNK_CACHE and list(r._CHUNK_CACHE.values())[-1][1]
    assert all('id' not in chunk for chunk in list(r._CHUNK_CACHE.values())[-1][1])


PR_PATCH = """diff --git a/src/upload.py b/src/upload.py
index 1111111..2222222 100644
--- a/src/upload.py
+++ b/src/upload.py
@@ -1,3 +1,6 @@
 from app.store import save_message
 
+def upload_document(stream):
+    return save_message(stream)
+
 def existing(): return 1
diff --git a/src/gone.js b/src/gone.js
--- a/src/gone.js
+++ /dev/null
@@ -1,2 +0,0 @@
-import x from './x'
-export default x
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
Binary files /dev/null and b/assets/logo.png differ
"""


def test_pull_request_urls_are_strict():
    assert r.parse_pr_url('https://github.com/owner/repo/pull/12') == ('owner', 'repo', 12)
    assert r.parse_pr_url('https://github.com/owner/repo/pull/12.diff') == ('owner', 'repo', 12)
    for bad in [
        'https://github.com/owner/repo/pull/0',
        'https://github.com/owner/repo/pulls/12',
        'https://github.com/owner/repo/pull/12/files',
        'https://github.com/owner/repo/issues/12',
        'http://github.com/owner/repo/pull/12',
        'https://evil.com/owner/repo/pull/12',
        'https://github.com/../repo/pull/12',
        'https://github.com/owner/repo/pull/12?x=1',
    ]:
        with pytest.raises(HTTPException):
            r.parse_pr_url(bad)


def test_diff_parsing_counts_and_kinds():
    files = r.diff_files(PR_PATCH)
    assert [f['path'] for f in files] == ['src/upload.py', 'src/gone.js', 'assets/logo.png']
    added, deleted, binary = files
    assert added['kind'] == 'modified' and added['added'] == 3 and added['removed'] == 0
    assert deleted['kind'] == 'deleted'
    assert binary.get('binary') is True


def test_review_clusters_and_novel_symbols_without_fabrication():
    data = r.index_archive(archive({'src/upload.py': 'from app.store import save_message\n\ndef existing(): return 1\n',
                                    'src/gone.js': "import x from './x'\n",
                                    'app/store.py': 'def save_message(m):\n    return m\n',
                                    'src/other.py': 'from src.upload import upload_document\n'}), 'o', 'r', 'c' * 40)
    clusters = r.review_clusters(r.diff_files(PR_PATCH))
    snippets = r.review_retrieval(data, clusters)
    assert all(s['path'] != 'src/upload.py' for s in snippets)
    assert 'upload_document' in clusters[0]['symbols']
    # upload_document is used by src/other.py, so it must NOT be flagged as novel.
    assert 'upload_document' not in clusters[0]['novel']
    checks = r.review_checks(clusters, snippets)
    assert any(c['path'] == 'src/gone.js' and 'deleted' in c['text'] for c in checks)
    assert any(c['path'] == 'assets/logo.png' and 'Binary' in c['text'] for c in checks)
    entries = r.review_entries(clusters)
    assert [e['id'] for e in entries] == ['D1', 'D2', 'D3']
    assert entries[0]['added_code'].startswith('def upload_document')
    # Only changed lines are sent to the model, never whole unchanged files.
    assert all(line[:1] in {'+', '-', '@', ' ', '\\'} for line in entries[0]['added_code'].splitlines()[1:])
    assert 'existing(): return 1' not in entries[0]['added_code']


def test_pr_endpoint_with_github_mocked(monkeypatch):
    data = sample(); r.save(data)
    monkeypatch.setattr(r.settings, 'openrouter_api_key', None)

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def stream(self, *args, **kwargs):
            outer = self
            class Ctx:
                async def __aenter__(self):
                    class Response:
                        status_code = 200
                        async def aiter_text(self):
                            yield PR_PATCH
                    return Response()
                async def __aexit__(self, *args): return False
            return Ctx()
    monkeypatch.setattr(r.httpx, 'AsyncClient', Client)
    app = FastAPI(); app.include_router(r.router)
    with TestClient(app) as client:
        response = client.post(f"/api/repository/{data['id']}/pull-request",
                               json={'url': 'https://github.com/owner/repo/pull/7', 'question_key': 'review'})
        assert response.status_code == 200
        text = response.text
        assert 'event: pr_files' in text
        assert 'event: review_checks' in text
        assert 'event: pr_summary' in text
        assert 'No free model key is configured' in text
        assert 'event: review\n' not in text


def test_pr_endpoint_reports_bad_pr_without_model(monkeypatch):
    data = sample(); r.save(data)
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def stream(self, *args, **kwargs):
            class Ctx:
                async def __aenter__(self):
                    class Response: status_code = 404
                    return Response()
                async def __aexit__(self, *args): return False
            return Ctx()
    monkeypatch.setattr(r.httpx, 'AsyncClient', Client)
    app = FastAPI(); app.include_router(r.router)
    with TestClient(app) as client:
        body = client.post(f"/api/repository/{data['id']}/pull-request", json={'url': 'https://github.com/owner/repo/pull/99'}).text
    assert 'not found' in body and 'Private repositories are not supported' in body


def test_model_payload_cannot_override_model_and_cites_diff_entries():
    data = sample()
    snippets = r.retrieve(data, 'send chat')
    p = r.model_payload('q', snippets)
    assert p['model'] == 'openrouter/free'
    assert p['stream'] is True
    prompt = r.review_prompt('risk', r.review_clusters(r.diff_files(PR_PATCH)), 'o/r', 'd' * 40)
    assert 'D1' in prompt and 'most likely to break' in prompt and 'o/r at commit dddddddd' in prompt
