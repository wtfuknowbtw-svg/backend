import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { uploadImage } from "@/lib/cloudinary";
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const uploadSchema = z.object({
    image: z.string(), // Base64 encoded image
    folder: z.string().optional().default("ocr"), // Folder name (e.g., "ocr", "profile")
});

export async function POST(request: NextRequest) {
    // Verify JWT token
    const { user, error } = await verifyJWT(request);
    if (!user) {
        return unauthorizedResponse(error || "Unauthorized");
    }

    try {
        const body = await request.json();
        const { image, folder } = uploadSchema.parse(body);

        // Validate base64 image
        if (!image || typeof image !== 'string') {
            return NextResponse.json(
                { error: "Invalid image data" },
                { status: 400 }
            );
        }

        // Remove data URL prefix if present (e.g., "data:image/png;base64,...")
        let base64Data = image;
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }

        // Validate file size (approximate - base64 is ~33% larger than binary)
        const imageSize = (base64Data.length * 3) / 4;
        if (imageSize > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `Image too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // Upload to Cloudinary
        const folderPath = `${folder}/${user.businessId}`;
        const { url, publicId } = await uploadImage(base64Data, folderPath);

        return NextResponse.json({
            success: true,
            url,
            publicId,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation Error", details: error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        console.error("Image Upload Error:", error);
        return NextResponse.json(
            { error: "Failed to upload image", message: error.message },
            { status: 500 }
        );
    }
}
