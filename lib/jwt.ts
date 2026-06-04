import jwt, { Secret, SignOptions } from 'jsonwebtoken';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '365d';

export interface JWTPayload {
    businessId: string;
    phone: string;
    plan: 'free' | 'pro' | 'business';
    iat?: number;
    exp?: number;
}

/**
 * Generate a JWT token for a business user
 */
export function generateToken(businessId: string, phone: string, plan: 'free' | 'pro' | 'business'): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
        businessId,
        phone,
        plan,
    };

    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN as any,
    };

    return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        return decoded;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    
    return parts[1];
}
