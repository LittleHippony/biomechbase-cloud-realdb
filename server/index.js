import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

const PORT = Number(process.env.PORT || 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const DB_MODE = String(process.env.DB_MODE || 'json').toLowerCase();
const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'biomechbase';
const MYSQL_TABLE = process.env.MYSQL_TABLE || 'app_state';
const MYSQL_SSL = String(process.env.MYSQL_SSL || 'false').toLowerCase() === 'true';

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: '25mb' }));
const sessions = new Map();
let mysqlPool = null;

const defaultDb = {
  subjects: [],
  studyProtocols: [],
  users: [
    {
      id: 'usr_admin',
      username: 'admin',
      password: 'Dongweiliu',
      fullName: 'System Administrator',
      email: 'admin@biomech.sys',
      role: 'Admin',
      adminTier: 1,
      isActive: true,
      lastLogin: null
    }
  ]
};

const ALLOWED_ETHICAL_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_SUBJECT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

const detectMimeTypeFromBuffer = (buffer) => {
  if (!buffer || buffer.length < 4) return '';

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  return '';
};

const parseBase64DataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return null;
  const matched = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!matched) return null;
  return {
    mimeType: String(matched[1] || '').toLowerCase(),
    base64Payload: String(matched[2] || '').replace(/\s+/g, '')
  };
};

const normalizeDataUrlFromPayload = (payload, allowedTypes, invalidTypeMessage) => {
  const declaredMimeType = String(payload?.mimeType || '').toLowerCase();
  if (!allowedTypes.has(declaredMimeType)) {
    return { ok: false, message: invalidTypeMessage };
  }

  const parsed = parseBase64DataUrl(payload?.dataUrl);
  if (!parsed) {
    return { ok: false, message: 'Invalid file payload.' };
  }

  if (!allowedTypes.has(parsed.mimeType)) {
    return { ok: false, message: invalidTypeMessage };
  }

  let buffer;
  try {
    buffer = Buffer.from(parsed.base64Payload, 'base64');
  } catch {
    return { ok: false, message: 'Invalid file payload.' };
  }

  if (!buffer || buffer.length < 4) {
    return { ok: false, message: 'File appears corrupted or empty.' };
  }

  const detectedMimeType = detectMimeTypeFromBuffer(buffer);
  if (!detectedMimeType || !allowedTypes.has(detectedMimeType)) {
    return { ok: false, message: 'File content type is invalid.' };
  }

  if (declaredMimeType !== detectedMimeType || parsed.mimeType !== detectedMimeType) {
    return { ok: false, message: 'File type does not match actual file content.' };
  }

  return {
    ok: true,
    normalized: {
      fileName: String(payload?.fileName || 'uploaded-file'),
      mimeType: detectedMimeType,
      dataUrl: `data:${detectedMimeType};base64,${parsed.base64Payload}`
    }
  };
};

const validateEthicalApprovalPayload = (ethicalApproval) => {
  if (!ethicalApproval) {
    return { ok: true };
  }

  const normalized = normalizeDataUrlFromPayload(
    ethicalApproval,
    ALLOWED_ETHICAL_FILE_TYPES,
    'Ethical approval file must be PDF, JPEG or PNG.'
  );
  if (!normalized.ok) {
    const mappedMessage =
      normalized.message === 'Invalid file payload.'
        ? 'Invalid ethical approval file payload.'
        : normalized.message === 'File appears corrupted or empty.'
          ? 'Ethical approval file appears corrupted or empty.'
          : normalized.message === 'File content type is invalid.'
            ? 'Ethical approval file content is not a valid PDF, JPEG or PNG.'
            : normalized.message === 'File type does not match actual file content.'
              ? 'Ethical approval file type does not match its actual content.'
              : normalized.message;
    return { ok: false, message: mappedMessage };
  }

  return {
    ok: true,
    normalized: {
      fileName: String(ethicalApproval.fileName || 'ethical-approval'),
      mimeType: normalized.normalized.mimeType,
      dataUrl: normalized.normalized.dataUrl
    }
  };
};

const validateSubjectStaticImagePayload = (staticImage) => {
  const normalized = normalizeDataUrlFromPayload(
    staticImage,
    ALLOWED_SUBJECT_IMAGE_TYPES,
    'Subject static image must be JPEG or PNG.'
  );
  if (!normalized.ok) {
    const mappedMessage =
      normalized.message === 'Invalid file payload.'
        ? 'Invalid subject image payload.'
        : normalized.message === 'File appears corrupted or empty.'
          ? 'Subject image appears corrupted or empty.'
          : normalized.message === 'File content type is invalid.'
            ? 'Subject image content is not a valid JPEG or PNG.'
            : normalized.message === 'File type does not match actual file content.'
              ? 'Subject image type does not match its actual content.'
              : normalized.message;
    return { ok: false, message: mappedMessage };
  }

  return {
    ok: true,
    normalized: {
      fileName: String(staticImage.fileName || 'subject-image'),
      mimeType: normalized.normalized.mimeType,
      dataUrl: normalized.normalized.dataUrl
    }
  };
};

const validateSubjectStaticImagesPayload = (inputImages) => {
  if (inputImages === undefined) {
    return { ok: true };
  }
  if (inputImages === null) {
    return { ok: true, normalized: null };
  }

  const imageList = Array.isArray(inputImages)
    ? inputImages
    : (inputImages ? [inputImages] : []);

  const normalizedImages = [];
  for (const image of imageList) {
    const validated = validateSubjectStaticImagePayload(image);
    if (!validated.ok) {
      return validated;
    }
    if (validated.normalized) {
      normalizedImages.push(validated.normalized);
    }
  }

  return { ok: true, normalized: normalizedImages };
};

const normalizeDb = (parsedInput) => {
  const parsed = parsedInput && typeof parsedInput === 'object' ? parsedInput : {};
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const protocols = Array.isArray(parsed.studyProtocols) ? parsed.studyProtocols : [];
  const normalizedUsers = users.map((user) => {
    const normalized = { ...user };
    if (normalized.role === 'Admin') {
      normalized.adminTier = normalized.adminTier === 1 ? 1 : (normalized.username === 'admin' ? 1 : 2);
    } else {
      normalized.adminTier = undefined;
    }
    return normalized;
  });

  const normalizedProtocols = protocols.map((protocol) => {
    const now = new Date().toISOString();
    const normalized = { ...protocol };
    normalized.isDeleted = Boolean(normalized.isDeleted);
    normalized.version = Number.isFinite(Number(normalized.version)) && Number(normalized.version) > 0 ? Number(normalized.version) : 1;
    normalized.createdAt = normalized.createdAt || now;
    normalized.updatedAt = normalized.updatedAt || normalized.createdAt;
    normalized.createdBy = normalized.createdBy || 'System';
    normalized.lastModifiedBy = normalized.lastModifiedBy || normalized.createdBy;
    normalized.history = Array.isArray(normalized.history) ? normalized.history : [];
    return normalized;
  });

  const normalizedSubjects = (Array.isArray(parsed.subjects) ? parsed.subjects : []).map((subject) => {
    const normalized = { ...subject };
    if (Array.isArray(normalized.staticImages)) {
      normalized.staticImages = normalized.staticImages;
    } else if (normalized.staticImage) {
      normalized.staticImages = [normalized.staticImage];
    } else {
      normalized.staticImages = [];
    }
    delete normalized.staticImage;
    return normalized;
  });

  return {
    subjects: normalizedSubjects,
    studyProtocols: normalizedProtocols,
    users: normalizedUsers
  };
};

const readDbFromJsonFile = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf-8');
    return normalizeDb(defaultDb);
  }

  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const parsed = JSON.parse(raw || '{}');
  return normalizeDb(parsed);
};

const writeDbToJsonFile = (db) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(normalizeDb(db), null, 2), 'utf-8');
};

const ensureMySqlPool = async () => {
  if (mysqlPool) return mysqlPool;

  mysqlPool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: MYSQL_SSL ? { rejectUnauthorized: false } : undefined
  });

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS \`${MYSQL_TABLE}\` (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      state_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await mysqlPool.query(`SELECT id FROM \`${MYSQL_TABLE}\` WHERE id = 1 LIMIT 1`);
  if (!Array.isArray(rows) || rows.length === 0) {
    await mysqlPool.query(
      `INSERT INTO \`${MYSQL_TABLE}\` (id, state_json) VALUES (1, ?)`,
      [JSON.stringify(defaultDb)]
    );
  }

  return mysqlPool;
};

const readDbFromMySql = async () => {
  const pool = await ensureMySqlPool();
  const [rows] = await pool.query(`SELECT state_json FROM \`${MYSQL_TABLE}\` WHERE id = 1 LIMIT 1`);
  const stateJson = Array.isArray(rows) && rows.length > 0 ? rows[0].state_json : null;
  if (!stateJson) {
    await pool.query(
      `INSERT INTO \`${MYSQL_TABLE}\` (id, state_json) VALUES (1, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
      [JSON.stringify(defaultDb)]
    );
    return normalizeDb(defaultDb);
  }

  let parsed;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    parsed = defaultDb;
  }
  return normalizeDb(parsed);
};

const writeDbToMySql = async (db) => {
  const pool = await ensureMySqlPool();
  const normalized = normalizeDb(db);
  await pool.query(
    `INSERT INTO \`${MYSQL_TABLE}\` (id, state_json) VALUES (1, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [JSON.stringify(normalized)]
  );
};

const readDb = async () => {
  if (DB_MODE === 'mysql') {
    return readDbFromMySql();
  }
  return readDbFromJsonFile();
};

const writeDb = async (db) => {
  if (DB_MODE === 'mysql') {
    await writeDbToMySql(db);
    return;
  }
  writeDbToJsonFile(db);
};

const stripPassword = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const normalizeRole = (role) => {
  if (role === 'Admin' || role === 'Researcher' || role === 'Visitor') return role;
  return 'Researcher';
};

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization token.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }

  const db = await readDb();
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ message: 'User not found for active session.' });
  }

  req.authToken = token;
  req.authUser = user;
  req.authCanViewConfidential = user.role === 'Admin' || session.confidentialAccess === true;
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.authUser || req.authUser.role !== 'Admin') {
    return res.status(403).json({ message: 'Administrator access required.' });
  }
  next();
};

const requireTierOneAdmin = (req, res, next) => {
  if (!req.authUser || req.authUser.role !== 'Admin' || req.authUser.adminTier !== 1) {
    return res.status(403).json({ message: 'Primary Admin access required.' });
  }
  next();
};

const createHistoryEntry = (operation, version, modifiedBy, previousState, expectedVersion, mergeMeta = {}) => ({
  changeId: crypto.randomUUID(),
  operation,
  version,
  timestamp: new Date().toISOString(),
  modifiedBy,
  expectedVersion,
  mergeApplied: Boolean(mergeMeta.mergeApplied),
  mergedFields: Array.isArray(mergeMeta.mergedFields) ? mergeMeta.mergedFields : undefined,
  conflictFields: Array.isArray(mergeMeta.conflictFields) ? mergeMeta.conflictFields : undefined,
  previousState
});

const SUBJECT_SYSTEM_FIELDS = new Set(['id', 'version', 'history', 'createdAt', 'updatedAt', 'lastModifiedBy', 'isDeleted']);
const PROTOCOL_SYSTEM_FIELDS = new Set(['id', 'version', 'history', 'createdAt', 'updatedAt', 'createdBy', 'lastModifiedBy', 'isDeleted']);

const valueEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const tryThreeWayMerge = (current, safeUpdates, baseState, systemFields = SUBJECT_SYSTEM_FIELDS) => {
  if (!baseState || typeof baseState !== 'object') {
    return { canMerge: false, conflictFields: [], mergedFields: [] };
  }

  const updateKeys = Object.keys(safeUpdates || {}).filter((key) => !systemFields.has(key));
  const clientChangedFields = updateKeys.filter((key) => !valueEqual(safeUpdates[key], baseState[key]));
  const serverChangedFields = Object.keys(current || {})
    .filter((key) => !systemFields.has(key))
    .filter((key) => !valueEqual(current[key], baseState[key]));

  const serverChangedSet = new Set(serverChangedFields);
  const conflictFields = clientChangedFields.filter((key) => serverChangedSet.has(key));
  if (conflictFields.length > 0) {
    return { canMerge: false, conflictFields, mergedFields: [] };
  }

  const mergedState = { ...current };
  clientChangedFields.forEach((key) => {
    mergedState[key] = safeUpdates[key];
  });

  return { canMerge: true, mergedState, conflictFields: [], mergedFields: clientChangedFields };
};

const sanitizeSubjectForUser = (subject, canViewConfidential) => {
  if (canViewConfidential) return subject;
  return {
    ...subject,
    real_name: undefined,
    contact_info: undefined
  };
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'biomechbase-api', dbMode: DB_MODE });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const db = await readDb();

  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: 'Account is pending approval.' });
  }

  const confidentialAccess = user.role === 'Admin';

  user.lastLogin = new Date().toISOString();
  if (user.role === 'Researcher' && !user.firstLoginCompleted) {
    user.firstLoginCompleted = true;
  }
  await writeDb(db);

  for (const [token, session] of sessions.entries()) {
    if (session.userId === user.id) {
      sessions.delete(token);
    }
  }

  const sessionToken = crypto.randomUUID();
  sessions.set(sessionToken, {
    userId: user.id,
    confidentialAccess,
    createdAt: new Date().toISOString()
  });

  return res.json({
    ...stripPassword(user),
    confidentialAccess,
    sessionToken
  });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  sessions.delete(req.authToken);
  res.status(204).send();
});

app.get('/api/auth/admins', async (_req, res) => {
  const db = await readDb();
  const admins = db.users
    .filter((u) => u.role === 'Admin' && u.isActive)
    .map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      adminTier: u.adminTier
    }));
  res.json(admins);
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, fullName, email, role, requestedAdminId } = req.body || {};
  const db = await readDb();
  const normalizedRole = normalizeRole(role);

  if (!username || !password || !fullName || !email) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  if (normalizedRole !== 'Admin' && normalizedRole !== 'Researcher') {
    return res.status(400).json({ message: 'Only Admin or Researcher registration is supported.' });
  }

  if (String(password).trim().length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ message: 'Username already taken.' });
  }

  if (!requestedAdminId) {
    return res.status(400).json({ message: 'Registration requires selecting an Admin account for approval.' });
  }

  const assignedAdmin = db.users.find((u) => u.id === requestedAdminId && u.role === 'Admin' && u.isActive);
  if (!assignedAdmin) {
    return res.status(400).json({ message: 'Selected Admin account was not found.' });
  }

  if (normalizedRole === 'Admin' && assignedAdmin.adminTier !== 1) {
    return res.status(400).json({ message: 'Admin registration must be assigned to a Primary Admin.' });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    password,
    fullName,
    email,
    role: normalizedRole,
    isActive: false,
    lastLogin: null,
    adminTier: normalizedRole === 'Admin' ? 2 : undefined,
    firstLoginCompleted: normalizedRole === 'Admin',
    assignedAdminId: assignedAdmin?.id,
    assignedAdminUsername: assignedAdmin?.username
  };

  db.users.push(user);
  await writeDb(db);
  return res.status(201).json(stripPassword(user));
});

app.get('/api/users', requireAuth, requireTierOneAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.users.map(stripPassword));
});

app.post('/api/users', requireAuth, requireTierOneAdmin, async (req, res) => {
  const { username, fullName, email, role, isActive, password } = req.body || {};
  const db = await readDb();
  const normalizedRole = normalizeRole(role);

  if (!username || !fullName || !email || !role || !password) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  if (String(password).trim().length < 8) {
    return res.status(400).json({ message: 'Temporary password must be at least 8 characters.' });
  }

  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ message: 'Username already exists.' });
  }

  const newUser = {
    id: crypto.randomUUID(),
    username,
    fullName,
    email,
    role: normalizedRole,
    isActive: Boolean(isActive),
    password,
    lastLogin: null,
    firstLoginCompleted: normalizedRole === 'Researcher' ? false : true,
    adminTier: normalizedRole === 'Admin' ? 2 : undefined,
    assignedAdminId: normalizedRole === 'Researcher' ? req.authUser.id : undefined,
    assignedAdminUsername: normalizedRole === 'Researcher' ? req.authUser.username : undefined
  };

  db.users.push(newUser);
  await writeDb(db);
  res.status(201).json(stripPassword(newUser));
});

app.put('/api/users/:id', requireAuth, requireTierOneAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  const db = await readDb();
  const index = db.users.findIndex((u) => u.id === id);

  if (index === -1) return res.status(404).json({ message: 'User not found' });

  if (db.users[index].role === 'Admin' && updates.role && updates.role !== 'Admin') {
    const adminCount = db.users.filter((u) => u.role === 'Admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ message: 'Cannot modify the last Administrator.' });
    }
  }

  if (updates.adminTier === 1) {
    return res.status(400).json({ message: 'Primary Admin cannot be created or assigned.' });
  }

  if (db.users[index].role === 'Admin' && db.users[index].adminTier === 1) {
    return res.status(400).json({ message: 'Primary Admin profile cannot be modified from this endpoint.' });
  }

  const safeUpdates = { ...updates };
  if (safeUpdates.role && safeUpdates.role !== 'Admin') {
    delete safeUpdates.adminTier;
  }

  if (safeUpdates.role === 'Admin' && safeUpdates.adminTier === undefined) {
    safeUpdates.adminTier = 2;
  }

  db.users[index] = { ...db.users[index], ...safeUpdates, id: db.users[index].id };
  await writeDb(db);
  res.json(stripPassword(db.users[index]));
});

app.post('/api/users/:id/reset-password', requireAuth, requireTierOneAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  const db = await readDb();
  const index = db.users.findIndex((u) => u.id === id);

  if (index === -1) return res.status(404).json({ message: 'User not found' });
  if (!password || String(password).trim().length < 8) {
    return res.status(400).json({ message: 'Temporary password must be at least 8 characters.' });
  }

  db.users[index].password = String(password).trim();
  if (db.users[index].role === 'Researcher') {
    db.users[index].firstLoginCompleted = false;
  }

  await writeDb(db);
  return res.json(stripPassword(db.users[index]));
});

app.delete('/api/users/:id', requireAuth, requireTierOneAdmin, async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const target = db.users.find((u) => u.id === id);

  if (!target) return res.status(404).json({ message: 'User not found' });

  if (target.role === 'Admin') {
    const adminCount = db.users.filter((u) => u.role === 'Admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ message: 'Cannot delete the last Administrator.' });
    }
  }

  db.users = db.users.filter((u) => u.id !== id);
  await writeDb(db);
  res.status(204).send();
});

app.get('/api/subjects', requireAuth, async (req, res) => {
  const { deleted } = req.query;
  const db = await readDb();
  const canViewConfidential = req.authCanViewConfidential;

  if (deleted === 'true') {
    return res.json(db.subjects.filter((s) => s.isDeleted).map((s) => sanitizeSubjectForUser(s, canViewConfidential)));
  }

  if (deleted === 'false') {
    return res.json(db.subjects.filter((s) => !s.isDeleted).map((s) => sanitizeSubjectForUser(s, canViewConfidential)));
  }

  return res.json(db.subjects.map((s) => sanitizeSubjectForUser(s, canViewConfidential)));
});

app.get('/api/study-protocols', requireAuth, async (req, res) => {
  const { deleted } = req.query;
  const db = await readDb();

  let protocols = [...db.studyProtocols];
  if (deleted === 'true') {
    protocols = protocols.filter((protocol) => protocol.isDeleted);
  } else if (deleted === 'false' || deleted === undefined) {
    protocols = protocols.filter((protocol) => !protocol.isDeleted);
  }

  protocols = protocols.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json(protocols);
});

app.post('/api/study-protocols', requireAuth, async (req, res) => {
  if (req.authUser?.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Admin can create or edit study protocols.' });
  }

  const { data } = req.body || {};
  const db = await readDb();

  const projectName = String(data?.projectName || '').trim();
  const projectId = String(data?.projectId || '').trim();
  const executionTime = String(data?.executionTime || '').trim();
  const notes = String(data?.notes || '').trim();
  const ethicalApproval = data?.ethicalApproval;

  if (!projectName || !projectId || !executionTime) {
    return res.status(400).json({ message: 'projectName, projectId and executionTime are required.' });
  }

  if (db.studyProtocols.some((protocol) => String(protocol.projectId || '').toLowerCase() === projectId.toLowerCase())) {
    return res.status(400).json({ message: `Project ID ${projectId} already exists.` });
  }

  const ethicalValidation = validateEthicalApprovalPayload(ethicalApproval);
  if (!ethicalValidation.ok) {
    return res.status(400).json({ message: ethicalValidation.message });
  }

  const now = new Date().toISOString();
  const newProtocol = {
    id: crypto.randomUUID(),
    projectName,
    projectId,
    executionTime,
    notes,
    ethicalApproval: ethicalValidation.normalized
      ? {
          fileName: ethicalValidation.normalized.fileName,
          mimeType: ethicalValidation.normalized.mimeType,
          dataUrl: ethicalValidation.normalized.dataUrl,
          uploadedAt: now
        }
      : undefined,
    isDeleted: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: req.authUser?.username || 'System',
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      createHistoryEntry('CREATE', 1, req.authUser?.username || 'System', {}, 0)
    ]
  };

  db.studyProtocols.push(newProtocol);
  await writeDb(db);
  res.status(201).json(newProtocol);
});

app.put('/api/study-protocols/:id', requireAuth, async (req, res) => {
  if (req.authUser?.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Admin can create or edit study protocols.' });
  }

  const { id } = req.params;
  const { updates, baseState } = req.body || {};
  const db = await readDb();
  const index = db.studyProtocols.findIndex((protocol) => protocol.id === id && !protocol.isDeleted);
  if (index === -1) {
    return res.status(404).json({ message: 'Study protocol not found.' });
  }

  const current = db.studyProtocols[index];
  const safeUpdates = { ...(updates || {}) };
  PROTOCOL_SYSTEM_FIELDS.forEach((field) => {
    delete safeUpdates[field];
  });

  if (safeUpdates.ethicalApproval) {
    const ethicalValidation = validateEthicalApprovalPayload(safeUpdates.ethicalApproval);
    if (!ethicalValidation.ok) {
      return res.status(400).json({ message: ethicalValidation.message });
    }
    safeUpdates.ethicalApproval = {
      ...ethicalValidation.normalized,
      uploadedAt: new Date().toISOString()
    };
  }

  const expectedVersion = Number((updates || {}).version);
  if (!Number.isNaN(expectedVersion) && expectedVersion !== Number(current.version)) {
    const mergeResult = tryThreeWayMerge(current, safeUpdates, baseState, PROTOCOL_SYSTEM_FIELDS);
    if (!mergeResult.canMerge) {
      return res.status(409).json({
        message: `Version conflict detected. Current version is v${current.version}. Please reload before saving.`,
        conflictFields: mergeResult.conflictFields
      });
    }

    const mergedState = mergeResult.mergedState;
    const projectName = String(mergedState.projectName || '').trim();
    const projectId = String(mergedState.projectId || '').trim();
    const executionTime = String(mergedState.executionTime || '').trim();
    if (!projectName || !projectId || !executionTime) {
      return res.status(400).json({ message: 'projectName, projectId and executionTime are required.' });
    }

    if (db.studyProtocols.some((protocol) => protocol.id !== id && !protocol.isDeleted && String(protocol.projectId || '').toLowerCase() === projectId.toLowerCase())) {
      return res.status(400).json({ message: `Project ID ${projectId} already exists.` });
    }

    const nextVersion = Number(current.version || 1) + 1;
    const historyEntry = createHistoryEntry(
      'UPDATE',
      nextVersion,
      req.authUser?.username || 'System',
      { ...current },
      Number.isNaN(expectedVersion) ? undefined : expectedVersion,
      { mergeApplied: true, mergedFields: mergeResult.mergedFields, conflictFields: [] }
    );

    const updated = {
      ...mergedState,
      id: current.id,
      projectName,
      projectId,
      executionTime,
      notes: String(mergedState.notes || '').trim(),
      version: nextVersion,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: req.authUser?.username || 'System',
      history: [...(Array.isArray(current.history) ? current.history : []), historyEntry]
    };

    db.studyProtocols[index] = updated;
    await writeDb(db);
    return res.json({ ...updated, mergeApplied: true, mergedFields: mergeResult.mergedFields });
  }

  const merged = { ...current, ...safeUpdates };
  const projectName = String(merged.projectName || '').trim();
  const projectId = String(merged.projectId || '').trim();
  const executionTime = String(merged.executionTime || '').trim();
  if (!projectName || !projectId || !executionTime) {
    return res.status(400).json({ message: 'projectName, projectId and executionTime are required.' });
  }

  if (db.studyProtocols.some((protocol) => protocol.id !== id && !protocol.isDeleted && String(protocol.projectId || '').toLowerCase() === projectId.toLowerCase())) {
    return res.status(400).json({ message: `Project ID ${projectId} already exists.` });
  }

  const nextVersion = Number(current.version || 1) + 1;
  const historyEntry = createHistoryEntry(
    'UPDATE',
    nextVersion,
    req.authUser?.username || 'System',
    { ...current },
    Number.isNaN(expectedVersion) ? undefined : expectedVersion
  );

  const updated = {
    ...merged,
    id: current.id,
    projectName,
    projectId,
    executionTime,
    notes: String(merged.notes || '').trim(),
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [...(Array.isArray(current.history) ? current.history : []), historyEntry]
  };

  db.studyProtocols[index] = updated;
  await writeDb(db);
  return res.json(updated);
});

app.post('/api/study-protocols/:id/soft-delete', requireAuth, async (req, res) => {
  if (req.authUser?.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Admin can create or edit study protocols.' });
  }

  const { id } = req.params;
  const { expectedVersion } = req.body || {};
  const db = await readDb();
  const index = db.studyProtocols.findIndex((protocol) => protocol.id === id && !protocol.isDeleted);
  if (index === -1) {
    return res.status(404).json({ message: 'Study protocol not found.' });
  }

  const current = db.studyProtocols[index];
  const expected = Number(expectedVersion);
  if (!Number.isNaN(expected) && expected !== Number(current.version)) {
    return res.status(409).json({
      message: `Version conflict detected. Current version is v${current.version}. Please reload before deleting.`
    });
  }

  const nextVersion = Number(current.version || 1) + 1;
  db.studyProtocols[index] = {
    ...current,
    isDeleted: true,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      ...(Array.isArray(current.history) ? current.history : []),
      createHistoryEntry('SOFT_DELETE', nextVersion, req.authUser?.username || 'System', { ...current }, Number.isNaN(expected) ? undefined : expected)
    ]
  };

  await writeDb(db);
  return res.status(204).send();
});

app.post('/api/study-protocols/:id/restore', requireAuth, async (req, res) => {
  if (req.authUser?.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Admin can create or edit study protocols.' });
  }

  const { id } = req.params;
  const { expectedVersion } = req.body || {};
  const db = await readDb();
  const index = db.studyProtocols.findIndex((protocol) => protocol.id === id && protocol.isDeleted);
  if (index === -1) {
    return res.status(404).json({ message: 'Study protocol not found.' });
  }

  const current = db.studyProtocols[index];
  const expected = Number(expectedVersion);
  if (!Number.isNaN(expected) && expected !== Number(current.version)) {
    return res.status(409).json({
      message: `Version conflict detected. Current version is v${current.version}. Please reload before restoring.`
    });
  }

  const nextVersion = Number(current.version || 1) + 1;
  db.studyProtocols[index] = {
    ...current,
    isDeleted: false,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      ...(Array.isArray(current.history) ? current.history : []),
      createHistoryEntry('RESTORE', nextVersion, req.authUser?.username || 'System', { ...current }, Number.isNaN(expected) ? undefined : expected)
    ]
  };

  await writeDb(db);
  return res.status(204).send();
});

app.post('/api/subjects', requireAuth, async (req, res) => {
  const { data } = req.body || {};
  const db = await readDb();

  if (!data?.subject_id) {
    return res.status(400).json({ message: 'subject_id is required.' });
  }

  if (db.subjects.some((s) => s.subject_id === data.subject_id)) {
    return res.status(400).json({ message: `Subject ID ${data.subject_id} already exists.` });
  }

  const now = new Date().toISOString();
  const safeData = { ...(data || {}) };
  const sourceImages = Object.prototype.hasOwnProperty.call(safeData, 'staticImages')
    ? safeData.staticImages
    : safeData.staticImage;
  const imagesValidation = validateSubjectStaticImagesPayload(sourceImages);
  if (!imagesValidation.ok) {
    return res.status(400).json({ message: imagesValidation.message });
  }
  safeData.staticImages = Array.isArray(imagesValidation.normalized)
    ? imagesValidation.normalized.map((image) => ({ ...image, uploadedAt: now }))
    : [];
  delete safeData.staticImage;

  const newSubject = {
    ...safeData,
    id: crypto.randomUUID(),
    isDeleted: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      createHistoryEntry(
        'CREATE',
        1,
        req.authUser?.username || 'System',
        {},
        0
      )
    ]
  };

  db.subjects.push(newSubject);
  await writeDb(db);
  res.status(201).json(newSubject);
});

app.put('/api/subjects/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { updates, baseState } = req.body || {};
  const db = await readDb();
  const index = db.subjects.findIndex((s) => s.id === id);

  if (index === -1) return res.status(404).json({ message: 'Record not found' });

  const current = db.subjects[index];
  const safeUpdates = { ...(updates || {}) };
  delete safeUpdates.version;
  if (!req.authCanViewConfidential && req.authUser?.role === 'Researcher') {
    delete safeUpdates.real_name;
    delete safeUpdates.contact_info;
  }

  const hasStaticImages = Object.prototype.hasOwnProperty.call(safeUpdates, 'staticImages');
  const hasLegacyStaticImage = Object.prototype.hasOwnProperty.call(safeUpdates, 'staticImage');
  if (hasStaticImages || hasLegacyStaticImage) {
    const sourceImages = hasStaticImages ? safeUpdates.staticImages : safeUpdates.staticImage;
    const imagesValidation = validateSubjectStaticImagesPayload(sourceImages);
    if (!imagesValidation.ok) {
      return res.status(400).json({ message: imagesValidation.message });
    }

    if (imagesValidation.normalized === null) {
      safeUpdates.staticImages = null;
    } else {
      safeUpdates.staticImages = (imagesValidation.normalized || []).map((image) => ({
        ...image,
        uploadedAt: new Date().toISOString()
      }));
    }
    delete safeUpdates.staticImage;
  }

  const expectedVersion = Number((updates || {}).version);
  if (!Number.isNaN(expectedVersion) && expectedVersion !== Number(current.version)) {
    const mergeResult = tryThreeWayMerge(current, safeUpdates, baseState);
    if (!mergeResult.canMerge) {
      return res.status(409).json({
        message: `Version conflict detected. Current version is v${current.version}. Please reload before saving.`,
        conflictFields: mergeResult.conflictFields
      });
    }

    const nextVersion = Number(current.version || 1) + 1;
    const historyEntry = createHistoryEntry(
      'UPDATE',
      nextVersion,
      req.authUser?.username || 'System',
      { ...current },
      Number.isNaN(expectedVersion) ? undefined : expectedVersion,
      { mergeApplied: true, mergedFields: mergeResult.mergedFields, conflictFields: [] }
    );

    const mergedUpdated = {
      ...mergeResult.mergedState,
      id: current.id,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: req.authUser?.username || 'System',
      history: [...(Array.isArray(current.history) ? current.history : []), historyEntry]
    };
    if (mergedUpdated.staticImages === null) {
      mergedUpdated.staticImages = [];
    }

    db.subjects[index] = mergedUpdated;
    await writeDb(db);
    return res.json({ ...mergedUpdated, mergeApplied: true, mergedFields: mergeResult.mergedFields });
  }

  const nextVersion = Number(current.version || 1) + 1;
  const historyEntry = createHistoryEntry(
    'UPDATE',
    nextVersion,
    req.authUser?.username || 'System',
    { ...current },
    Number.isNaN(expectedVersion) ? undefined : expectedVersion
  );

  const updated = {
    ...current,
    ...safeUpdates,
    id: current.id,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [...(Array.isArray(current.history) ? current.history : []), historyEntry]
  };
  if (updated.staticImages === null) {
    updated.staticImages = [];
  }

  db.subjects[index] = updated;
  await writeDb(db);
  res.json(updated);
});

app.post('/api/subjects/:id/soft-delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { expectedVersion } = req.body || {};
  const db = await readDb();
  const index = db.subjects.findIndex((s) => s.id === id);

  if (index === -1) return res.status(404).json({ message: 'Record not found' });

  const current = db.subjects[index];
  const expected = Number(expectedVersion);
  if (!Number.isNaN(expected) && expected !== Number(current.version)) {
    return res.status(409).json({
      message: `Version conflict detected. Current version is v${current.version}. Please reload before deleting.`
    });
  }

  const nextVersion = Number(current.version || 1) + 1;
  db.subjects[index] = {
    ...db.subjects[index],
    isDeleted: true,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      ...(Array.isArray(current.history) ? current.history : []),
      createHistoryEntry(
        'SOFT_DELETE',
        nextVersion,
        req.authUser?.username || 'System',
        { ...current },
        Number.isNaN(expected) ? current.version : expected
      )
    ]
  };

  await writeDb(db);
  res.status(204).send();
});

app.post('/api/subjects/:id/restore', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { expectedVersion } = req.body || {};
  const db = await readDb();
  const index = db.subjects.findIndex((s) => s.id === id);

  if (index === -1) return res.status(404).json({ message: 'Record not found' });

  const current = db.subjects[index];
  const expected = Number(expectedVersion);
  if (!Number.isNaN(expected) && expected !== Number(current.version)) {
    return res.status(409).json({
      message: `Version conflict detected. Current version is v${current.version}. Please reload before restoring.`
    });
  }

  const nextVersion = Number(current.version || 1) + 1;
  db.subjects[index] = {
    ...db.subjects[index],
    isDeleted: false,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: req.authUser?.username || 'System',
    history: [
      ...(Array.isArray(current.history) ? current.history : []),
      createHistoryEntry(
        'RESTORE',
        nextVersion,
        req.authUser?.username || 'System',
        { ...current },
        Number.isNaN(expected) ? current.version : expected
      )
    ]
  };

  await writeDb(db);
  res.status(204).send();
});

app.delete('/api/subjects/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  db.subjects = db.subjects.filter((s) => s.id !== id);
  await writeDb(db);
  res.status(204).send();
});

app.get('/api/backup/export', requireAuth, requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json({
    meta: { timestamp: new Date().toISOString(), version: '1.0', app: 'BiomechBase' },
    data: {
      subjects: db.subjects,
      studyProtocols: db.studyProtocols,
      users: db.users
    }
  });
});

app.post('/api/backup/import', requireAuth, requireAdmin, async (req, res) => {
  const payload = req.body || {};
  if (!payload.meta || !payload.data || !Array.isArray(payload.data.subjects)) {
    return res.status(400).json({ message: 'Invalid format' });
  }

  const db = await readDb();
  db.subjects = payload.data.subjects;
  db.studyProtocols = Array.isArray(payload.data.studyProtocols) ? payload.data.studyProtocols : [];
  if (Array.isArray(payload.data.users)) {
    db.users = payload.data.users;
  }

  await writeDb(db);
  res.status(204).send();
});

const startServer = async () => {
  try {
    await readDb();
    app.listen(PORT, () => {
      console.log(`[biomechbase-api] listening on http://localhost:${PORT} (db: ${DB_MODE})`);
    });
  } catch (error) {
    console.error('[biomechbase-api] failed to initialize database:', error);
    process.exit(1);
  }
};

startServer();
