import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'profit-scout-auth';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.APP_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json(
        { error: 'Password not configured on server' },
        { status: 500 }
      );
    }

    if (password === correctPassword) {
      const cookieStore = await cookies();

      // Create a simple hash of the password for the cookie
      const authToken = Buffer.from(correctPassword).toString('base64');

      cookieStore.set(AUTH_COOKIE_NAME, authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
        path: '/'
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Incorrect password' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const correctPassword = process.env.APP_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ authenticated: false, error: 'Not configured' });
  }

  const expectedToken = Buffer.from(correctPassword).toString('base64');
  const isAuthenticated = authCookie?.value === expectedToken;

  return NextResponse.json({ authenticated: isAuthenticated });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  return NextResponse.json({ success: true });
}
