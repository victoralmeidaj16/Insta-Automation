import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.post(url, {
            system_instruction: { parts: [{ text: "You are a test." }] },
            contents: [{ role: 'user', parts: [{ text: "Hello!" }] }]
        });
        console.log("Success:", JSON.stringify(response.data));
    } catch (error) {
        console.error("Error:", error?.response?.data || error.message);
    }
}
test();
