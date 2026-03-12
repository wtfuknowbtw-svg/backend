import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";

const voiceSchema = z.object({
    transcript: z.string().min(1, "Transcript is required"),
});

// Voice processing prompt for Indian shop transactions
const VOICE_PROCESSING_PROMPT = `You are an expert at understanding Indian shop transactions spoken in Hindi, English, or mixed Hinglish. Extract transaction data from this voice transcript and return ONLY valid JSON.
Transcript: [INSERT_TRANSCRIPT]
Rules:

customerName: extract person name. Common Indian names: Ram, Raju, Suresh, Ramesh, Vijay, Mohan. If unclear set empty string
itemName: extract item. If vague words like saman/cheez/item/stuff → set as General Items. Common items: chawal, daal, doodh, sabzi, tel, atta
price: extract number only. Words like sau=100, pachas=50, hazaar=1000, do sau=200
type: if words like diya/udhar/baaki/credit/dhara → credit. If liya/payment/cash/sale/mila → cash. Default to credit
date: if mentioned extract it, otherwise use today
confidence: 90 if name+price both clear, 60 if only price clear, 30 if both unclear
rawText: the original transcript

Return ONLY this JSON, no extra text:
{ customerName, itemName, price, type, date, confidence, rawText }`;

// Fallback response for very low confidence
const FALLBACK_RESPONSE = {
    customerName: '',
    itemName: '',
    price: 0,
    type: 'credit',
    date: new Date().toISOString().split('T')[0],
    confidence: 0,
    rawText: 'Could not process voice'
};

export async function POST(request: NextRequest) {
    console.log('GEMINI KEY EXISTS:', !!process.env.GEMINI_API_KEY);
    console.log('Voice API - Request received');
    
    // Debug: Print authorization header
    const authHeader = request.headers.get('authorization');
    console.log('Voice Request - Authorization Header:', authHeader);
    
    // Verify JWT token
    const { user, error } = await verifyJWT(request);
    console.log('Voice JWT Verification - User:', user);
    console.log('Voice JWT Verification - Error:', error);
    
    if (!user) {
        console.error('Voice JWT Failed - Full Error:', error);
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { transcript } = voiceSchema.parse(body);

        console.log('Voice - Processing transcript:', transcript);

        const apiKey = process.env.GEMINI_API_KEY;
        console.log('Voice Request - Gemini API Key exists:', !!apiKey);
        
        if (!apiKey) {
            console.error('Voice Error - Gemini API key not configured in environment');
            return NextResponse.json({ 
                error: "Gemini API key not configured on server. Please contact administrator." 
            }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Process transcript with Gemini (no audio transcription needed)
        console.log('Voice - Processing transcript with Gemini 2.0 Flash');
        try {
            const prompt = VOICE_PROCESSING_PROMPT.replace('[INSERT_TRANSCRIPT]', transcript);
            
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            console.log('Voice - Gemini response received:', responseText);

            // Clean up JSON response if present
            const cleanText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            let parsedData;
            try {
                parsedData = JSON.parse(cleanText);
                console.log('Voice - Successfully parsed response');
                
                // Ensure required fields have defaults
                parsedData = {
                    customerName: parsedData.customerName || '',
                    itemName: parsedData.itemName || 'General Items',
                    price: parsedData.price || 0,
                    type: parsedData.type || 'credit',
                    date: parsedData.date || new Date().toISOString().split('T')[0],
                    confidence: parsedData.confidence || 30,
                    rawText: transcript
                };

                // Handle Hinglish patterns
                parsedData = applyHinglishPatterns(transcript, parsedData);
                
                console.log('Voice - Final processed data:', parsedData);
                
            } catch (parseError) {
                console.error('Voice - Failed to parse JSON response:', parseError);
                console.error('Voice - Raw response:', responseText);
                parsedData = {
                    ...FALLBACK_RESPONSE,
                    rawText: transcript,
                    confidence: 20
                };
            }

            return NextResponse.json({ data: [parsedData] });

        } catch (geminiError) {
            console.error('Voice - Gemini API error:', geminiError);
            return NextResponse.json({ 
                error: "AI processing failed. Please try again." 
            }, { status: 500 });
        }

    } catch (error) {
        console.error('Voice API - Unexpected error:', error);
        return NextResponse.json({ 
            error: "Internal server error" 
        }, { status: 500 });
    }
}

// Apply Hinglish pattern matching
function applyHinglishPatterns(transcript: string, data: any): any {
    const lowerTranscript = transcript.toLowerCase();
    
    // Pattern: 'X ko Y diya' → customerName=X, type=credit
    const koDiyaMatch = lowerTranscript.match(/(\w+)\s+ko\s+.+\s+diya/);
    if (koDiyaMatch) {
        data.customerName = koDiyaMatch[1];
        data.type = 'credit';
    }
    
    // Pattern: 'X se Y liya' → customerName=X, type=cash
    const seLiyaMatch = lowerTranscript.match(/(\w+)\s+se\s+.+\s+liya/);
    if (seLiyaMatch) {
        data.customerName = seLiyaMatch[1];
        data.type = 'cash';
    }
    
    // Pattern: 'Y ka payment mila X se' → customerName=X, type=cash
    const paymentMilaMatch = lowerTranscript.match(/.+\s+payment\s+mila\s+(\w+)\s+se/);
    if (paymentMilaMatch) {
        data.customerName = paymentMilaMatch[1];
        data.type = 'cash';
    }
    
    // Convert Hindi numbers to English
    const hindiNumbers: { [key: string]: number } = {
        'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'panch': 5,
        'das': 10, 'bis': 20, 'pachas': 50, 'sau': 100, 'hazaar': 1000
    };
    
    // Replace Hindi numbers in transcript for better price extraction
    let processedTranscript = lowerTranscript;
    Object.entries(hindiNumbers).forEach(([hindi, english]) => {
        processedTranscript = processedTranscript.replace(new RegExp(hindi, 'g'), english.toString());
    });
    
    // Try to extract price from processed transcript if not already found
    if (!data.price || data.price === 0) {
        const priceMatch = processedTranscript.match(/(\d+)/);
        if (priceMatch) {
            data.price = parseInt(priceMatch[1]);
        }
    }
    
    return data;
}
