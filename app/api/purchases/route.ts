import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const purchaseSchema = z.object({
  supplierName: z.string().optional(),
  itemName: z.string().min(1, "Item name is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().optional(),
  costPrice: z.number().positive("Cost price must be positive"),
  totalCost: z.number().positive("Total cost must be positive"),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  // Get filter from query params
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'all';

  let dateFilter: any = {};
  const now = new Date();

  if (filter === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = { gte: weekAgo };
  } else if (filter === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = { gte: monthAgo };
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      businessId,
      ...(filter !== 'all' && { date: dateFilter }),
    },
    orderBy: { date: 'desc' },
  });

  // Calculate total spend summary
  const totalSpend = purchases.reduce((sum, p) => sum + p.totalCost, 0);
  const itemCount = purchases.length;
  const supplierCount = new Set(purchases.map(p => p.supplierName)).size;

  return NextResponse.json({
    data: purchases,
    summary: {
      totalSpend,
      itemCount,
      supplierCount,
    },
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const body = await request.json();
    const validated = purchaseSchema.parse(body);

    const purchase = await prisma.purchase.create({
      data: {
        ...validated,
        businessId,
        date: validated.date ? new Date(validated.date) : new Date(),
      },
    });

    return NextResponse.json({ data: purchase }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating purchase:", error);
    return NextResponse.json(
      { error: "Failed to create purchase" },
      { status: 500 }
    );
  }
}
