import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse, checkCustomerLimit, paymentRequiredResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const customerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
});

const customerUpdateSchema = z.object({
    id: z.string().min(1, "Customer ID is required"),
    name: z.string().min(1, "Name is required").optional(),
    phone: z.string().optional().nullable(),
});

// This endpoint handles both listing all customers and getting a specific one
export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const businessId = user.businessId;

    try {
        if (id) {
            const customer = await prisma.customer.findFirst({
                where: { id, businessId },
                include: {
                    transactions: {
                        orderBy: { date: 'desc' },
                        take: 50
                    }
                }
            });

            if (!customer) {
                return NextResponse.json({ error: "Customer not found" }, { status: 404 });
            }

            return NextResponse.json({ data: customer });
        } else {
            const customers = await prisma.customer.findMany({
                where: { businessId },
                orderBy: { createdAt: 'desc' }
            });

            return NextResponse.json({ data: customers });
        }
    } catch (error) {
        console.error("Customers GET error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}


export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    // Check customer limit for free plan
    const limitCheck = await checkCustomerLimit(user.businessId, user.plan);
    if (!limitCheck.canCreate) {
        return paymentRequiredResponse(limitCheck.error || "Customer limit exceeded");
    }

    try {
        const body = await request.json();
        const parsed = customerSchema.parse(body);

        const customer = await prisma.customer.create({
            data: {
                ...parsed,
                businessId: user.businessId,
                totalUdhar: 0,
            },
        });

        return NextResponse.json({ data: customer, message: "Customer created successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("Customers POST Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const parsed = customerUpdateSchema.parse(body);

        // Verify customer belongs to this business
        const existing = await prisma.customer.findFirst({
            where: { id: parsed.id, businessId: user.businessId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Customer not found" }, { status: 404 });
        }

        const updateData: Record<string, any> = {};
        if (parsed.name !== undefined) updateData.name = parsed.name;
        if (parsed.phone !== undefined) updateData.phone = parsed.phone || null;

        const customer = await prisma.customer.update({
            where: { id: parsed.id },
            data: updateData,
        });

        return NextResponse.json({ data: customer, message: "Customer updated successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("Customers PUT Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
