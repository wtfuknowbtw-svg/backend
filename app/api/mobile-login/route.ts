import { NextResponse } from "next/server";
import { z } from "zod";
import { generateToken } from "@/lib/jwt";
import { verifyOTPWithSupabase } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
    phone: z.string().min(10).max(15),
    otp: z.string().length(6),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("Login Request Body:", body);
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
                // Verify via local database (Fallback/Textbee)
                const otpRecord = await prisma.otp.findUnique({
                    where: { phone },
                });

                if (otpRecord && otpRecord.code === otp && otpRecord.expiresAt > new Date()) {
                    otpValid = true;
                    console.log('OTP verified via local database');
                    
                    // Delete OTP after successful verification
                    await prisma.otp.delete({ where: { phone } });
                } else {
                    return NextResponse.json({ 
                        error: "Invalid or expired OTP" 
                    }, { status: 401 });
                }
            }
        } else {
            otpValid = true; // Master OTP always valid
        }

        // Find or create business in database
        let business = await prisma.business.findUnique({
            where: { phone },
        });

        if (!business) {
            // Create new business if doesn't exist
            business = await prisma.business.create({
                data: { 
                    phone,
                    name: null, // Can be updated later
                    language: "hi", // Default to Hindi
                },
            });
            console.log(`Created new business for phone: ${phone}, ID: ${business.id}`);
        } else {
            console.log(`Found existing business for phone: ${phone}, ID: ${business.id}`);
        }
        
        console.log("Login successful for business ID:", business.id);
        
        // Generate JWT token
        const token = generateToken(business.id, business.phone);
        
        // Return JSON response with user info and JWT token
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
        console.error("DEBUG: Mobile Login Error Details:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}
