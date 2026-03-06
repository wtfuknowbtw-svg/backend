import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

/**
 * Upload image to Cloudinary
 */
export async function uploadImage(
    imageData: string | Buffer,
    folder: string,
    options?: {
        publicId?: string;
        resourceType?: 'image' | 'video' | 'raw' | 'auto';
    }
): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
        const uploadOptions: any = {
            folder: `apnakhata/${folder}`,
            resource_type: options?.resourceType || 'image',
            overwrite: true,
        };

        if (options?.publicId) {
            uploadOptions.public_id = options.publicId;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    reject(error);
                } else if (result) {
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                    });
                } else {
                    reject(new Error('Upload failed: No result returned'));
                }
            }
        );

        if (Buffer.isBuffer(imageData)) {
            uploadStream.end(imageData);
        } else {
            // Base64 string
            uploadStream.end(Buffer.from(imageData, 'base64'));
        }
    });
}

/**
 * Delete image from Cloudinary
 */
export async function deleteImage(publicId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
