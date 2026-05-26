import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;
  const { id } = params;

  try {
    // Verify record exists and belongs to the requesting business
    const purchase = await prisma.wholesalePurchase.findUnique({
      where: { id },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Wholesale purchase record not found" }, { status: 404 });
    }

    if (purchase.businessId !== businessId) {
      return NextResponse.json({ error: "Forbidden: Access denied" }, { status: 403 });
    }

    await prisma.wholesalePurchase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Wholesale purchase deleted successfully" });
  } catch (error) {
    console.error("Error deleting wholesale purchase:", error);
    return NextResponse.json(
      { error: "Failed to delete wholesale purchase" },
      { status: 500 }
    );
  }
}
