import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const sessionSchema = z.object({
    phone: z.string().min(10).max(15),
});

/**
 * POST /api/auth/session
 *
 * Called by the mobile app after TextBee has successfully verified the OTP.
 * Finds or creates a business record for the phone, generates a JWT, and
 * returns { user, token }.
 *
 * This endpoint trusts that OTP verification already happened client-side via
 * TextBee — it is responsible only for session creation, not re-verification.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone } = sessionSchema.parse(body);

        // Find or create the business account for this phone number
        let business = await prisma.business.findUnique({
            where: { phone },
            include: { subscription: true },
        });

        if (!business) {
            business = await prisma.business.create({
                data: {
                    phone,
                    name: null,
                    language: 'hi',
                },
                include: { subscription: true },
            });
        }

        // Resolve subscription plan (default: 'free')
        const rawPlan = business.subscription?.plan ?? 'free';
        const plan = (['free', 'pro', 'business'].includes(rawPlan)
            ? rawPlan
            : 'free') as 'free' | 'pro' | 'business';

        const token = generateToken(business.id, business.phone, plan);

        return NextResponse.json({
            success: true,
            user: {
                id: business.id,
                phone: business.phone,
                name: business.name,
            },
            token,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Validation Error', details: error.flatten().fieldErrors },
                { status: 400 },
            );
        }
        console.error('[auth/session] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
