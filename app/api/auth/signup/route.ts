import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/jwt";

const signupSchema = z.object({
    phone: z.string().min(10).max(15),
    name: z.string().optional(),
    type: z.string().optional(),
    language: z.string().default("hi"),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone, name, type, language } = signupSchema.parse(body);

        // Check if business already exists
        const existingBusiness = await prisma.business.findUnique({
            where: { phone },
        });

        if (existingBusiness) {
            return NextResponse.json(
                { error: "Business with this phone number already exists" },
                { status: 400 }
            );
        }

        // Create new business
        const business = await prisma.business.create({
            data: {
                phone,
                name,
                type,
                language,
            },
        });

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
        console.error("Signup Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
