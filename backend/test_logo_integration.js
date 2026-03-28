
import { generateImages } from './src/services/aiService.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

console.log("--- TEST: Viver Mais Logo Integration ---");

// Mock Gemini API to avoid actual costs/calls, or use if available.
// For this test, we mainly want to see if the logo injection logic triggers without errors.
// Since we can't easily mock the internal generateImageWithGemini without a library,
// we will rely on the logs printed by our modified code.

const context = {
    brandName: "Viver Mais Psicologia Streaming",
    brandingStyle: "Editorial"
};

const prompt = "Teste de integração de logo";

// We'll capture console.log to verify
const originalLog = console.log;
let logs = [];
console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
};

try {
    // We expect this to fail if no API Key, but we check logs before that
    await generateImages(prompt, '1:1', 1, 'Editorial', true, context);
} catch (e) {
    // Expected error if no API key or mock failure
    originalLog("Caught expected error (or actual API error):", e.message);
}

// Restore log
console.log = originalLog;

// Verify logs
const logoInjectionLog = logs.find(l => l.includes('Injetando logo "Viver Mais"'));
const attachmentLog = logs.find(l => l.includes('Anexando') && l.includes('imagens de referência'));

if (logoInjectionLog) {
    console.log("✅ SUCCESS: Logic detected 'Viver Mais' and attempted to inject logo.");
} else {
    console.error("❌ FAILURE: Logo injection log missing.");
}

if (attachmentLog) {
    console.log("✅ SUCCESS: Reference image attachment logic triggered.");
} else {
    console.log("⚠️ WARNING: Attachment logic not triggered (maybe logo file missing? check 'Logo Viver Mais não encontrado' log).");
}
