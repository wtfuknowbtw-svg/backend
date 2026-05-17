import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOTPWithSupabase } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";


const sendOtpSchema = z.object({
    phone: z.string().min(10).max(15),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone } = sendOtpSchema.parse(body);

        // 1. Development Flow: Skip SMS, save to DB, log to console
        if (process.env.NODE_ENV === 'development') {
            console.log("🛠️ Development Mode: Skipping SMS sending");
            
            // Generate 6-digit OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Save OTP to database for verification
            await prisma.otp.upsert({
                where: { phone },
                update: { code: otpCode, expiresAt },
                create: { phone, code: otpCode, expiresAt },
            });

            console.log(`\n-----------------------------------------`);
            console.log(`🔑 LOCAL OTP FOR ${phone}: ${otpCode}`);
            console.log(`-----------------------------------------\n`);

            return NextResponse.json({ 
                success: true, 
                message: `[DEV ONLY] OTP sent to terminal for ${phone}` 
            });
        }

        // 2. Production Flow: Supabase SMS (Primary) -> Textbee (Fallback)
        const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        if (supabaseConfigured) {
            // Use Supabase SMS
            const supabaseResult = await sendOTPWithSupabase(phone);
            
            if (!supabaseResult.success) {
                console.warn("Supabase SMS Error:", supabaseResult.message);
                console.log("Falling back to Textbee / DB...");
                // Don't return 502 here, let it fall through to Textbee fallback
            } else {
                console.log(`OTP sent via Supabase to ${phone}`);
                return NextResponse.json({ success: true });
            }
        }
        
        // Fallback to Textbee
        console.log("Using Textbee fallback or local DB generation");
            
            // Generate 6-digit OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Save OTP to database for verification
            await prisma.otp.upsert({
                where: { phone },
                update: { code: otpCode, expiresAt },
                create: { phone, code: otpCode, expiresAt },
            });
            
            const apiKey = process.env.TEXTBEE_API_KEY;
            const deviceId = process.env.TEXTBEE_DEVICE_ID;

            if (!apiKey || !deviceId) {
                console.warn("SMS service credentials missing. OTP saved to DB only.");
                return NextResponse.json({ success: true, message: "OTP saved to DB only (no SMS)" });
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
                console.warn("Textbee API Error:", error);
                // Return success anyway so they can use the master OTP
                return NextResponse.json({ success: true, message: "Textbee failed, OTP saved to DB only" });
            }
            
            console.log(`OTP sent via Textbee to ${phone}`);
            return NextResponse.json({ success: true });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
        }
        console.error("Send OTP Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
