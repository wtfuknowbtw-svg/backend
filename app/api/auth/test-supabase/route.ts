import { NextResponse } from "next/server";
import { sendOTPWithSupabase } from "@/lib/supabase";
import { z } from "zod";

const testSchema = z.object({
  phone: z.string().min(10).max(15),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone } = testSchema.parse(body);

    // Test Supabase configuration
    const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    if (!supabaseConfigured) {
      return NextResponse.json({
        success: false,
        message: "Supabase not configured. Please check your environment variables.",
        config: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasTwilioAuth: !!process.env.TWILIO_AUTH_TOKEN,
          hasTwilioSid: !!process.env.TWILIO_ACCOUNT_SID,
        },
      }, { status: 400 });
    }

    // Send test OTP via Supabase
    const result = await sendOTPWithSupabase(phone);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test OTP sent successfully to ${phone} via Supabase (Twilio). Check your phone for the SMS.`,
        phone,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.message,
        config: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasTwilioAuth: !!process.env.TWILIO_AUTH_TOKEN,
          hasTwilioSid: !!process.env.TWILIO_ACCOUNT_SID,
        },
      }, { status: 500 });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }
    console.error("Supabase Test Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
