import { NextResponse } from 'next/server';
import { getLocalAuthStatus, saveLocalAppPasswords } from '../../../../lib/local-auth';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json(getLocalAuthStatus(), {
    headers: {
      'cache-control': 'no-store'
    }
  });
}

export async function PUT(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword.trim() : '';
    const operatorPassword = typeof body?.operatorPassword === 'string' ? body.operatorPassword.trim() : '';

    if (!adminPassword && !operatorPassword) {
      return NextResponse.json({ error: 'Enter at least one password to update.' }, { status: 400 });
    }

    if (adminPassword && adminPassword.length < 4) {
      return NextResponse.json({ error: 'Admin password must be at least 4 characters.' }, { status: 400 });
    }

    if (operatorPassword && operatorPassword.length < 4) {
      return NextResponse.json({ error: 'Operator password must be at least 4 characters.' }, { status: 400 });
    }

    const status = saveLocalAppPasswords({
      adminPassword: adminPassword || null,
      operatorPassword: operatorPassword || null
    });

    return NextResponse.json({
      status,
      message: [
        adminPassword ? 'Admin password updated.' : null,
        operatorPassword ? 'Operator password updated.' : null
      ].filter(Boolean).join(' ')
    }, {
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update portal passwords.' }, { status: 500 });
  }
}
