import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateImagePrompt } from './src/services/aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

async function testStyleTransfer() {
    console.log('🧪 Testing Style Transfer in Image Prompt Generation...');

    // 1. Define the Reference Style (User's Example)
    const referenceStyle = `A hyper-realistic vertical lifestyle photo (Ratio 4:5, 1080×1350) shot with directional soft light in a clean, modern kitchen space. Captured Shot on Canon EOS R5, 50 mm f/2.0. The camera is positioned in a low-angle diagonal tilt, slightly de baixo para cima, criando uma sensação de protagonismo sutil.

A mulher (25–35 anos) segura o smartphone com uma mão enquanto a outra está próxima a um bowl de comida saudável em cima da bancada — como quem está finalizando uma ação prática e diária. Sua expressão transmite leveza e controle, como se dissesse: “Resolvido com um clique.”

A tela do celular emite um leve glow verde-limão (#A6F000), sugerindo a interface NutriVerse sem legibilidade. O fundo é uma cozinha branca, iluminada, organizada — com detalhes minimalistas (bancada fosca, prateleiras claras). A cena é rica em texturas naturais e modernas: pele, vidro, cerâmica fosca, plástico liso, tecido leve.

Efeitos discretos incluem bloom suave no smartphone, soft grain fino e foco seletivo com bokeh discreto no fundo.`;

    // 2. Define the New Concept (User's Input)
    const newConcept = `**🍽️ Descubra o Chef em Você com NutriVerse!**

Quer transformar ingredientes comuns em pratos dignos de um chef? Com NutriVerse, você pode!

👇👇👇

Com nosso modo despensa, simplesmente fotografe seus ingredientes e deixe a IA cuidar do resto, criando refeições deliciosas e alinhadas ao seu objetivo. Desfrute de pratos sofisticados sem a complicação de planejar!

Experimente hoje e revolucione suas refeições 🍲!

### 📸 DIREÇÃO VISUAL
(Opcional, mas a IA deve inferir a cena de "Descubra o Chef em Você" baseada no texto)`;

    const context = {
        brandName: 'NutriVerse',
        brandingStyle: 'Premium editorial lifestyle',
        // Passed directly as referenceStyle to test the new logic
        referenceStyle: referenceStyle
    };

    console.log('\n--- INPUTS ---');
    console.log('REFERENCE:', referenceStyle.substring(0, 100) + '...');
    console.log('CONCEPT:', newConcept.substring(0, 100) + '...');
    console.log('--------------\n');

    try {
        const generatedPrompt = await generateImagePrompt(newConcept, context);

        console.log('\n✅ GENERATED PROMPT:');
        console.log(generatedPrompt);
        console.log('\n-----------------------------------');

        // Verification Checks
        const checks = {
            hasCanon: generatedPrompt.includes('Canon EOS R5'),
            hasLowAngle: generatedPrompt.toLowerCase().includes('low-angle') || generatedPrompt.toLowerCase().includes('camera is positioned'),
            hasChefTheme: generatedPrompt.toLowerCase().includes('chef') || generatedPrompt.toLowerCase().includes('cooking') || generatedPrompt.toLowerCase().includes('meal') || generatedPrompt.toLowerCase().includes('ingredients'),
            hasOverlay: generatedPrompt.includes('Descubra o Chef em Você') || generatedPrompt.toUpperCase().includes('DESCUBRA O CHEF EM VOCÊ')
        };

        console.log('🔍 VERIFICATION CHECKS:');
        console.log(`- Retained Camera/Style (Canon EOS R5): ${checks.hasCanon ? '✅' : '❌'}`);
        console.log(`- Retained Angle (Low-angle/Position): ${checks.hasLowAngle ? '✅' : '❌'}`);
        console.log(`- Adapted Subject (Chef/Cooking): ${checks.hasChefTheme ? '✅' : '❌'}`);
        console.log(`- Extracted Text Overlay: ${checks.hasOverlay ? '✅' : '❌'}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testStyleTransfer();
