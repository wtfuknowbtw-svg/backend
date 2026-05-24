import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const unitConversionSchema = z.object({
  fromUnit: z.string().min(1, "From unit is required"),
  toUnit: z.string().min(1, "To unit is required"),
  multiplier: z.number().positive("Multiplier must be positive"),
});

export async function GET(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const conversions = await prisma.unitConversion.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: conversions });
  } catch (error) {
    console.error("Error getting unit conversions:", error);
    return NextResponse.json(
      { error: "Failed to get unit conversions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;

  try {
    const body = await request.json();
    const validated = unitConversionSchema.parse(body);

    // Normalize units to lowercase for consistent matching
    const fromUnit = validated.fromUnit.toLowerCase().trim();
    const toUnit = validated.toUnit.toLowerCase().trim();

    // Check for duplicate
    const existing = await prisma.unitConversion.findUnique({
      where: {
        businessId_fromUnit_toUnit: {
          businessId,
          fromUnit,
          toUnit,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This conversion already exists. Please edit it instead." },
        { status: 409 }
      );
    }

    const conversion = await prisma.unitConversion.create({
      data: {
        businessId,
        fromUnit,
        toUnit,
        multiplier: validated.multiplier,
      },
    });

    return NextResponse.json({ data: conversion }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating unit conversion:", error);
    return NextResponse.json(
      { error: "Failed to create unit conversion" },
      { status: 500 }
    );
  }
}
