import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const verifySchema = z.object({
    razorpaySubscriptionId: z.string(),
    razorpayPaymentId: z.string().optional(),
    razorpaySignature: z.string().optional(),
});

// ─────────────────────────────────────────────────────────
// MOCK: This would verify the Razorpay payment signature
// Replace with real signature verification when integrating
// ─────────────────────────────────────────────────────────
function mockVerifyRazorpaySignature(subscriptionId: string, paymentId?: string, signature?: string): boolean {
    // In production, this would use crypto.createHmac('sha256', secret)
    // to verify the Razorpay webhook signature
    console.log(`[MOCK] Verifying payment for subscription: ${subscriptionId}`);
    return true; // Always passes in mock mode
}

// POST /api/subscription/verify — verify payment and activate subscription
export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { razorpaySubscriptionId, razorpayPaymentId, razorpaySignature } = verifySchema.parse(body);

        // Mock signature verification (skip for now)
        const isValid = mockVerifyRazorpaySignature(razorpaySubscriptionId, razorpayPaymentId, razorpaySignature);

        if (!isValid) {
            return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
        }

        // Find the subscription
        const existing = await prisma.subscription.findUnique({
            where: { businessId: user.businessId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }

        // Calculate end date based on interval
        const now = new Date();
        const endsAt = new Date(now);
        if (existing.interval === "year") {
            endsAt.setFullYear(endsAt.getFullYear() + 1);
        } else {
            endsAt.setMonth(endsAt.getMonth() + 1);
        }

        // Activate the subscription
        const subscription = await prisma.subscription.update({
            where: { businessId: user.businessId },
            data: {
                status: "active",
                endsAt,
            },
        });

        return NextResponse.json({
            data: {
                plan: subscription.plan,
                status: subscription.status,
                endsAt: subscription.endsAt,
            },
            message: "Subscription activated successfully!",
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("Subscription Verify error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
