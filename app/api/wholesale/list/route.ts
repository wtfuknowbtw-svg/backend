import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query params (1-indexed month, e.g. January = 1)
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid month or year parameters" }, { status: 400 });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // 1st of next month, exclusive

    const purchases = await prisma.wholesalePurchase.findMany({
      where: {
        businessId,
        purchaseDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: {
        purchaseDate: 'desc',
      },
    });

    const totalSpent = purchases.reduce((sum, p) => sum + p.totalPrice, 0);
    const uniqueItems = new Set(purchases.map(p => p.itemName.trim().toLowerCase()));
    const totalItems = uniqueItems.size;

    return NextResponse.json({
      data: purchases,
      summary: {
        totalSpent,
        totalItems,
      },
    });
  } catch (error) {
    console.error("Error fetching wholesale purchases list:", error);
    return NextResponse.json(
      { error: "Failed to fetch wholesale purchases list" },
      { status: 500 }
    );
  }
}
