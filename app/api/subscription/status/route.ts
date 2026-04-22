import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { neonDb } from "@/lib/neon-db";

/**
 * GET /api/subscription/status
 * Returns current subscription plan and usage statistics
 * 
 * Response:
 * {
 *   data: {
 *     plan: 'free' | 'pro' | 'business',
 *     usage: {
 *       transactions: {
 *         current: number,
 *         limit: number,
 *         remaining: number
 *       },
 *       customers: {
 *         current: number,
 *         limit: number,
 *         remaining: number
 *       }
 *     },
 *     features: {
 *       aiFeatures: boolean,
 *       multipleStaff: boolean,
 *       unlimitedTransactions: boolean,
 *       unlimitedCustomers: boolean
 *     }
 *   }
 * }
 */
export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        console.log('Subscription status request for business:', user.businessId);
        
        // For now, return hardcoded data to avoid database issues
        // TODO: Replace with real database queries once database is stable
        const stats = {
            plan: 'free',
            transactionCount: 25,
            customerCount: 5
        };

        // Define plan limits and features
        const planConfig = {
            'free': {
                transactionLimit: 50,
                customerLimit: 10,
                aiFeatures: false,
                multipleStaff: false,
                unlimitedTransactions: false,
                unlimitedCustomers: false
            },
            'pro': {
                transactionLimit: Infinity,
                customerLimit: Infinity,
                aiFeatures: true,
                multipleStaff: false,
                unlimitedTransactions: true,
                unlimitedCustomers: true
            },
            'business': {
                transactionLimit: Infinity,
                customerLimit: Infinity,
                aiFeatures: true,
                multipleStaff: true,
                unlimitedTransactions: true,
                unlimitedCustomers: true
            }
        };

        const config = planConfig[user.plan];

        // Calculate remaining counts
        const transactionRemaining = config.unlimitedTransactions ? 
            Infinity : config.transactionLimit - stats.transactionCount;
        
        const customerRemaining = config.unlimitedCustomers ? 
            Infinity : config.customerLimit - stats.customerCount;

        const response = {
            data: {
                plan: user.plan,
                usage: {
                    transactions: {
                        current: stats.transactionCount,
                        limit: config.transactionLimit,
                        remaining: transactionRemaining,
                        isLimitReached: transactionRemaining <= 0
                    },
                    customers: {
                        current: stats.customerCount,
                        limit: config.customerLimit,
                        remaining: customerRemaining,
                        isLimitReached: customerRemaining <= 0
                    }
                },
                features: {
                    aiFeatures: config.aiFeatures,
                    multipleStaff: config.multipleStaff,
                    unlimitedTransactions: config.unlimitedTransactions,
                    unlimitedCustomers: config.unlimitedCustomers
                },
                limits: {
                    freePlan: {
                        transactions: 50,
                        customers: 10,
                        features: {
                            aiFeatures: false,
                            multipleStaff: false
                        }
                    },
                    proPlan: {
                        transactions: 'unlimited',
                        customers: 'unlimited',
                        features: {
                            aiFeatures: true,
                            multipleStaff: false
                        }
                    },
                    businessPlan: {
                        transactions: 'unlimited',
                        customers: 'unlimited',
                        features: {
                            aiFeatures: true,
                            multipleStaff: true
                        }
                    }
                }
            }
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error("Subscription status error:", error);
        return NextResponse.json({ 
            error: "Failed to fetch subscription status" 
        }, { status: 500 });
    }
}
