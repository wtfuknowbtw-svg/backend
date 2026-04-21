import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const customerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
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
