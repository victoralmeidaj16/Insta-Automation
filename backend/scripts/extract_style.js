
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const imagePath = process.argv[2];

if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
}

if (!imagePath) {
    console.error('❌ Please provide an image path');
    process.exit(1);
}

async function run() {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Try gemini-1.5-pro-latest which is often more stable availability-wise
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const imageData = fs.readFileSync(imagePath);
        const imageBase64 = imageData.toString('base64');

        const prompt = `Analyze this image and describe its visual style in extreme detail for a generative AI prompt. 
        Focus on:
        1. Lighting (type, direction, color, mood)
        2. Textures (materials, surface details, skin, objects)
        3. Color Palette (primary, secondary, accents, grading)
        4. Composition (framing, depth of field, perspective)
        5. Artistic Style (3D render, cinematic, painterly, surreal, etc.)
        6. Mood/Atmosphere (psychological, emotional effect)

        Output ONLY the comma-separated descriptive keywords and phrases suitable for an image generation prompt. Do not write intro/outro text.`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/png"
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();
        console.log("🎨 Style Description:");
        console.log(text.trim());

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
