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
    // Get filter from query params
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'month';

    let dateFilter: any = {};
    const now = new Date();

    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = { gte: weekAgo };
    } else if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { gte: monthAgo };
    }

    // Get purchases
    const purchases = await prisma.purchase.findMany({
      where: {
        businessId,
        ...(filter !== 'all' && { date: dateFilter }),
      },
    });

    // Get sales (transactions with type 'cash' or 'credit')
    const sales = await prisma.transaction.findMany({
      where: {
        businessId,
        type: { in: ['cash', 'credit'] },
        ...(filter !== 'all' && { date: dateFilter }),
      },
    });

    // Calculate totals
    const totalPurchaseCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const totalSalesRevenue = sales.reduce((sum, s) => sum + s.price, 0);
    const profitLoss = totalSalesRevenue - totalPurchaseCost;

    // Calculate item-wise summary
    const itemMap = new Map<string, { bought: number; sold: number; unit: string }>();

    // Add purchases to map
    purchases.forEach((purchase) => {
      const key = purchase.itemName.toLowerCase();
      const existing = itemMap.get(key) || { bought: 0, sold: 0, unit: purchase.unit || '' };
      itemMap.set(key, {
        bought: existing.bought + purchase.quantity,
        sold: existing.sold,
        unit: purchase.unit || existing.unit,
      });
    });

    // Add sales to map
    sales.forEach((sale) => {
      if (sale.itemName) {
        const key = sale.itemName.toLowerCase();
        const existing = itemMap.get(key) || { bought: 0, sold: 0, unit: sale.unit || '' };
        itemMap.set(key, {
          bought: existing.bought,
          sold: existing.sold + (sale.quantity || 0),
          unit: sale.unit || existing.unit,
        });
      }
    });

    // Convert map to array
    const itemWiseSummary = Array.from(itemMap.entries()).map(([itemName, data]) => ({
      itemName,
      totalBought: data.bought,
      totalSold: data.sold,
      difference: data.bought - data.sold,
      unit: data.unit,
    }));

    return NextResponse.json({
      data: {
        totalPurchaseCost,
        totalSalesRevenue,
        profitLoss,
        itemWiseSummary,
      },
    });
  } catch (error) {
    console.error("Error getting purchase summary:", error);
    return NextResponse.json(
      { error: "Failed to get purchase summary" },
      { status: 500 }
    );
  }
}
