import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";

// Mapping of short language codes to Sarvam language codes
const LANG_MAP: Record<string, string> = {
    'hi': 'hi-IN',
    'mr': 'mr-IN',
    'te': 'te-IN',
    'kn': 'kn-IN',
    'en': 'en-IN'
};

const KHATA_PROMPT = `Extract transaction details from this transcript.
Transcript: "[TRANSCRIPT]"

Return ONLY valid JSON in this format:
{
  "customer": "Name of person",
  "amount": number,
  "type": "udhar" | "cash"
}

Rules:
- amount: extract only the number
- type: "udhar" if money was given/lent/credit, "cash" if money was received/paid/settled
- customer: "Unknown" if no name found
`;

export async function POST(request: NextRequest) {
    const { user, error } = await verifyJWT(request);
    if (!user) return unauthorizedResponse(error || "Unauthorized");

    try {
        const formData = await request.formData();
        const file = formData.get('file') as Blob;
        const langCode = formData.get('language') as string || 'hi';

        if (!file) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
        }

        const sarvamKey = process.env.SARVAM_API_KEY;
        if (!sarvamKey) {
            return NextResponse.json({ error: "Sarvam API key not configured" }, { status: 500 });
        }

        // 1. Call Sarvam AI Speech-to-Text
        const sarvamFormData = new FormData();
        sarvamFormData.append('file', file, 'audio.m4a');
        sarvamFormData.append('language_code', LANG_MAP[langCode] || 'hi-IN');
        sarvamFormData.append('model', 'saaras:v3');

        console.log('Calling Sarvam AI STT...');
        const sarvamResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'api-subscription-key': sarvamKey,
            },
            body: sarvamFormData,
        });

        if (!sarvamResponse.ok) {
            const errorText = await sarvamResponse.text();
            console.error('Sarvam AI Error:', errorText);
            return NextResponse.json({ error: "Speech-to-text failed" }, { status: sarvamResponse.status });
        }

        const sarvamData = await sarvamResponse.json();
        const transcript = sarvamData.transcript;

        if (!transcript) {
            return NextResponse.json({ error: "Could not transcribe audio" }, { status: 400 });
        }

        console.log('Transcript received:', transcript);

        // 2. Post-process transcript into Khata format using Gemini
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            // Fallback: simple regex parsing if Gemini is missing
            const parsed = fallbackParse(transcript);
            return NextResponse.json({ transcript, ...parsed });
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const prompt = KHATA_PROMPT.replace('[TRANSCRIPT]', transcript);
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        let khataData;
        try {
            khataData = JSON.parse(cleanJson);
        } catch (e) {
            khataData = fallbackParse(transcript);
        }

        return NextResponse.json({
            transcript,
            language: langCode,
            ...khataData
        });

    } catch (error: any) {
        console.error('Voice API Error:', error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}

function fallbackParse(transcript: string) {
    const lower = transcript.toLowerCase();
    const amountMatch = lower.match(/(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[1]) : 0;
    
    let type = 'udhar';
    if (lower.includes('cash') || lower.includes('liya') || lower.includes('paid')) {
        type = 'cash';
    }

    // Very basic name extraction
    const words = transcript.split(' ');
    const customer = words[0] !== 'Unknown' ? words[0] : 'Unknown';

    return { customer, amount, type };
}

