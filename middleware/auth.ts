import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt';

export interface AuthenticatedRequest extends NextRequest {
    user?: {
        businessId: string;
        phone: string;
        plan: 'free' | 'pro' | 'business';
    };
}

/**
 * Middleware to verify JWT token and attach user info to request
 * Use this in API routes that require authentication
 */
export async function verifyJWT(request: NextRequest): Promise<{
    user: { businessId: string; phone: string; plan: 'free' | 'pro' | 'business' } | null;
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
            plan: payload.plan,
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

/**
 * Helper to create a payment required response for plan upgrades
 */
export function paymentRequiredResponse(message: string = 'Plan upgrade required') {
    return NextResponse.json({ error: message }, { status: 402 });
}

/**
 * Plan hierarchy for checking upgrade requirements
 */
const PLAN_HIERARCHY = {
    'free': 0,
    'pro': 1,
    'business': 2
} as const;

/**
 * Check if user's plan meets the required minimum plan
 */
export function checkPlan(requiredPlan: 'free' | 'pro' | 'business') {
    return async (request: NextRequest): Promise<{
        user: { businessId: string; phone: string; plan: 'free' | 'pro' | 'business' } | null;
        error: string | null;
        status: number;
    }> => {
        const { user, error } = await verifyJWT(request);
        
        if (!user) {
            return {
                user: null,
                error: error || 'Unauthorized',
                status: 401
            };
        }

        // Check if user's plan meets the requirement
        const userPlanLevel = PLAN_HIERARCHY[user.plan];
        const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan];
        
        if (userPlanLevel < requiredPlanLevel) {
            return {
                user: null,
                error: `This feature requires a ${requiredPlan} plan or higher. Current plan: ${user.plan}`,
                status: 402
            };
        }

        return {
            user,
            error: null,
            status: 200
        };
    };
}

/**
 * Check if user has exceeded plan limits for transactions
 */
export async function checkTransactionLimit(businessId: string, plan: 'free' | 'pro' | 'business'): Promise<{
    canCreate: boolean;
    currentCount: number;
    limit: number;
    error: string | null;
}> {
    // Import neonDb to avoid circular dependency
    const { neonDb } = await import('@/lib/neon-db');
    
    const stats = await neonDb.getBusinessUsageStats(businessId);
    
    const limits = {
        'free': 50,
        'pro': Infinity,
        'business': Infinity
    };
    
    const limit = limits[plan];
    
    if (stats.transactionCount >= limit) {
        return {
            canCreate: false,
            currentCount: stats.transactionCount,
            limit,
            error: `Transaction limit exceeded. Current: ${stats.transactionCount}, Limit: ${limit}`
        };
    }
    
    return {
        canCreate: true,
        currentCount: stats.transactionCount,
        limit,
        error: null
    };
}

/**
 * Check if user has exceeded plan limits for customers
 */
export async function checkCustomerLimit(businessId: string, plan: 'free' | 'pro' | 'business'): Promise<{
    canCreate: boolean;
    currentCount: number;
    limit: number;
    error: string | null;
}> {
    // Import neonDb to avoid circular dependency
    const { neonDb } = await import('@/lib/neon-db');
    
    const stats = await neonDb.getBusinessUsageStats(businessId);
    
    const limits = {
        'free': 10,
        'pro': Infinity,
        'business': Infinity
    };
    
    const limit = limits[plan];
    
    if (stats.customerCount >= limit) {
        return {
            canCreate: false,
            currentCount: stats.customerCount,
            limit,
            error: `Customer limit exceeded. Current: ${stats.customerCount}, Limit: ${limit}`
        };
    }
    
    return {
        canCreate: true,
        currentCount: stats.customerCount,
        limit,
        error: null
    };
}

/**
 * Check if user has access to AI features (OCR + voice)
 */
export function hasAIFeatures(plan: 'free' | 'pro' | 'business'): boolean {
    return plan === 'pro' || plan === 'business';
}

/**
 * Check if user has access to multiple staff accounts
 */
export function hasMultipleStaff(plan: 'free' | 'pro' | 'business'): boolean {
    return plan === 'business';
}
