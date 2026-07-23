import { NextResponse } from 'next/server';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = serialized.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function buildAuditCsv(rows: any[]) {
  const headers = [
    'occurredAt',
    'actionType',
    'actionResult',
    'severity',
    'actorUsername',
    'actorRole',
    'surface',
    'sourceIp',
    'targetType',
    'targetId',
    'message',
    'errorMessage',
    'requestSummaryJson',
    'resultSummaryJson',
    'correlationId'
  ];

  const dataRows = rows.map((row) => headers.map((header) => escapeCsvValue(row?.[header])).join(','));
  return [headers.join(','), ...dataRows].join('\r\n');
}

function escapeHtml(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(typeof value === 'string' ? value : JSON.stringify(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAuditExcelHtml(rows: any[]) {
  const headers = [
    'occurredAt',
    'actionType',
    'actionResult',
    'severity',
    'actorUsername',
    'actorRole',
    'surface',
    'sourceIp',
    'userAgent',
    'targetType',
    'targetId',
    'message',
    'errorMessage',
    'requestSummaryJson',
    'resultSummaryJson',
    'correlationId'
  ];

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const rowHtml = rows.map((row) => (
    `<tr>${headers.map((header) => `<td>${escapeHtml(row?.[header])}</td>`).join('')}</tr>`
  )).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #c9b9a8; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f4eee6; font-weight: 700; }
    tr:nth-child(even) td { background: #fcf8f2; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
</body>
</html>`;
}

export async function GET(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    const gatewayQuery = new URLSearchParams();

    for (const key of ['actionType', 'actionResult', 'actorUsername', 'surface', 'limit']) {
      const value = url.searchParams.get(key);
      if (value) {
        gatewayQuery.set(key, value);
      }
    }

    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/audit?${gatewayQuery.toString()}`, {
      cache: 'no-store'
    });
    const body = await response.text();
    const payload = body ? JSON.parse(body) : { rows: [] };

    if (!response.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to load audit records.' }, { status: response.status });
    }

    if (format === 'csv') {
      const csv = buildAuditCsv(Array.isArray(payload.rows) ? payload.rows : []);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="itdash-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          'cache-control': 'no-store'
        }
      });
    }

    if (format === 'xls') {
      const workbookHtml = buildAuditExcelHtml(Array.isArray(payload.rows) ? payload.rows : []);
      return new NextResponse(workbookHtml, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.ms-excel; charset=utf-8',
          'content-disposition': `attachment; filename="itdash-audit-${new Date().toISOString().slice(0, 10)}.xls"`,
          'cache-control': 'no-store'
        }
      });
    }

    return NextResponse.json(payload, {
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load audit records.' }, { status: 500 });
  }
}
