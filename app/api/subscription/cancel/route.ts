import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";

// POST /api/subscription/cancel — cancel subscription and revert to free
export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const existing = await prisma.subscription.findUnique({
            where: { businessId: user.businessId },
        });

        if (!existing || existing.plan === "free") {
            return NextResponse.json({ error: "No active subscription to cancel" }, { status: 400 });
        }

        // ─────────────────────────────────────────────────────────
        // MOCK: In production, this would call Razorpay API to
        // cancel the subscription: razorpay.subscriptions.cancel(id)
        // ─────────────────────────────────────────────────────────
        if (existing.razorpaySubscriptionId) {
            console.log(`[MOCK] Cancelling Razorpay subscription: ${existing.razorpaySubscriptionId}`);
        }

        const subscription = await prisma.subscription.update({
            where: { businessId: user.businessId },
            data: {
                plan: "free",
                status: "cancelled",
                razorpaySubscriptionId: null,
                endsAt: null,
            },
        });

        return NextResponse.json({
            data: {
                plan: subscription.plan,
                status: subscription.status,
            },
            message: "Subscription cancelled. You are now on the Free plan.",
        });
    } catch (error) {
        console.error("Subscription Cancel error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
