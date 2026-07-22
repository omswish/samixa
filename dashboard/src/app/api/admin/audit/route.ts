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

    return NextResponse.json(payload, {
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load audit records.' }, { status: 500 });
  }
}
