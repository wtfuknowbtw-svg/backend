import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Phone Number",
            credentials: {
                phone: { label: "Phone Number", type: "text", placeholder: "9876543210" },
                otp: { label: "OTP", type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.phone || !credentials?.otp) return null;

                // In a real app, verify OTP against a fast cache (e.g. Redis) or SMS provider.
                // For development, we'll accept '123456' as a valid OTP.
                if (credentials.otp !== "123456") {
                    throw new Error("Invalid OTP");
                }

                let business = await prisma.business.findUnique({
                    where: { phone: credentials.phone },
                });

                if (!business) {
                    business = await prisma.business.create({
                        data: { phone: credentials.phone },
                    });
                }

                return { id: business.id, phone: business.phone };
            },
        }),
    ],
    session: { strategy: "jwt" },
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.phone = user.phone;
            }
            return token;
        },
        session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.phone = token.phone as string;
            }
            return session;
        },
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
