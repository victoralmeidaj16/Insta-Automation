import { generateSingleImage } from './src/services/aiService.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    try {
        console.log("Starting debug with Gemini KEY:", process.env.GEMINI_API_KEY ? "YES" : "NO");
        const url = await generateSingleImage("mudar a cor de fundo para vermelho neon", "4:5", null, false, { attachLogo: false }, ["https://images.unsplash.com/photo-1549692520-acc6669e2f0c?q=80&w=800&auto=format&fit=crop"], 'gemini');
        console.log("SUCCESS");
    } catch (e) {
        console.error("FAILED MAIN:", e.message);
    }
}
test();
