import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.string().optional(),
    gstin: z.string().optional(),
    ownerName: z.string().optional(),
});

// GET business profile
export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const business = await prisma.business.findUnique({
            where: { id: user.businessId },
        });

        if (!business) {
            return NextResponse.json({ error: "Business not found" }, { status: 404 });
        }

        return NextResponse.json({
            data: {
                id: business.id,
                phone: business.phone,
                name: business.name,
                ownerName: business.ownerName,
                type: business.type,
                gstin: business.gstin,
            },
        });
    } catch (error) {
        console.error("Business Profile GET error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PUT update business profile
export async function PUT(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const parsed = updateSchema.parse(body);

        const business = await prisma.business.update({
            where: { id: user.businessId },
            data: {
                ...(parsed.name !== undefined && { name: parsed.name }),
                ...(parsed.ownerName !== undefined && { ownerName: parsed.ownerName }),
                ...(parsed.type !== undefined && { type: parsed.type }),
                ...(parsed.gstin !== undefined && { gstin: parsed.gstin }),
            },
        });

        return NextResponse.json({
            data: {
                id: business.id,
                phone: business.phone,
                name: business.name,
                ownerName: business.ownerName,
                type: business.type,
                gstin: business.gstin,
            },
            message: "Business profile updated successfully",
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        console.error("Business Profile PUT error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
