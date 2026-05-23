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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;
  const purchaseId = params.id;

  try {
    const body = await request.json();
    const validated = purchaseSchema.parse(body);

    // Check if purchase exists and belongs to the business
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 }
      );
    }

    if (existingPurchase.businessId !== businessId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const purchase = await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        ...validated,
        date: validated.date ? new Date(validated.date) : existingPurchase.date,
      },
    });

    return NextResponse.json({ data: purchase });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating purchase:", error);
    return NextResponse.json(
      { error: "Failed to update purchase" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;
  const purchaseId = params.id;

  try {
    // Check if purchase exists and belongs to the business
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 }
      );
    }

    if (existingPurchase.businessId !== businessId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    await prisma.purchase.delete({
      where: { id: purchaseId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting purchase:", error);
    return NextResponse.json(
      { error: "Failed to delete purchase" },
      { status: 500 }
    );
  }
}
