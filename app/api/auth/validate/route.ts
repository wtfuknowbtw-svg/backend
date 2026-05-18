import { NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/validate
 *
 * Validates a Bearer JWT token sent in the Authorization header.
 * Used by the mobile app on startup to decide whether to show the
 * login screen or go straight to the main tabs.
 *
 * Returns:
 *   200 { valid: true, businessId, phone, plan }  — token is valid
 *   401 { valid: false, error }                   — token missing, malformed, or expired
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('Authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
        return NextResponse.json({ valid: false, error: 'No token provided' }, { status: 401 });
    }

    const payload = verifyToken(token);

    if (!payload) {
        return NextResponse.json({ valid: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    // Optionally confirm the business still exists in the DB
    const business = await prisma.business.findUnique({
        where: { id: payload.businessId },
        select: { id: true },
    }).catch(() => null);

    if (!business) {
        return NextResponse.json({ valid: false, error: 'Business account not found' }, { status: 401 });
    }

    return NextResponse.json({
        valid: true,
        businessId: payload.businessId,
        phone: payload.phone,
        plan: payload.plan,
    });
}
