import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";

// GET /api/subscription — return current subscription for the business
export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        let subscription = await prisma.subscription.findUnique({
            where: { businessId: user.businessId },
        });

        // If no subscription exists, return a default free plan
        if (!subscription) {
            subscription = await prisma.subscription.create({
                data: {
                    businessId: user.businessId,
                    plan: "free",
                    status: "active",
                    interval: "month",
                },
            });
        }

        // Check if subscription has expired
        if (subscription.endsAt && new Date(subscription.endsAt) < new Date()) {
            subscription = await prisma.subscription.update({
                where: { id: subscription.id },
                data: { plan: "free", status: "expired" },
            });
        }

        return NextResponse.json({
            data: {
                id: subscription.id,
                plan: subscription.plan,
                status: subscription.status,
                interval: subscription.interval,
                endsAt: subscription.endsAt,
                razorpaySubscriptionId: subscription.razorpaySubscriptionId,
                createdAt: subscription.createdAt,
            },
        });
    } catch (error) {
        console.error("Subscription GET error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
