import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PROJECT = 'jadualpemandu-223c0';
export const FOLDER = '1m_Flsq97jZwjBxxGKPd3LPL0z3m375wX';
export const COLLECTIONS = ['vehicles', 'bookings', 'access', 'registrationRequests', 'users'];
const MARKER = 'nadi-firestore-v1';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const properties = { backupApp: MARKER, firebaseProject: PROJECT };
const fields = 'id,name,mimeType,parents,appProperties,createdTime,size,md5Checksum,trashed';
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

export function expiredBackup(file, now, currentId) {
  return file.id !== currentId && !file.trashed
    && file.mimeType === 'application/json'
    && file.parents?.includes(FOLDER)
    && file.appProperties?.backupApp === MARKER
    && file.appProperties?.firebaseProject === PROJECT
    && /^nadi-backup-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/.test(file.name)
    && Number.isFinite(Date.parse(file.createdTime))
    && Date.parse(file.createdTime) < now.getTime() - 30 * 86400000;
}

// Never include response bodies: they may contain credentials or personal data.
async function request(url, token, options = {}) {
  const response = await fetch(url, {
    ...options, signal: AbortSignal.timeout(60000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  if (!response.ok) throw new Error(`Backup API failed (HTTP ${response.status}). No response body logged.`);
  return response.status === 204 ? null : response.json();
}

export async function runBackup(env = process.env) {
  const required = ['FIRESTORE_ACCESS_TOKEN', 'DRIVE_CLIENT_ID', 'DRIVE_CLIENT_SECRET', 'DRIVE_REFRESH_TOKEN'];
  for (const key of required) if (!env[key]) throw new Error(`Missing secret: ${key}`);
  const oauth = await request('https://oauth2.googleapis.com/token', null, {
    method: 'POST', body: new URLSearchParams({
      client_id: env.DRIVE_CLIENT_ID, client_secret: env.DRIVE_CLIENT_SECRET,
      refresh_token: env.DRIVE_REFRESH_TOKEN, grant_type: 'refresh_token'
    })
  });
  if (!oauth.access_token) throw new Error('Drive did not issue an access token.');
  const token = oauth.access_token;
  const folder = await request(`${DRIVE}/${FOLDER}?fields=id,mimeType,trashed,capabilities`, token);
  if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) {
    throw new Error('Backup folder is not writable. No backup files changed.');
  }
  const now = new Date();
  const snapshot = { format: MARKER, project: PROJECT, database: '(default)',
    readTime: now.toISOString(), collections: {} };
  // All pages and collections share one Firestore snapshot, preserving typed values.
  for (const collection of COLLECTIONS) {
    const documents = [];
    let pageToken;
    do {
      const query = new URLSearchParams({ pageSize: '300', readTime: snapshot.readTime });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await request(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?${query}`, env.FIRESTORE_ACCESS_TOKEN);
      documents.push(...(page.documents || []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    snapshot.collections[collection] = documents;
  }
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const name = `nadi-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`;
  const boundary = randomUUID();
  const metadata = { name, mimeType: 'application/json', parents: [FOLDER], appProperties: properties };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const uploaded = await request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, token, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  const saved = await request(`${DRIVE}/${uploaded.id}?fields=${fields}`, token);
  if (saved.md5Checksum !== md5(bytes) || Number(saved.size) !== bytes.length
      || !saved.parents?.includes(FOLDER) || saved.trashed) {
    throw new Error('Backup verification failed. Retention cleanup was NOT run.');
  }
  let deleted = 0;
  if (env.BACKUP_CLEANUP_ENABLED === 'true') {
    const candidates = [];
    let pageToken;
    do {
      const query = new URLSearchParams({
        q: `'${FOLDER}' in parents and trashed = false and appProperties has { key='backupApp' and value='${MARKER}' }`,
        fields: `nextPageToken,files(${fields})`, pageSize: '100'
      });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await request(`${DRIVE}?${query}`, token);
      candidates.push(...(page.files || []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    for (const file of candidates.filter(file => expiredBackup(file, now, saved.id))) {
      // Recheck immediately before deletion in case a file was moved or modified.
      const fresh = await request(`${DRIVE}/${file.id}?fields=${fields}`, token);
      if (!expiredBackup(fresh, now, saved.id)) continue;
      await request(`${DRIVE}/${file.id}`, token, { method: 'DELETE' });
      deleted++;
    }
  }
  console.log(`Backup verified: ${COLLECTIONS.length} collections. Expired app backups deleted: ${deleted}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().catch(error => { console.error(error.message); process.exitCode = 1; });
}
