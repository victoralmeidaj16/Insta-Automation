
import { getEditorialSystemPrompt } from './src/services/aiService.js';
import dotenv from 'dotenv';
dotenv.config();

console.log("--- TEST: Viver Mais Branding ---");

const context = {
    brandName: "Viver Mais Psicologia Streaming",
    productService: "Psychology Streaming",
    targetAudience: "General",
    primaryColor: "#9446C4",
    brandingStyle: "Editorial",
    profileDescription: "A streaming platform for psychology."
};

const prompt = getEditorialSystemPrompt("Test Description", 1, context);

if (prompt.includes("BRAND COLORS (STRICTLY ENFORCE THESE PURPLE TONES)")) {
    console.log("✅ SUCCESS: Brand colors instruction FOUND in system prompt.");
    console.log("Fragment:");
    console.log(prompt.split("BRAND COLORS")[1].split("DO NOT use generic purple")[0]);
} else {
    console.error("❌ FAILURE: Brand colors instruction NOT found.");
    console.log("Full Prompt Preview:");
    console.log(prompt.substring(0, 500));
}

console.log("\n--- TEST: Other Brand (Control) ---");
const otherContext = {
    brandName: "Other Brand",
    primaryColor: "#000000"
};
const otherPrompt = getEditorialSystemPrompt("Test", 1, otherContext);

if (!otherPrompt.includes("BRAND COLORS (STRICTLY ENFORCE")) {
    console.log("✅ SUCCESS: Brand colors instruction ABSENT for other brand.");
} else {
    console.error("❌ FAILURE: Brand colors instruction leakage.");
}
