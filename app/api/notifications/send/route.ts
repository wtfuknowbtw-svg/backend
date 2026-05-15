import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, title, body: notificationBody, data } = body;

    // Validate required fields
    if (!businessId || !title || !notificationBody) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId, title, or body' },
        { status: 400 }
      );
    }

    // Get business with push token
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business || !business.pushToken) {
      return NextResponse.json(
        { error: 'Business not found or no push token registered' },
        { status: 404 }
      );
    }

    // Send push notification via Expo Push API
    const message = {
      to: business.pushToken,
      sound: 'default',
      title,
      body: notificationBody,
      data: data || {},
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Expo Push API error:', result);
      return NextResponse.json(
        { error: 'Failed to send push notification', details: result },
        { status: 500 }
      );
    }

    console.log('Push notification sent successfully:', result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send push notification',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
