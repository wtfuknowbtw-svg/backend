import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse, checkPlan } from "@/middleware/auth";
import { neonDb } from "@/lib/neon-db";
import { z } from "zod";
import { generateToken } from "@/lib/jwt";

/**
 * POST /api/subscription/upgrade
 * Upgrades or downgrades subscription plan
 * 
 * Body:
 * {
 *   plan: 'free' | 'pro' | 'business'
 * }
 * 
 * Response:
 * {
 *   data: {
 *     success: boolean,
 *     newPlan: 'free' | 'pro' | 'business',
 *     previousPlan: 'free' | 'pro' | 'business',
 *     message: string,
 *     newToken?: string // New JWT with updated plan
 *   }
 * }
 */
const upgradeSchema = z.object({
    plan: z.enum(['free', 'pro', 'business'])
});

export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { plan: newPlan } = upgradeSchema.parse(body);

        // Prevent downgrades from business to pro/free if they have staff accounts
        if (user.plan === 'business' && (newPlan === 'pro' || newPlan === 'free')) {
            // In a real implementation, you'd check for existing staff accounts here
            // For now, we'll allow the downgrade but could add this check later
            console.warn('Downgrading from business plan - staff accounts may be affected');
        }

        // Update the business plan in database
        const updatedBusiness = await neonDb.updateBusinessPlan(user.businessId, newPlan);
        
        if (!updatedBusiness) {
            return NextResponse.json({ 
                error: "Failed to update subscription plan" 
            }, { status: 500 });
        }

        // Generate new JWT token with updated plan
        const newToken = generateToken(user.businessId, user.phone, newPlan);

        const response = {
            data: {
                success: true,
                newPlan: newPlan,
                previousPlan: user.plan,
                message: `Successfully ${getPlanChangeMessage(user.plan, newPlan)}`,
                newToken: newToken,
                features: getPlanFeatures(newPlan)
            }
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error("Subscription upgrade error:", error);
        
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        
        return NextResponse.json({ 
            error: "Failed to update subscription plan" 
        }, { status: 500 });
    }
}

/**
 * Helper function to get appropriate plan change message
 */
function getPlanChangeMessage(fromPlan: string, toPlan: string): string {
    const planHierarchy = { 'free': 0, 'pro': 1, 'business': 2 };
    const fromLevel = planHierarchy[fromPlan as keyof typeof planHierarchy];
    const toLevel = planHierarchy[toPlan as keyof typeof planHierarchy];
    
    if (toLevel > fromLevel) {
        return `upgraded to ${toPlan} plan`;
    } else if (toLevel < fromLevel) {
        return `downgraded to ${toPlan} plan`;
    } else {
        return `updated to ${toPlan} plan`;
    }
}

/**
 * Helper function to get plan features
 */
function getPlanFeatures(plan: 'free' | 'pro' | 'business') {
    const features = {
        'free': {
            transactions: { limit: 50, description: 'Maximum 50 transactions' },
            customers: { limit: 10, description: 'Maximum 10 customers' },
            aiFeatures: { enabled: false, description: 'AI OCR and voice features not available' },
            multipleStaff: { enabled: false, description: 'Single staff account only' }
        },
        'pro': {
            transactions: { limit: 'unlimited', description: 'Unlimited transactions' },
            customers: { limit: 'unlimited', description: 'Unlimited customers' },
            aiFeatures: { enabled: true, description: 'AI OCR and voice features available' },
            multipleStaff: { enabled: false, description: 'Single staff account only' }
        },
        'business': {
            transactions: { limit: 'unlimited', description: 'Unlimited transactions' },
            customers: { limit: 'unlimited', description: 'Unlimited customers' },
            aiFeatures: { enabled: true, description: 'AI OCR and voice features available' },
            multipleStaff: { enabled: true, description: 'Multiple staff accounts supported' }
        }
    };
    
    return features[plan];
}

/**
 * GET /api/subscription/upgrade
 * Returns available upgrade options and pricing information
 * 
 * Response:
 * {
 *   data: {
 *     currentPlan: 'free' | 'pro' | 'business',
 *     availablePlans: [
 *       {
 *         plan: 'free' | 'pro' | 'business',
 *         name: string,
 *         description: string,
 *         price: string,
 *         features: object,
 *         isCurrentPlan: boolean,
 *         canUpgrade: boolean
 *       }
 *     ]
 *   }
 * }
 */
export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const planInfo = [
            {
                plan: 'free',
                name: 'Free Plan',
                description: 'Perfect for small businesses getting started',
                price: '$0/month',
                features: {
                    transactions: '50 transactions',
                    customers: '10 customers',
                    aiFeatures: 'No AI features',
                    staff: 'Single staff account'
                },
                isCurrentPlan: user.plan === 'free',
                canUpgrade: user.plan === 'free'
            },
            {
                plan: 'pro',
                name: 'Pro Plan',
                description: 'For growing businesses that need more power',
                price: '$19/month',
                features: {
                    transactions: 'Unlimited transactions',
                    customers: 'Unlimited customers',
                    aiFeatures: 'AI OCR + voice features',
                    staff: 'Single staff account'
                },
                isCurrentPlan: user.plan === 'pro',
                canUpgrade: user.plan === 'free' || user.plan === 'pro'
            },
            {
                plan: 'business',
                name: 'Business Plan',
                description: 'For established businesses with teams',
                price: '$49/month',
                features: {
                    transactions: 'Unlimited transactions',
                    customers: 'Unlimited customers',
                    aiFeatures: 'AI OCR + voice features',
                    staff: 'Multiple staff accounts'
                },
                isCurrentPlan: user.plan === 'business',
                canUpgrade: true // Everyone can upgrade to business
            }
        ];

        return NextResponse.json({
            data: {
                currentPlan: user.plan,
                availablePlans: planInfo
            }
        });

    } catch (error) {
        console.error("Subscription upgrade options error:", error);
        return NextResponse.json({ 
            error: "Failed to fetch upgrade options" 
        }, { status: 500 });
    }
}
