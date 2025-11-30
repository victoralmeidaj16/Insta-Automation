import { createBrowser, createPage, saveCookies, loadCookies } from './browser.js';
import { randomDelay, simulateHumanActivity, humanMouseMove } from './humanBehavior.js';

const INSTAGRAM_URL = 'https://www.instagram.com';

/**
 * Faz login no Instagram
 */
export async function login(accountId, username, password, stayLoggedIn = true) {
    console.log(`🔐 Iniciando login para @${username}...`);

    const browser = await createBrowser();
    const page = await createPage(browser);

    try {
        // Tentar carregar cookies existentes
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        const cookiesLoaded = await loadCookies(page, accountId);

        if (cookiesLoaded) {
            await page.reload({ waitUntil: 'networkidle2' });
            await randomDelay(2000, 4000);

            // Verificar se ainda está logado
            const isLoggedIn = await page.$('svg[aria-label="Página inicial"]') !== null ||
                await page.$('svg[aria-label="Home"]') !== null;

            if (isLoggedIn) {
                console.log('✅ Login verificado com cookies salvos!');
                await browser.close();
                return { success: true, message: 'Login realizado com cookies' };
            } else {
                console.log('⚠️ Cookies expirados, fazendo login manual...');
            }
        }

        // Login manual
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);

        // Aceitar cookies se aparecer
        try {
            const acceptCookiesBtn = await page.$('button:has-text("Permitir todos os cookies"), button:has-text("Allow all cookies")');
            if (acceptCookiesBtn) {
                await acceptCookiesBtn.click();
                await randomDelay(1000, 2000);
            }
        } catch (e) {
            // Não tem botão de cookies ou já foi aceito
        }

        // Preencher username
        console.log('📝 Preenchendo credenciais...');
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.type('input[name="username"]', username, { delay: Math.random() * 100 + 50 });
        await randomDelay(500, 1000);

        // Preencher senha
        await page.type('input[name="password"]', password, { delay: Math.random() * 100 + 50 });
        await randomDelay(1000, 2000);

        // Clicar em "entrar"
        const loginButton = await page.$('button[type="submit"]');
        await humanMouseMove(page, loginButton);
        await loginButton.click();

        console.log('⏳ Aguardando resposta do login...');
        await randomDelay(3000, 5000);

        // Aguardar navegação ou erro
        try {
            await page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle2' });
        } catch (e) {
            // Pode não navegar se der erro
        }

        // Verificar se login foi bem-sucedido
        const errorElement = await page.$('div[role="alert"]');
        if (errorElement) {
            const errorText = await page.evaluate(el => el.textContent, errorElement);
            console.error('❌ Erro no login:', errorText);
            await browser.close();
            return { success: false, message: errorText };
        }

        // Verificar se apresentou verificação 2FA
        const twoFactorElement = await page.$('input[name="verificationCode"]');
        if (twoFactorElement) {
            console.log('⚠️ Verificação de 2FA detectada!');
            console.log('Por favor, complete manualmente no navegador.');
            console.log('Aguardando 60 segundos...');
            await randomDelay(60000, 60000);
        }

        // Lidar com popup "Salvar informações de login"
        try {
            const saveInfoBtn = await page.$('button:has-text("Agora não"), button:has-text("Not now")');
            if (saveInfoBtn) {
                await saveInfoBtn.click();
                await randomDelay(1000, 2000);
            }
        } catch (e) {
            // Popup não apareceu
        }

        // Lidar com popup "Ativar notificações"
        try {
            const notNowBtn = await page.$('button:has-text("Agora não"), button:has-text("Not Now")');
            if (notNowBtn) {
                await notNowBtn.click();
                await randomDelay(1000, 2000);
            }
        } catch (e) {
            // Popup não apareceu
        }

        // Verificar se está na página inicial
        const isLoggedIn = await page.$('svg[aria-label="Página inicial"]') !== null ||
            await page.$('svg[aria-label="Home"]') !== null;

        if (!isLoggedIn) {
            console.error('❌ Login falhou - não detectou página inicial');
            await browser.close();
            return { success: false, message: 'Login falhou' };
        }

        console.log('✅ Login bem-sucedido!');

        // Salvar cookies se "manter logado" estiver ativo
        if (stayLoggedIn) {
            await saveCookies(page, accountId);
        }

        await browser.close();
        return { success: true, message: 'Login realizado com sucesso' };

    } catch (error) {
        console.error('❌ Erro durante login:', error);
        await browser.close();
        return { success: false, message: error.message };
    }
}

/**
 * Cria um post estático (imagem única)
 */
export async function createStaticPost(accountId, imagePath, caption) {
    console.log(`📸 Criando post estático para conta ${accountId}...`);

    const browser = await createBrowser();
    const page = await createPage(browser);

    try {
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        await loadCookies(page, accountId);
        await page.reload({ waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);

        // Simular comportamento humano antes de postar
        await simulateHumanActivity(page);
        await randomDelay(2000, 4000);

        // Clicar no botão "Criar" (ícone +)
        console.log('➕ Abrindo modal de criação...');
        const createButton = await page.$('svg[aria-label="Nova publicação"], svg[aria-label="New post"]');
        if (!createButton) {
            throw new Error('Botão de criar não encontrado - verifique se está logado');
        }

        await createButton.click();
        await randomDelay(2000, 3000);

        // Upload da imagem
        console.log('📤 Fazendo upload da imagem...');
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(imagePath);
        await randomDelay(3000, 5000);

        // Clicar em "Avançar"
        console.log('⏭️ Avançando...');
        let nextButton = await page.$('button:has-text("Avançar"), button:has-text("Next")');
        if (nextButton) {
            await nextButton.click();
            await randomDelay(2000, 3000);
        }

        // Clicar em "Avançar" novamente (filtros)
        nextButton = await page.$('button:has-text("Avançar"), button:has-text("Next")');
        if (nextButton) {
            await nextButton.click();
            await randomDelay(2000, 3000);
        }

        // Adicionar legenda
        if (caption) {
            console.log('✍️ Adicionando legenda...');
            const captionArea = await page.$('textarea[aria-label="Escreva uma legenda..."], textarea[aria-label="Write a caption..."]');
            if (captionArea) {
                await captionArea.type(caption, { delay: Math.random() * 50 + 30 });
                await randomDelay(1000, 2000);
            }
        }

        // Clicar em "Compartilhar"
        console.log('🚀 Compartilhando post...');
        const shareButton = await page.$('button:has-text("Compartilhar"), button:has-text("Share")');
        if (shareButton) {
            await shareButton.click();
            await randomDelay(5000, 8000);
        } else {
            throw new Error('Botão compartilhar não encontrado');
        }

        // Verificar se foi publicado com sucesso
        const successIndicator = await page.$('img[alt="Foto de perfil animada"]') ||
            await page.$('svg[aria-label="Sua publicação foi compartilhada"]');

        if (successIndicator) {
            console.log('✅ Post publicado com sucesso!');
            await browser.close();
            return { success: true, message: 'Post criado com sucesso' };
        } else {
            throw new Error('Não foi possível confirmar publicação');
        }

    } catch (error) {
        console.error('❌ Erro ao criar post:', error);
        await browser.close();
        return { success: false, message: error.message };
    }
}

/**
 * Cria um carrossel (múltiplas imagens)
 */
export async function createCarousel(accountId, imagePaths, caption) {
    console.log(`🖼️ Criando carrossel com ${imagePaths.length} imagens...`);

    const browser = await createBrowser();
    const page = await createPage(browser);

    try {
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        await loadCookies(page, accountId);
        await page.reload({ waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);

        await simulateHumanActivity(page);
        await randomDelay(2000, 4000);

        // Clicar no botão "Criar"
        const createButton = await page.$('svg[aria-label="Nova publicação"], svg[aria-label="New post"]');
        await createButton.click();
        await randomDelay(2000, 3000);

        // Upload das imagens
        console.log('📤 Fazendo upload das imagens...');
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(...imagePaths);
        await randomDelay(3000, 5000);

        // Clicar em "Selecionar vários" se necessário
        try {
            const selectMultipleBtn = await page.$('button:has-text("Selecionar vários"), button:has-text("Select multiple")');
            if (selectMultipleBtn) {
                await selectMultipleBtn.click();
                await randomDelay(1000, 2000);
            }
        } catch (e) {
            // Já está em modo múltiplo
        }

        // Continuar com os mesmos passos do post estático
        let nextButton = await page.$('button:has-text("Avançar"), button:has-text("Next")');
        if (nextButton) {
            await nextButton.click();
            await randomDelay(2000, 3000);
        }

        nextButton = await page.$('button:has-text("Avançar"), button:has-text("Next")');
        if (nextButton) {
            await nextButton.click();
            await randomDelay(2000, 3000);
        }

        if (caption) {
            const captionArea = await page.$('textarea[aria-label="Escreva uma legenda..."], textarea[aria-label="Write a caption..."]');
            if (captionArea) {
                await captionArea.type(caption, { delay: Math.random() * 50 + 30 });
                await randomDelay(1000, 2000);
            }
        }

        const shareButton = await page.$('button:has-text("Compartilhar"), button:has-text("Share")');
        await shareButton.click();
        await randomDelay(5000, 8000);

        console.log('✅ Carrossel publicado com sucesso!');
        await browser.close();
        return { success: true, message: 'Carrossel criado com sucesso' };

    } catch (error) {
        console.error('❌ Erro ao criar carrossel:', error);
        await browser.close();
        return { success: false, message: error.message };
    }
}

/**
 * Cria um Reel (vídeo)
 */
export async function createReel(accountId, videoPath, caption) {
    console.log(`🎬 Criando Reel para conta ${accountId}...`);

    // A lógica é similar, mas o Instagram detecta automaticamente
    // que é vídeo e oferece opção de Reel
    return createStaticPost(accountId, videoPath, caption);
}

/**
 * Cria um Story
 */
export async function createStory(accountId, mediaPath) {
    console.log(`📱 Criando Story para conta ${accountId}...`);

    const browser = await createBrowser();
    const page = await createPage(browser);

    try {
        await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
        await loadCookies(page, accountId);
        await page.reload({ waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);

        // Clicar no botão "Criar Story" (seu círculo de foto no topo)
        const storyButton = await page.$('svg[aria-label="Criar story"], svg[aria-label="Create story"]') ||
            await page.$('button:has-text("Criar story")');

        if (!storyButton) {
            throw new Error('Botão de criar story não encontrado');
        }

        await storyButton.click();
        await randomDelay(2000, 3000);

        // Upload da mídia
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(mediaPath);
        await randomDelay(3000, 5000);

        // Clicar em "Adicionar ao story"
        const addToStoryBtn = await page.$('button:has-text("Adicionar ao story"), button:has-text("Add to story")');
        if (addToStoryBtn) {
            await addToStoryBtn.click();
            await randomDelay(3000, 5000);
        }

        console.log('✅ Story publicado com sucesso!');
        await browser.close();
        return { success: true, message: 'Story criado com sucesso' };

    } catch (error) {
        console.error('❌ Erro ao criar story:', error);
        await browser.close();
        return { success: false, message: error.message };
    }
}
