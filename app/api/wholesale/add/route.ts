import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const wholesalePurchaseSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  totalPrice: z.number().positive("Total price must be positive"),
  supplierName: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const body = await request.json();
    const validated = wholesalePurchaseSchema.parse(body);

    const wholesalePurchase = await prisma.wholesalePurchase.create({
      data: {
        businessId,
        itemName: validated.itemName,
        quantity: validated.quantity,
        unit: validated.unit,
        totalPrice: validated.totalPrice,
        supplierName: validated.supplierName || null,
        purchaseDate: validated.purchaseDate ? new Date(validated.purchaseDate) : new Date(),
      },
    });

    return NextResponse.json({ data: wholesalePurchase }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating wholesale purchase:", error);
    return NextResponse.json(
      { error: "Failed to create wholesale purchase" },
      { status: 500 }
    );
  }
}
