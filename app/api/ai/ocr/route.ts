import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import Groq from "groq-sdk";
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
    console.log('GROQ KEY EXISTS:', !!process.env.GROQ_API_KEY)
    console.log('GROQ KEY VALUE:', process.env.GROQ_API_KEY?.substring(0, 10))
    
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

    try {
        const body = await request.json();
        const { imageUrl, base64Image, transcript } = ocrSchema.parse(body);

        const apiKey = process.env.GROQ_API_KEY;
        console.log('OCR Request - Groq API Key exists:', !!apiKey);
        
        if (!apiKey) {
            console.error('OCR Error - Groq API key not configured in environment');
            return NextResponse.json({ 
                error: "Groq API key not configured on server. Please contact administrator." 
            }, { status: 500 });
        }

        const groq = new Groq({ apiKey });

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

            // For Groq vision model, we need to send the image as a data URL
            const imageDataUrl = `data:${mimeType};base64,${base64Data}`;
            contentParts = [
                {
                    type: "text",
                    text: "Extract transaction data from this image. Look for customer names, items, quantities, prices, and transaction types (cash/credit/expense)."
                },
                {
                    type: "image_url",
                    image_url: {
                        url: imageDataUrl
                    }
                }
            ];
        }

        const result = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: OCR_PROMPT
                },
                {
                    role: "user",
                    content: contentParts
                }
            ],
            model: "llama-3.2-90b-vision-preview"
        }).catch((error) => {
            console.error('Groq API Error:', error);
            throw error;
        });

        const text = result.choices[0]?.message?.content || '';

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
