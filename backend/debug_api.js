import axios from 'axios';

async function test() {
    try {
        const response = await axios.post('http://localhost:5000/api/ai/generate-single-image', {
            prompt: "corrigir os textos da imagem, para ser condizente com as",
            referenceImage: "https://img.freepik.com/free-photo/vibrant-colors-nature-close-up-wet-purple-daisy-generated-by-artificial-intelligence_188544-137255.jpg",
            aspectRatio: "4:5",
            model: "gemini",
            attachLogo: true
        });
        console.log("SUCCESS:", response.data);
    } catch (e) {
        console.error("FAILED:", e.response ? e.response.data : e.message);
    }
}
test();
