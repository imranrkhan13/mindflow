import io
import os
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
