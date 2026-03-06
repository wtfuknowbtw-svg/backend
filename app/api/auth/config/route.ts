import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabaseStatus = {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      isConfigured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    };

    const textbeeStatus = {
      hasApiKey: !!process.env.TEXTBEE_API_KEY,
      hasDeviceId: !!process.env.TEXTBEE_DEVICE_ID,
      isConfigured: !!(process.env.TEXTBEE_API_KEY && process.env.TEXTBEE_DEVICE_ID),
    };

    const twilioStatus = {
      hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
      hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
      isConfigured: !!(process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID),
    };

    return NextResponse.json({
      supabase: supabaseStatus,
      twilio: twilioStatus,
      textbee: textbeeStatus,
      activeService: supabaseStatus.isConfigured ? 'Supabase (Twilio)' : (textbeeStatus.isConfigured ? 'Textbee' : 'None'),
      environment: process.env.NODE_ENV,
    });

  } catch (error) {
    console.error("Config Check Error:", error);
    return NextResponse.json({ error: "Failed to check configuration" }, { status: 500 });
  }
}
