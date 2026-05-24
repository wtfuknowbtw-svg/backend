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

    // Get unit conversions for this business
    const unitConversions = await prisma.unitConversion.findMany({
      where: { businessId },
    });

    // Build conversion lookup: "fromUnit->toUnit" => multiplier
    const conversionMap = new Map<string, { multiplier: number; fromUnit: string; toUnit: string }>();
    unitConversions.forEach((uc) => {
      conversionMap.set(`${uc.fromUnit}->${uc.toUnit}`, {
        multiplier: uc.multiplier,
        fromUnit: uc.fromUnit,
        toUnit: uc.toUnit,
      });
      // Also store reverse conversion
      if (uc.multiplier > 0) {
        conversionMap.set(`${uc.toUnit}->${uc.fromUnit}`, {
          multiplier: 1 / uc.multiplier,
          fromUnit: uc.toUnit,
          toUnit: uc.fromUnit,
        });
      }
    });

    // Calculate totals
    const totalPurchaseCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const totalSalesRevenue = sales.reduce((sum, s) => sum + s.price, 0);
    const profitLoss = totalSalesRevenue - totalPurchaseCost;

    // Build item-wise tracking with conversion support
    interface ItemData {
      purchasedQty: number;
      purchasedUnit: string;
      purchasedCost: number;
      soldQty: number;
      soldUnit: string;
      soldRevenue: number;
    }

    const itemMap = new Map<string, ItemData>();

    // Add purchases to map
    purchases.forEach((purchase) => {
      const key = purchase.itemName.toLowerCase();
      const existing = itemMap.get(key);
      if (existing) {
        existing.purchasedQty += purchase.quantity;
        existing.purchasedCost += purchase.totalCost;
        if (!existing.purchasedUnit && purchase.unit) {
          existing.purchasedUnit = purchase.unit.toLowerCase();
        }
      } else {
        itemMap.set(key, {
          purchasedQty: purchase.quantity,
          purchasedUnit: (purchase.unit || '').toLowerCase(),
          purchasedCost: purchase.totalCost,
          soldQty: 0,
          soldUnit: '',
          soldRevenue: 0,
        });
      }
    });

    // Add sales to map
    sales.forEach((sale) => {
      if (sale.itemName) {
        const key = sale.itemName.toLowerCase();
        const existing = itemMap.get(key);
        if (existing) {
          existing.soldQty += sale.quantity || 0;
          existing.soldRevenue += sale.price;
          if (!existing.soldUnit && sale.unit) {
            existing.soldUnit = sale.unit.toLowerCase();
          }
        } else {
          itemMap.set(key, {
            purchasedQty: 0,
            purchasedUnit: '',
            purchasedCost: 0,
            soldQty: sale.quantity || 0,
            soldUnit: (sale.unit || '').toLowerCase(),
            soldRevenue: sale.price,
          });
        }
      }
    });

    // Helper: try to find a conversion between two units
    const tryConvert = (fromUnit: string, toUnit: string, qty: number): {
      converted: boolean;
      convertedQty: number;
      conversionUsed: string;
    } => {
      if (!fromUnit || !toUnit) {
        return { converted: false, convertedQty: qty, conversionUsed: '' };
      }

      const key = `${fromUnit}->${toUnit}`;
      const conv = conversionMap.get(key);
      if (conv) {
        return {
          converted: true,
          convertedQty: qty * conv.multiplier,
          conversionUsed: `1 ${conv.fromUnit} = ${conv.multiplier} ${conv.toUnit}`,
        };
      }

      return { converted: false, convertedQty: qty, conversionUsed: '' };
    };

    // Convert map to enriched item-wise tracking
    const itemWiseTracking = Array.from(itemMap.entries()).map(([itemName, data]) => {
      const purchasedUnit = data.purchasedUnit;
      const soldUnit = data.soldUnit;

      let convertedQuantity = data.purchasedQty;
      let convertedUnit = purchasedUnit;
      let unitMismatch = false;
      let conversionUsed = '';
      let remaining = 0;
      let remainingUnit = '';
      let isMissing = false;
      let missingQuantity = 0;

      if (purchasedUnit && soldUnit && purchasedUnit !== soldUnit) {
        // Units differ — try to convert purchased to sold unit
        const result = tryConvert(purchasedUnit, soldUnit, data.purchasedQty);
        if (result.converted) {
          convertedQuantity = result.convertedQty;
          convertedUnit = soldUnit;
          conversionUsed = result.conversionUsed;
          remaining = convertedQuantity - data.soldQty;
          remainingUnit = soldUnit;
        } else {
          // No conversion found
          unitMismatch = true;
          remaining = data.purchasedQty - data.soldQty;
          remainingUnit = purchasedUnit || soldUnit || '';
        }
      } else {
        // Units match or one is missing — compare directly
        remaining = data.purchasedQty - data.soldQty;
        remainingUnit = purchasedUnit || soldUnit || '';
      }

      if (remaining < 0) {
        isMissing = true;
        missingQuantity = Math.abs(remaining);
      }

      return {
        itemName,
        purchased: {
          quantity: data.purchasedQty,
          unit: purchasedUnit,
          cost: data.purchasedCost,
          convertedQuantity,
          convertedUnit,
        },
        sold: {
          quantity: data.soldQty,
          unit: soldUnit,
          revenue: data.soldRevenue,
        },
        remaining,
        remainingUnit,
        isMissing,
        missingQuantity,
        unitMismatch,
        conversionUsed,
      };
    });

    // Also provide legacy itemWiseSummary for backward compatibility
    const itemWiseSummary = Array.from(itemMap.entries()).map(([itemName, data]) => ({
      itemName,
      totalBought: data.purchasedQty,
      totalSold: data.soldQty,
      difference: data.purchasedQty - data.soldQty,
      unit: data.purchasedUnit || data.soldUnit || '',
    }));

    return NextResponse.json({
      data: {
        totalPurchaseCost,
        totalSalesRevenue,
        profitLoss,
        itemWiseSummary,
        itemWiseTracking,
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
