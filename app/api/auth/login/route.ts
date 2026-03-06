import { NextResponse } from "next/server";
import { z } from "zod";
import { generateToken } from "@/lib/jwt";
import { verifyOTPWithSupabase } from "@/lib/supabase";

const loginSchema = z.object({
    phone: z.string().min(10).max(15),
    otp: z.string().length(6),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone, otp } = loginSchema.parse(body);

        // Verify OTP (Supabase or master OTP)
        const isMasterOtp = otp === "000000";
        let otpValid = false;
        let supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

        if (!isMasterOtp) {
            if (supabaseConfigured) {
                // Verify via Supabase
                const supabaseResult = await verifyOTPWithSupabase(phone, otp);
                if (supabaseResult.success) {
                    otpValid = true;
                    console.log('OTP verified via Supabase');
                } else {
                    console.log('Supabase verification failed:', supabaseResult.message);
                    return NextResponse.json({ 
                        error: "Invalid OTP", 
                        details: supabaseResult.message 
                    }, { status: 401 });
                }
            } else {
                // No SMS service configured
                return NextResponse.json({ 
                    error: "OTP service not configured" 
                }, { status: 500 });
            }
        } else {
            otpValid = true; // Master OTP always valid
        }

        // Find or create business (for demo - in production use proper DB)
        let business = { id: "demo-business", phone, name: "Demo Business" };
        
        // In production, you would fetch from your database:
        // const business = await prisma.business.findUnique({
        //     where: { phone },
        // });
        
        // if (!business) {
        //     return NextResponse.json(
        //         { error: "Business not found. Please sign up first." },
        //         { status: 404 }
        //     );
        // }

        // Generate JWT token
        const token = generateToken(business.id, business.phone);

        return NextResponse.json({
            success: true,
            user: {
                id: business.id,
                phone: business.phone,
                name: business.name,
            },
            token,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        console.error("Login Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
