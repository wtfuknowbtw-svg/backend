import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const invoiceItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  pricePerUnit: z.number().nonnegative("Price per unit cannot be negative"),
});

const createInvoiceSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  gstRate: z.number().min(0).max(100),
  notes: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const body = await request.json();
    const validated = createInvoiceSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update business counter and get it
      const business = await tx.business.update({
        where: { id: businessId },
        data: {
          invoiceCounter: {
            increment: 1,
          },
        },
        select: {
          invoiceCounter: true,
        },
      });

      const year = new Date(validated.invoiceDate || Date.now()).getFullYear();
      const counterStr = String(business.invoiceCounter).padStart(3, "0");
      const invoiceNumber = `INV-${year}-${counterStr}`;

      // 2. Calculate values
      const subtotal = validated.items.reduce(
        (sum, item) => sum + item.quantity * item.pricePerUnit,
        0
      );
      const gstAmount = (subtotal * validated.gstRate) / 100;
      const totalAmount = subtotal + gstAmount;

      // 3. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          businessId,
          invoiceNumber,
          customerName: validated.customerName,
          customerPhone: validated.customerPhone || null,
          customerAddress: validated.customerAddress || null,
          subtotal,
          gstRate: validated.gstRate,
          gstAmount,
          totalAmount,
          notes: validated.notes || null,
          invoiceDate: validated.invoiceDate ? new Date(validated.invoiceDate) : new Date(),
          items: {
            create: validated.items.map((item) => ({
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              pricePerUnit: item.pricePerUnit,
              totalPrice: item.quantity * item.pricePerUnit,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return invoice;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating invoice:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}
