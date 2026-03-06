import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const transactionSchema = z.object({
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    itemName: z.string().optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    price: z.number().positive(),
    type: z.enum(["credit", "cash", "expense"]),
    sourceType: z.string().optional(),
    aiConfidence: z.number().min(0).max(100).optional(),
    rawText: z.string().optional(),
});

export async function GET(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    const businessId = user.businessId;

    const transactions = await prisma.transaction.findMany({
        where: { businessId },
        orderBy: { date: 'desc' },
        include: { customer: { select: { name: true } } }
    });

    const formatted = transactions.map(t => ({
        ...t,
        customerName: t.customer?.name || "Cash Entry",
    }));

    return NextResponse.json({ data: formatted });
}

export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const parsed = transactionSchema.parse(body);

        let resolvedCustomerId = parsed.customerId;

        // If a new string name was passed instead of an ID, find or create the customer
        if (!resolvedCustomerId && parsed.customerName) {
            let customer = await prisma.customer.findFirst({
                where: { businessId: user.businessId, name: parsed.customerName }
            });

            if (!customer) {
                customer = await prisma.customer.create({
                    data: {
                        businessId: user.businessId,
                        name: parsed.customerName,
                    }
                });
            }
            resolvedCustomerId = customer.id;
        }

        const transaction = await prisma.transaction.create({
            data: {
                businessId: user.businessId,
                customerId: resolvedCustomerId,
                itemName: parsed.itemName,
                quantity: parsed.quantity,
                unit: parsed.unit,
                price: parsed.price,
                type: parsed.type,
                sourceType: parsed.sourceType || "manual",
                aiConfidence: parsed.aiConfidence,
                rawText: parsed.rawText,
            },
        });

        // Update totalUdhar if credit or payment (very basic sync)
        if (resolvedCustomerId && (parsed.type === "credit" || parsed.type === "cash")) {
            // Let's keep totalUdhar updated
            const amountChange = parsed.type === "credit" ? parsed.price : -parsed.price;
            await prisma.customer.update({
                where: { id: resolvedCustomerId },
                data: { totalUdhar: { increment: amountChange } }
            });
        }

        return NextResponse.json({ data: transaction, message: "Transaction created successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
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
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
        }

        const parsed = transactionSchema.partial().parse(updateData);

        // Get old transaction to calculate udhar change
        const oldTxn = await prisma.transaction.findUnique({
            where: { id, businessId: user.businessId },
        });

        if (!oldTxn) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        const transaction = await prisma.transaction.update({
            where: { id },
            data: parsed,
        });

        // Re-calculate Udhar if price or type changed
        if (oldTxn.customerId && (oldTxn.type === "credit" || oldTxn.type === "cash" || parsed.type === "credit" || parsed.type === "cash" || parsed.price !== undefined)) {
            const oldPrice = oldTxn.type === "credit" ? oldTxn.price : oldTxn.type === "cash" ? -oldTxn.price : 0;
            const newPrice = (parsed.type || oldTxn.type) === "credit" ? (parsed.price ?? oldTxn.price) : (parsed.type || oldTxn.type) === "cash" ? -(parsed.price ?? oldTxn.price) : 0;

            const diff = newPrice - oldPrice;
            if (diff !== 0) {
                await prisma.customer.update({
                    where: { id: oldTxn.customerId },
                    data: { totalUdhar: { increment: diff } }
                });
            }
        }

        return NextResponse.json({ data: transaction, message: "Transaction updated successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
        }

        const transaction = await prisma.transaction.findUnique({
            where: { id, businessId: user.businessId },
        });

        if (!transaction) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        await prisma.transaction.delete({
            where: { id },
        });

        // Sync Udhar
        if (transaction.customerId && (transaction.type === "credit" || transaction.type === "cash")) {
            const amountChange = transaction.type === "credit" ? -transaction.price : transaction.price;
            await prisma.customer.update({
                where: { id: transaction.customerId },
                data: { totalUdhar: { increment: amountChange } }
            });
        }

        return NextResponse.json({ message: "Transaction deleted successfully" });
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
