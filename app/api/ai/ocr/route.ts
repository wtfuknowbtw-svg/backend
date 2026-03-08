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

// Prompt for OCR AI
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
    console.log('GEMINI KEY EXISTS:', !!process.env.GEMINI_API_KEY)
    console.log('GEMINI KEY VALUE:', process.env.GEMINI_API_KEY?.substring(0, 10))
    console.log('MOCK_OCR MODE:', process.env.MOCK_OCR)
    
    // Debug: Print authorization header
    const authHeader = request.headers.get('authorization');
    console.log('OCR Request - Authorization Header:', authHeader);
    
    // Verify JWT token
    const { user, error } = await verifyJWT(request);
    console.log('OCR JWT Verification - User:', user);
    console.log('OCR JWT Verification - Error:', error);
    
    if (!user) {
        console.error('OCR JWT Failed - Full Error:', error);
        return unauthorizedResponse(error || "Unauthorized");
    }

    // Check if MOCK_OCR is enabled
    if (process.env.MOCK_OCR === 'true') {
        console.log('🎭 Using MOCK OCR mode - returning fake response');
        const mockResponse = {
            customerName: "Ramesh Sharma",
            itemName: "Rice 5kg + Dal 2kg",
            price: 850,
            type: "credit",
            date: new Date().toISOString(),
            confidence: 95,
            raw_text: "Mock OCR response for testing"
        };
        return NextResponse.json({ data: mockResponse });
    }

    try {
        const body = await request.json();
        const { imageUrl, base64Image, transcript } = ocrSchema.parse(body);

        const apiKey = process.env.GEMINI_API_KEY;
        console.log('OCR Request - Gemini API Key exists:', !!apiKey);
        
        if (!apiKey) {
            console.error('OCR Error - Gemini API key not configured in environment');
            return NextResponse.json({ 
                error: "Gemini API key not configured on server. Please contact administrator." 
            }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        let contentParts: any;

        if (transcript) {
            // For text input, use the transcript directly
            contentParts = `Here is the voice transcript: "${transcript}"`;
        } else {
            // Process images with vision model
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
                    const mimeMatch = parts[0].match(/:(.*?);/);
                    if (mimeMatch) mimeType = mimeMatch[1];
                    base64Data = parts[1];
                }
            }

            if (!base64Data) {
                return NextResponse.json({ error: "No image or transcript data provided" }, { status: 400 });
            }

            // For Gemini vision model, we need to send the image as inlineData
            contentParts = [
                OCR_PROMPT,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType,
                    },
                },
            ];
        }

        const result = await model.generateContent(contentParts);
        const response = await result.response;
        const text = response.text();

        // Clean up JSON response if present
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
