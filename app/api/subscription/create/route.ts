import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
    plan: z.enum(["basic", "pro"]),
    interval: z.enum(["month", "year"]),
});

// ─────────────────────────────────────────────────────────
// MOCK: This would call Razorpay API to create a subscription
// Replace this with real Razorpay SDK calls when ready
// ─────────────────────────────────────────────────────────
async function mockCreateRazorpaySubscription(plan: string, interval: string, businessId: string) {
    // In production, this would:
    // 1. Create a Razorpay customer (if not exists)
    // 2. Create a Razorpay subscription with the appropriate plan_id
    // 3. Return the subscription ID and payment link
    
    const mockSubscriptionId = `sub_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mockCustomerId = `cust_mock_${businessId.slice(0, 8)}`;

    return {
        subscriptionId: mockSubscriptionId,
        customerId: mockCustomerId,
        shortUrl: `https://rzp.io/mock/${mockSubscriptionId}`,
    };
}

// POST /api/subscription/create — create a new subscription (mock)
export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { plan, interval } = createSchema.parse(body);

        // Mock Razorpay subscription creation
        const razorpayResult = await mockCreateRazorpaySubscription(plan, interval, user.businessId);

        // Save the pending subscription to DB
        const subscription = await prisma.subscription.upsert({
            where: { businessId: user.businessId },
            update: {
                plan,
                interval,
                status: "pending",
                razorpaySubscriptionId: razorpayResult.subscriptionId,
                razorpayCustomerId: razorpayResult.customerId,
            },
            create: {
                businessId: user.businessId,
                plan,
                interval,
                status: "pending",
                razorpaySubscriptionId: razorpayResult.subscriptionId,
                razorpayCustomerId: razorpayResult.customerId,
            },
        });

        return NextResponse.json({
            data: {
                subscriptionId: razorpayResult.subscriptionId,
                shortUrl: razorpayResult.shortUrl,
                plan,
                interval,
            },
            message: "Subscription created (mock). Payment link generated.",
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("Subscription Create error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
