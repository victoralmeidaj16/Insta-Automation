import { createBrowser, createPage, saveCookies, loadCookies } from './src/automation/browser.js';
import { randomDelay } from './src/automation/humanBehavior.js';

const INSTAGRAM_URL = 'https://www.instagram.com';
const accountId = 'GGpUHF7XgkuBOW89C2w8';

async function loginManually() {
    console.log('🔐 Abrindo navegador para login manual...\n');
    console.log('Por favor:');
    console.log('1. Faça login no Instagram');
    console.log('2. Aguarde até estar na página inicial');
    console.log('3. Os cookies serão salvos automaticamente\n');

    const browser = await createBrowser();
    const page = await createPage(browser);

    try {
        // Tentar carregar cookies existentes
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        const cookiesLoaded = await loadCookies(page, accountId);

        if (cookiesLoaded) {
            await page.reload({ waitUntil: 'networkidle2' });
            await randomDelay(2000, 4000);
            console.log('✅ Cookies existentes carregados!\n');
        }

        console.log('⏳ Aguardando 60 segundos para você fazer login...\n');
        console.log('O navegador NÃO irá fechar automaticamente.');
        console.log('Após fazer login, pressione Ctrl+C neste terminal para salvar os cookies.\n');

        // Aguardar 60 segundos
        await randomDelay(60000, 60000);

        // Salvar cookies
        await saveCookies(page, accountId);
        console.log('\n✅ Cookies salvos com sucesso!');
        console.log('Agora você pode executar: node process-story.js\n');

        await browser.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        await browser.close();
        process.exit(1);
    }
}

loginManually();
