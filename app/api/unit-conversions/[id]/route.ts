import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  multiplier: z.number().positive("Multiplier must be positive"),
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
  const conversionId = params.id;

  try {
    const existing = await prisma.unitConversion.findUnique({
      where: { id: conversionId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Unit conversion not found" },
        { status: 404 }
      );
    }

    if (existing.businessId !== businessId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const conversion = await prisma.unitConversion.update({
      where: { id: conversionId },
      data: { multiplier: validated.multiplier },
    });

    return NextResponse.json({ data: conversion });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating unit conversion:", error);
    return NextResponse.json(
      { error: "Failed to update unit conversion" },
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
  const conversionId = params.id;

  try {
    const existing = await prisma.unitConversion.findUnique({
      where: { id: conversionId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Unit conversion not found" },
        { status: 404 }
      );
    }

    if (existing.businessId !== businessId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    await prisma.unitConversion.delete({
      where: { id: conversionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting unit conversion:", error);
    return NextResponse.json(
      { error: "Failed to delete unit conversion" },
      { status: 500 }
    );
  }
}
