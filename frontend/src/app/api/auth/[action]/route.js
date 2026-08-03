import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'insta_automation_session';
const SESSION_MAX_AGE = 60 * 60 * 8;

function getConfig() {
    const email = process.env.AUTHORIZED_LOGIN_EMAIL;
    const password = process.env.AUTHORIZED_LOGIN_PASSWORD;
    const secret = process.env.AUTH_SESSION_SECRET;

    if (!email || !password || !secret) return null;
    return { email: email.trim().toLowerCase(), password, secret };
}

function sign(value, secret) {
    return createHmac('sha256', secret).update(value).digest('base64url');
}

function createSession(email, secret) {
    const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
    return `${payload}.${sign(payload, secret)}`;
}

function readSession(request, secret) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = sign(payload, secret);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return session.expiresAt > Date.now() ? session : null;
    } catch {
        return null;
    }
}

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
};

export async function POST(request, { params }) {
    if (params.action === 'login') {
        const config = getConfig();
        if (!config) {
            return NextResponse.json({ error: 'Login ainda não configurado.' }, { status: 503 });
        }

        const { email = '', password = '' } = await request.json();
        if (email.trim().toLowerCase() !== config.email || password !== config.password) {
            return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 });
        }

        const response = NextResponse.json({ user: { email: config.email } });
        response.cookies.set(COOKIE_NAME, createSession(config.email, config.secret), cookieOptions);
        return response;
    }

    if (params.action === 'logout') {
        const response = NextResponse.json({ ok: true });
        response.cookies.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
        return response;
    }

    return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
}

export async function GET(request, { params }) {
    if (params.action !== 'session') {
        return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
    }

    const config = getConfig();
    const session = config ? readSession(request, config.secret) : null;
    if (!session || session.email !== config.email) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user: { email: session.email } });
}
