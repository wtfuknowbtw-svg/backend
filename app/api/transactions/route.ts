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
    type: z.enum(["credit", "cash", "expense", "udhar_payment"]),
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

    const formatted = transactions.map((t: any) => ({
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

        // Update totalUdhar if credit, cash, or udhar_payment
        if (resolvedCustomerId && (parsed.type === "credit" || parsed.type === "cash" || parsed.type === "udhar_payment")) {
            // Credit adds to udhar, cash/udhar_payment subtracts
            const amountChange = parsed.type === "credit" ? parsed.price : -parsed.price;
            await prisma.customer.update({
                where: { id: resolvedCustomerId },
                data: { totalUdhar: { increment: amountChange } }
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                ...transaction,
                customerName: parsed.customerName || "Cash Entry",
            }
        });

    } catch (error: any) {
        console.error("Transaction creation error:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
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

        // Get the transaction to update
        const existingTransaction = await prisma.transaction.findFirst({
            where: { id, businessId: user.businessId }
        });

        if (!existingTransaction) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        // Update the transaction with Prisma
        const updatedTransaction = await prisma.transaction.update({
            where: { id },
            data: parsed
        });
        return NextResponse.json({ data: updatedTransaction, message: "Transaction updated successfully" });
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

        // Get the transaction to delete
        const existingTransaction = await prisma.transaction.findFirst({
            where: { id, businessId: user.businessId }
        });

        if (!existingTransaction) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        // Delete the transaction with Prisma
        await prisma.transaction.delete({
            where: { id }
        });
        return NextResponse.json({ message: "Transaction deleted successfully" });
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
