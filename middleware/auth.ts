import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt';

export interface AuthenticatedRequest extends NextRequest {
    user?: {
        businessId: string;
        phone: string;
    };
}

/**
 * Middleware to verify JWT token and attach user info to request
 * Use this in API routes that require authentication
 */
export async function verifyJWT(request: NextRequest): Promise<{
    user: { businessId: string; phone: string } | null;
    error: string | null;
}> {
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
        return {
            user: null,
            error: 'No authorization token provided',
        };
    }

    const payload = verifyToken(token);
    if (!payload) {
        return {
            user: null,
            error: 'Invalid or expired token',
        };
    }

    return {
        user: {
            businessId: payload.businessId,
            phone: payload.phone,
        },
        error: null,
    };
}

/**
 * Helper to create an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
    return NextResponse.json({ error: message }, { status: 401 });
}
