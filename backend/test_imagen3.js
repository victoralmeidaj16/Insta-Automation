import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt: "uma floresta futurista" }],
                parameters: { sampleCount: 1, aspectRatio: "3:4" }
            })
        });
        const data = await response.json();
        if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
            console.log("SUCCESS! Got image structure.");
        } else {
            console.error("FAILED FORMAT:", JSON.stringify(data));
        }
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}
test();
