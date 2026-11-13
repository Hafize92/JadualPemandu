import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expiredBackup, FOLDER, PROJECT, runBackup } from '../scripts/backup-drive.mjs';

const now = new Date('2026-11-12T13:00:00Z');
const old = { id: 'old', name: 'nadi-backup-2026-10-01T13-00-00-000Z.json',
  mimeType: 'application/json', parents: [FOLDER], createdTime: '2026-10-01T13:00:00Z',
  appProperties: { backupApp: 'nadi-firestore-v1', firebaseProject: PROJECT } };
test('only expired marked backups in the configured folder can be deleted', () => {
  assert.equal(expiredBackup(old, now, 'new'), true);
  for (const change of [
    { id: 'new' }, { parents: ['another-folder'] }, { appProperties: {} },
    { name: 'personal.json' }, { trashed: true }, { mimeType: 'application/pdf' },
    { createdTime: 'invalid' }, { createdTime: '2026-11-01T00:00:00Z' },
    { createdTime: '2026-10-13T13:00:00Z' },
    { appProperties: { ...old.appProperties, firebaseProject: 'other' } }
  ]) assert.equal(Boolean(expiredBackup({ ...old, ...change }, now, 'new')), false);
});
test('missing credentials fail before any network request', async () => {
  await assert.rejects(runBackup({}), /Missing secret/);
});

test('read check never touches Drive or performs writes', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).hostname, 'firestore.googleapis.com');
      assert.equal(options.method, undefined);
      calls.push(url);
      return new Response(JSON.stringify({ documents: [] }));
    };
    await runBackup({ BACKUP_CHECK_ONLY: 'true', FIRESTORE_ACCESS_TOKEN: 'mock' });
    assert.equal(calls.length, 5);
  } finally { globalThis.fetch = original; }
});

test('verification gates cleanup and collection pages share one readTime', async () => {
  const original = globalThis.fetch;
  const env = Object.fromEntries(['FIRESTORE_ACCESS_TOKEN', 'DRIVE_CLIENT_ID',
    'DRIVE_CLIENT_SECRET', 'DRIVE_REFRESH_TOKEN'].map(key => [key, 'test-only']));
  env.BACKUP_CLEANUP_ENABLED = 'true';
  try {
    for (const corrupt of [true, false]) {
      let checksum, size, deleted = 0, listed = 0;
      const reads = [];
      globalThis.fetch = async (input, options) => {
        const url = new URL(input);
        const json = data => new Response(JSON.stringify(data), { status: 200 });
        if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'mock' });
        if (url.hostname === 'firestore.googleapis.com') {
          reads.push(url.searchParams.get('readTime'));
          return json(url.searchParams.has('pageToken') ? { documents: [] }
            : { documents: [{ name: 'example', fields: { count: { integerValue: '1' } } }], nextPageToken: 'second' });
        }
        if (url.pathname.endsWith(`/${FOLDER}`)) return json({
          mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true }
        });
        if (url.pathname.includes('/upload/')) {
          const raw = options.body.toString();
          const start = raw.indexOf('{"format":');
          const end = raw.indexOf('\r\n--', start);
          const bytes = Buffer.from(raw.slice(start, end));
          const snapshot = JSON.parse(bytes);
          assert.equal(Object.keys(snapshot.collections).length, 5);
          size = bytes.length;
          checksum = createHash('md5').update(bytes).digest('hex');
          return json({ id: 'new' });
        }
        if (url.pathname.endsWith('/new')) return json({ id: 'new', parents: [FOLDER],
          size: String(size), md5Checksum: corrupt ? 'bad' : checksum });
        if (url.pathname.endsWith('/old')) {
          if (options.method === 'DELETE') { deleted++; return new Response(null, { status: 204 }); }
          return json({ ...old, createdTime: '2000-01-01T00:00:00Z' });
        }
        if (url.pathname.endsWith('/files')) {
          listed++;
          return json({ files: [{ ...old, createdTime: '2000-01-01T00:00:00Z' },
            { ...old, id: 'personal', appProperties: {} }] });
        }
        throw new Error('Unexpected request in mock');
      };
      if (corrupt) await assert.rejects(runBackup(env), /verification failed/);
      else await runBackup(env);
      assert.equal(reads.length, 10);
      assert.equal(new Set(reads).size, 1);
      assert.equal(listed, corrupt ? 0 : 1);
      assert.equal(deleted, corrupt ? 0 : 1);
    }
  } finally { globalThis.fetch = original; }
});
