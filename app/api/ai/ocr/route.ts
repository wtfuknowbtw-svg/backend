import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";

const ocrSchema = z.object({
    imageUrl: z.string().url().optional(),
    base64Image: z.string().optional(),
    transcript: z.string().optional(),
}).refine(data => data.imageUrl || data.base64Image || data.transcript, {
    message: "Either imageUrl, base64Image, or transcript must be provided",
});

// Prompt for Gemini
const OCR_PROMPT = `
You are a transaction parser for Indian small business accounting.
Extract ALL transactions from the provided input (image text or voice transcript).
For each transaction, output structured JSON.

Rules:
- "udhar" / "udhaar" / "credit" = type: "credit"
- "cash" / "nakad" / "paid" = type: "cash"
- Common Indian units: kg, litre/ltr, piece/pcs, dozen
- If customer name is unclear, use "Unknown Customer"
- Always output a confidence score 0-100 per transaction
- If a field cannot be determined, set it to null (never guess)

Output format (JSON array only, no explanation):
[
  {
    "customer_name": "string | null",
    "item_name": "string | null",
    "quantity": number | null,
    "unit": "string | null",
    "price": number | null,
    "transaction_type": "credit" | "cash" | "expense" | "unknown",
    "date": "ISO string | null",
    "confidence": number,
    "raw_text": "original text this was parsed from"
  }
]
`;

export async function POST(request: NextRequest) {
    // Verify JWT token
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { imageUrl, base64Image, transcript } = ocrSchema.parse(body);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let contentParts: any[] = [OCR_PROMPT];

        if (transcript) {
            contentParts.push(`Here is the voice transcript: "${transcript}"`);
        } else {
            let base64Data = base64Image;
            let mimeType = "image/jpeg";

            if (imageUrl) {
                // Fetch the image as arrayBuffer
                const imageResp = await fetch(imageUrl);
                if (!imageResp.ok) {
                    return NextResponse.json({ error: "Failed to download image" }, { status: 400 });
                }
                const arrayBuffer = await imageResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                base64Data = buffer.toString("base64");
                mimeType = imageResp.headers.get("content-type") || "image/jpeg";
            }

            // Clean up data URL prefix if sent
            if (base64Data && base64Data.startsWith('data:image')) {
                const parts = base64Data.split(',');
                if (parts.length > 1) {
                    // e.g. "data:image/png;base64,"
                    const mimeMatch = parts[0].match(/:(.*?);/);
                    if (mimeMatch) mimeType = mimeMatch[1];
                    base64Data = parts[1];
                }
            }

            if (!base64Data) {
                return NextResponse.json({ error: "No image or transcript data provided" }, { status: 400 });
            }

            contentParts.push({
                inlineData: {
                    data: base64Data,
                    mimeType,
                },
            });
        }

        const result = await model.generateContent(contentParts);
        const response = await result.response;
        const text = response.text();

        // Clean up Gemini's markdown wrapper if present
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

        let parsedData;
        try {
            parsedData = JSON.parse(cleanText);
        } catch (e) {
            return NextResponse.json({ error: "Failed to parse AI output", rawContent: cleanText }, { status: 500 });
        }

        return NextResponse.json({ data: parsedData });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("OCR API Error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
