import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Push token registration request:', body);
    const { businessId, phone, pushToken } = body;

    // Validate required fields
    if (!phone || !pushToken) {
      return NextResponse.json(
        { error: 'Missing required fields: phone or pushToken' },
        { status: 400 }
      );
    }

    // Find or update business with push token
    // We use phone as the unique identifier for upsert to ensure we update the correct record
    const business = await prisma.business.upsert({
      where: { phone },
      update: { pushToken },
      create: {
        phone,
        pushToken,
        language: 'hi',
      },
    });

    console.log('Push token registered successfully for business:', {
      id: business.id,
      phone: business.phone,
      hasToken: !!business.pushToken
    });

    return NextResponse.json({
      success: true,
      businessId: business.id,
      pushToken: business.pushToken,
    });
  } catch (error: any) {
    console.error('Error registering push token:', error);
    return NextResponse.json(
      { 
        error: 'Failed to register push token',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
