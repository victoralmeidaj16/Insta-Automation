async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/ai/generate-single-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: "corrigir os textos da imagem, para ser condizente com a mensagem transmitida",
                referenceImage: "https://img.freepik.com/free-photo/vibrant-colors-nature-close-up-wet-purple-daisy-generated-by-artificial-intelligence_188544-137255.jpg",
                aspectRatio: "4:5",
                model: "gemini",
                attachLogo: true
            })
        });
        const text = await response.text();
        console.log("STATUS:", response.status);
        console.log("RESPONSE:", text);
    } catch (e) {
        console.error("FAILED:", e.message);
    }
}
test();
