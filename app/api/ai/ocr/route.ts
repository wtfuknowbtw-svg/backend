import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

const ocrSchema = z.object({
    imageUrl: z.string().url().optional(),
    base64Image: z.string().optional(),
    transcript: z.string().optional(),
}).refine(data => data.imageUrl || data.base64Image || data.transcript, {
    message: "Either imageUrl, base64Image, or transcript must be provided",
});

// Prompt for structuring text/transcripts into transaction format
const STRUCTURING_PROMPT = `You are an expert Indian shop assistant, khata book keeper, and transaction parser.
Analyze the following text extracted from a receipt, hand-written bill, or shop record (which may contain mixed English, Hindi, or Marathi text with common items like chawal, daal, doodh, sabzi, tel, atta, cheeni, namak, etc., and common names like Ram, Raju, Suresh, Ramesh, Vijay, Mohan, Sita, Geeta, etc.).

Raw Text / Voice Transcript:
"""
[RAW_TEXT]
"""

You need to extract the transaction details and return ONLY a valid JSON object matching the format below.
Do not wrap your response in markdown code blocks like \`\`\`json. Return ONLY the JSON object.

Format:
{
  "customerName": "Name of customer (string, e.g., 'Ramesh'). Default to 'Unknown Customer' if not mentioned.",
  "itemName": "Specific item name(s) (string, e.g., 'Tel, Atta'). If multiple, list them comma-separated. Default to 'Items' if not specified.",
  "price": number, (The total price or transaction amount as a number, e.g., 250. Extract only numeric value, no rupee/Rs symbol),
  "type": "credit" or "cash", (Use "credit" if it is credit/udhar/dues/lent/borrowed/owed, or "cash" if paid/received/settled. Default to "credit"),
  "quantity": number, (Quantity of items as a number. Default to 1 if not specified),
  "confidence": number (A score between 0 and 100 representing how confident you are in this extraction based on the clarity and completeness of the raw text)
}`;

// Fallback response for very low confidence
const FALLBACK_RESPONSE = {
    customerName: 'Unknown Customer',
    itemName: 'Items',
    price: 0,
    type: 'credit',
    quantity: 1,
    confidence: 0,
    rawText: 'Could not read image'
};

function fallbackStructureFromText(rawText: string): any {
    console.log('OCR - Using fallback text parsing');
    const lower = rawText.toLowerCase();
    
    // Extract price/amount
    let price = 0;
    const priceMatch = rawText.match(/(?:rs\.?|rupees|₹)?\s*(\d+(?:\.\d{1,2})?)/i) || rawText.match(/(\d+(?:\.\d{1,2})?)/);
    if (priceMatch) {
        price = parseFloat(priceMatch[1]);
    }

    // Determine type
    let type = 'credit';
    if (lower.includes('cash') || lower.includes('paid') || lower.includes('received') || lower.includes('nagad')) {
        type = 'cash';
    }

    return {
        customerName: 'Unknown Customer',
        itemName: 'Items',
        price: price,
        type: type,
        quantity: 1,
        confidence: 30,
        rawText: rawText
    };
}

async function structureTextWithGemini(rawText: string, geminiKey: string): Promise<any> {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = STRUCTURING_PROMPT.replace('[RAW_TEXT]', rawText);
    console.log('OCR - Sending raw text to Gemini for structuring...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log('OCR - Gemini raw response:', responseText);

    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
        const rawParsed = JSON.parse(cleanJson);
        return {
            customerName: rawParsed.customerName || 'Unknown Customer',
            itemName: rawParsed.itemName || 'Items',
            price: Number(rawParsed.price) || 0,
            type: (rawParsed.type || 'credit').toLowerCase() === 'cash' ? 'cash' : 'credit',
            quantity: Number(rawParsed.quantity) || 1,
            confidence: Number(rawParsed.confidence) || 70,
            rawText: rawText
        };
    } catch (e) {
        console.error('OCR - Failed to parse Gemini response as JSON:', e);
        return fallbackStructureFromText(rawText);
    }
}

async function getGoogleVisionAccessToken(): Promise<string | null> {
    try {
        let creds: any = null;

        // 1. Check if stringified credentials are in environment variable
        if (process.env.GOOGLE_CLOUD_VISION_CREDS) {
            creds = JSON.parse(process.env.GOOGLE_CLOUD_VISION_CREDS);
        } else {
            // 2. Check if local google-vision-api.json exists
            const localPath = path.join(process.cwd(), "google-vision-api.json");
            if (fs.existsSync(localPath)) {
                const fileContent = fs.readFileSync(localPath, "utf-8");
                creds = JSON.parse(fileContent);
            }
        }

        if (!creds || !creds.private_key || !creds.client_email) {
            return null;
        }

        console.log("OCR - Exchanging Google Service Account credentials for OAuth2 Access Token...");
        const iat = Math.floor(Date.now() / 1000);
        const exp = iat + 3600;

        const payload = {
            iss: creds.client_email,
            scope: "https://www.googleapis.com/auth/cloud-platform",
            aud: creds.token_uri || "https://oauth2.googleapis.com/token",
            exp,
            iat,
        };

        const token = jwt.sign(payload, creds.private_key, { algorithm: "RS256" });

        const response = await fetch(creds.token_uri || "https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: token,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to exchange JWT for OAuth2 token:", errorText);
            return null;
        }

        const data = await response.json();
        return data.access_token;
    } catch (err) {
        console.error("Error during Google Cloud Vision OAuth2 exchange:", err);
        return null;
    }
}

export async function POST(request: NextRequest) {
    // Verify JWT token
    const { user, error } = await verifyJWT(request);
    console.log('OCR JWT Verification - User:', user);
    if (!user) {
        console.error('OCR JWT Failed - Full Error:', error);
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { imageUrl, base64Image, transcript } = ocrSchema.parse(body);

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.error('OCR Error - Gemini API key not configured');
            return NextResponse.json({ 
                error: "Gemini API key not configured on server. Please contact administrator." 
            }, { status: 500 });
        }

        let rawText = '';

        if (transcript) {
            rawText = transcript;
            console.log('OCR - Processing voice transcript directly');
        } else {
            // Process images with Google Cloud Vision API
            let base64Data = base64Image;
            let mimeType = "image/jpeg";

            console.log('OCR - Processing image, base64Image provided:', !!base64Image);

            if (imageUrl) {
                console.log('OCR - Fetching image from URL:', imageUrl);
                const imageResp = await fetch(imageUrl);
                
                if (!imageResp.ok) {
                    console.error('OCR - Failed to download image, status:', imageResp.status);
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

            const visionApiKey = process.env.GOOGLE_CLOUD_VISION_KEY;
            let visionUrl = `https://vision.googleapis.com/v1/images:annotate`;
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            if (visionApiKey && visionApiKey !== "AIzaSyA77ittfjA0yF7HjZMoPHx-CDA7oLpqVws") {
                // If a custom API key is supplied, use it
                console.log("OCR - Using custom GOOGLE_CLOUD_VISION_KEY API key");
                visionUrl += `?key=${visionApiKey}`;
            } else {
                // Otherwise, try to use the Service Account to generate an Access Token
                const accessToken = await getGoogleVisionAccessToken();
                if (accessToken) {
                    console.log("OCR - Authenticating using Google Service Account OAuth2 Access Token");
                    headers["Authorization"] = `Bearer ${accessToken}`;
                } else if (visionApiKey) {
                    // Fallback to the env API key if service account credentials are not configured
                    console.log("OCR - Service account not found, falling back to GOOGLE_CLOUD_VISION_KEY");
                    visionUrl += `?key=${visionApiKey}`;
                } else {
                    console.error("OCR Error - No credentials found (neither API key nor service account)");
                    return NextResponse.json({ 
                        error: "Google Cloud Vision credentials not configured on server. Please contact administrator." 
                    }, { status: 500 });
                }
            }

            console.log('OCR - Calling Google Cloud Vision API...');
            const visionResponse = await fetch(visionUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    requests: [
                        {
                            image: {
                                content: base64Data,
                            },
                            features: [
                                {
                                    type: "TEXT_DETECTION",
                                },
                            ],
                        },
                    ],
                }),
            });

            if (!visionResponse.ok) {
                const errText = await visionResponse.text();
                console.error('Google Vision API Error:', errText);
                return NextResponse.json({ error: "Google Vision API request failed" }, { status: visionResponse.status });
            }

            const visionData = await visionResponse.json();
            rawText = visionData.responses?.[0]?.fullTextAnnotation?.text || '';
            console.log('Google Vision API successfully extracted text, length:', rawText.length);
        }

        if (!rawText || !rawText.trim()) {
            console.log('OCR - No text detected in image or empty transcript');
            return NextResponse.json({ data: [FALLBACK_RESPONSE] });
        }

        // Structure the raw extracted text using Gemini
        const parsedData = await structureTextWithGemini(rawText, geminiKey);
        return NextResponse.json({ data: [parsedData] });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Error", details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error("OCR API Error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
