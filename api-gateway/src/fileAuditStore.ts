import fs from 'fs';
import path from 'path';
import type {
  AppActionAuditPayload,
  AppActionAuditQuery,
  AppActionAuditRecord
} from './postgres';

const DEFAULT_RUNTIME_ROOT =
  process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'ITDashboard');

const AUDIT_ROOT = path.join(DEFAULT_RUNTIME_ROOT, 'audit');
const AUDIT_FILE_PATTERN = /^app-action-audit-\d{4}-\d{2}\.jsonl$/i;

let lastIssuedAuditBase = 0;
let auditSequence = 0;

function ensureAuditRoot() {
  fs.mkdirSync(AUDIT_ROOT, { recursive: true });
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function getAuditFilePath(occurredAt: string) {
  return path.join(AUDIT_ROOT, `app-action-audit-${occurredAt.slice(0, 7)}.jsonl`);
}

function nextAuditId() {
  const base = Date.now() * 1000;
  if (base === lastIssuedAuditBase) {
    auditSequence += 1;
  } else {
    lastIssuedAuditBase = base;
    auditSequence = 0;
  }

  return base + auditSequence;
}

function listAuditFiles() {
  if (!fs.existsSync(AUDIT_ROOT)) {
    return [];
  }

  return fs.readdirSync(AUDIT_ROOT)
    .filter((name) => AUDIT_FILE_PATTERN.test(name))
    .sort((left, right) => right.localeCompare(left))
    .map((name) => path.join(AUDIT_ROOT, name));
}

function parseAuditLine(rawLine: string) {
  if (!rawLine.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawLine) as Partial<AppActionAuditRecord>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.actionType !== 'string') {
      return null;
    }

    return {
      auditId: typeof parsed.auditId === 'number' ? parsed.auditId : nextAuditId(),
      occurredAt: normalizeTimestamp(parsed.occurredAt),
      actionType: parsed.actionType.trim(),
      actionResult: parsed.actionResult === 'success' || parsed.actionResult === 'failed' || parsed.actionResult === 'denied'
        ? parsed.actionResult
        : 'failed',
      severity: parsed.severity === 'warning' || parsed.severity === 'critical' ? parsed.severity : 'info',
      actorUsername: normalizeText(parsed.actorUsername),
      actorRole: normalizeText(parsed.actorRole),
      surface: normalizeText(parsed.surface),
      sourceIp: normalizeText(parsed.sourceIp),
      userAgent: normalizeText(parsed.userAgent),
      targetType: normalizeText(parsed.targetType),
      targetId: normalizeText(parsed.targetId),
      message: normalizeText(parsed.message),
      errorMessage: normalizeText(parsed.errorMessage),
      requestSummaryJson: parsed.requestSummaryJson ?? null,
      resultSummaryJson: parsed.resultSummaryJson ?? null,
      correlationId: normalizeText(parsed.correlationId)
    } satisfies AppActionAuditRecord;
  } catch {
    return null;
  }
}

function matchesQuery(record: AppActionAuditRecord, query: AppActionAuditQuery) {
  if (query.actionType && !record.actionType.toLowerCase().includes(query.actionType.toLowerCase())) {
    return false;
  }

  if (query.actionResult && record.actionResult !== query.actionResult) {
    return false;
  }

  if (query.actorUsername) {
    const actor = record.actorUsername?.toLowerCase() || '';
    if (!actor.includes(query.actorUsername.toLowerCase())) {
      return false;
    }
  }

  if (query.surface && record.surface !== query.surface) {
    return false;
  }

  return true;
}

export function recordAppActionAuditToFile(payload: AppActionAuditPayload) {
  ensureAuditRoot();

  const occurredAt = normalizeTimestamp(payload.occurredAt);
  const record: AppActionAuditRecord = {
    auditId: nextAuditId(),
    occurredAt,
    actionType: payload.actionType.trim(),
    actionResult: payload.actionResult,
    severity: payload.severity === 'warning' || payload.severity === 'critical' ? payload.severity : 'info',
    actorUsername: normalizeText(payload.actorUsername),
    actorRole: normalizeText(payload.actorRole),
    surface: normalizeText(payload.surface),
    sourceIp: normalizeText(payload.sourceIp),
    userAgent: normalizeText(payload.userAgent),
    targetType: normalizeText(payload.targetType),
    targetId: normalizeText(payload.targetId),
    message: normalizeText(payload.message),
    errorMessage: normalizeText(payload.errorMessage),
    requestSummaryJson: payload.requestSummaryJson ?? null,
    resultSummaryJson: payload.resultSummaryJson ?? null,
    correlationId: normalizeText(payload.correlationId)
  };

  fs.appendFileSync(getAuditFilePath(occurredAt), `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function listAppActionAuditFromFiles(query: AppActionAuditQuery) {
  const rows: AppActionAuditRecord[] = [];

  for (const filePath of listAuditFiles()) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const record = parseAuditLine(line);
      if (!record || !matchesQuery(record, query)) {
        continue;
      }

      rows.push(record);
    }
  }

  rows.sort((left, right) => {
    const timeCompare = right.occurredAt.localeCompare(left.occurredAt);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return right.auditId - left.auditId;
  });

  if (query.limit && query.limit > 0) {
    return rows.slice(0, query.limit);
  }

  return rows;
}
