import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOTPWithSupabase } from "@/lib/supabase";

const sendOtpSchema = z.object({
    phone: z.string().min(10).max(15),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone } = sendOtpSchema.parse(body);

        // Send SMS via Supabase (primary) or Textbee (fallback)
        const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        if (supabaseConfigured) {
            // Use Supabase SMS - no local storage needed
            const supabaseResult = await sendOTPWithSupabase(phone);
            
            if (!supabaseResult.success) {
                console.error("Supabase SMS Error:", supabaseResult.message);
                return NextResponse.json({ 
                    error: "Failed to send SMS via Supabase", 
                    details: supabaseResult.message 
                }, { status: 502 });
            }
            
            console.log(`OTP sent via Supabase to ${phone}`);
            return NextResponse.json({ success: true });
            
        } else {
            // Fallback to Textbee with local storage
            console.log("Supabase not configured, using Textbee fallback");
            
            // Generate 6-digit OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            const apiKey = process.env.TEXTBEE_API_KEY;
            const deviceId = process.env.TEXTBEE_DEVICE_ID;

            if (!apiKey || !deviceId) {
                console.error("Both Supabase and Textbee credentials missing. Code:", otpCode);
                // In development, we might still want to succeed so user can use the logged code
                if (process.env.NODE_ENV === 'development') {
                    return NextResponse.json({
                        success: true,
                        message: `[DEV ONLY] OTP is ${otpCode}. Configure Supabase or TEXTBEE_DEVICE_ID to send real SMS.`
                    });
                }
                return NextResponse.json({ error: "SMS service not configured" }, { status: 500 });
            }

            const textbeeResponse = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                },
                body: JSON.stringify({
                    recipients: [phone.startsWith('+') ? phone : `+91${phone}`],
                    payload: {
                        content: `Your ApnaKhata verification code is: ${otpCode}. Valid for 5 minutes.`,
                    },
                }),
            });

            if (!textbeeResponse.ok) {
                const error = await textbeeResponse.text();
                console.error("Textbee API Error:", error);
                return NextResponse.json({ error: "Failed to send SMS via Textbee" }, { status: 502 });
            }
            
            console.log(`OTP sent via Textbee to ${phone}: ${otpCode}`);
            return NextResponse.json({ success: true });
        }

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
        }
        console.error("Send OTP Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
