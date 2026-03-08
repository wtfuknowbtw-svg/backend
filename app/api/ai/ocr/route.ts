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

// Main OCR prompt for Indian shop records
const MAIN_OCR_PROMPT = `You are an expert at reading Indian shop records, khata books, receipts, handwritten notes, and bills. Analyze this image carefully even if blurry, tilted, rotated, or low quality. The text may be in Hindi, Marathi, English, or mixed languages. Common Indian shop items: chawal, daal, doodh, sabzi, tel, atta, cheeni, namak. Common names: Ram, Raju, Suresh, Ramesh, Vijay, Mohan, Sita, Geeta. Extract transaction data and return ONLY valid JSON, no extra text: { customerName: string, itemName: string, price: number, type: credit or cash, date: string, confidence: number 0-100, rawText: string }. If price has rupee symbol extract only the number. Always return JSON even if confidence is low. Never return empty.`;

// Simplified retry prompt
const RETRY_OCR_PROMPT = `Read this image and find: person name, item name, and amount/price. Return JSON only: { customerName, itemName, price, type, confidence, rawText }`;

// Fallback response for very low confidence
const FALLBACK_RESPONSE = {
    customerName: '',
    itemName: '',
    price: 0,
    type: 'credit',
    confidence: 0,
    rawText: 'Could not read image'
};

export async function POST(request: NextRequest) {
    console.log('GEMINI KEY EXISTS:', !!process.env.GEMINI_API_KEY)
    console.log('GEMINI KEY VALUE:', process.env.GEMINI_API_KEY?.substring(0, 10))
    
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
                MAIN_OCR_PROMPT,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType,
                    },
                },
            ];
        }

        // First attempt with main prompt
        console.log('OCR - First attempt with main prompt');
        const result1 = await model.generateContent(contentParts);
        const response1 = await result1.response;
        const text1 = response1.text();

        // Clean up JSON response if present
        const cleanText1 = text1.replace(/```json/g, "").replace(/```/g, "").trim();

        let parsedData;
        try {
            parsedData = JSON.parse(cleanText1);
            console.log('OCR - First attempt successful, confidence:', parsedData.confidence);
            
            // Check if we need retry (confidence < 40 OR price is 0)
            if (parsedData.confidence < 40 || parsedData.price === 0) {
                console.log('OCR - Low confidence or zero price, attempting retry');
                
                // Second attempt with simplified prompt
                const retryContentParts = transcript 
                    ? `Here is the voice transcript: "${transcript}"`
                    : [
                        RETRY_OCR_PROMPT,
                        {
                            inlineData: {
                                data: contentParts[1].inlineData.data,
                                mimeType: contentParts[1].inlineData.mimeType,
                            },
                        },
                    ];

                const result2 = await model.generateContent(retryContentParts);
                const response2 = await result2.response;
                const text2 = response2.text();
                
                const cleanText2 = text2.replace(/```json/g, "").replace(/```/g, "").trim();
                
                try {
                    const parsedData2 = JSON.parse(cleanText2);
                    console.log('OCR - Retry successful, confidence:', parsedData2.confidence);
                    
                    // Use retry result if it has better confidence or valid price
                    if (parsedData2.confidence > parsedData.confidence || 
                        (parsedData.price === 0 && parsedData2.price > 0)) {
                        parsedData = parsedData2;
                    }
                } catch (e) {
                    console.log('OCR - Retry failed to parse, using first attempt');
                }
            }
            
            // Final check - if confidence is still below 20, return fallback
            if (parsedData.confidence < 20) {
                console.log('OCR - Very low confidence, returning fallback');
                parsedData = FALLBACK_RESPONSE;
            }
            
        } catch (e) {
            console.log('OCR - First attempt failed to parse, returning fallback');
            parsedData = FALLBACK_RESPONSE;
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
