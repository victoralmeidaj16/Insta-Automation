/**
 * Simulação de comportamento humano para evitar detecção de bots
 */

/**
 * Delay aleatório entre min e max milissegundos
 */
export function randomDelay(min = 1000, max = 5000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Rolar o feed do Instagram de forma aleatória
 */
export async function scrollFeed(page) {
    console.log('🎭 Comportamento humano: Rolando o feed...');

    const scrolls = Math.floor(Math.random() * 3) + 2; // 2-4 scrolls

    for (let i = 0; i < scrolls; i++) {
        await page.evaluate(() => {
            window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
        });
        await randomDelay(1000, 3000);
    }

    console.log(`✅ Rolou o feed ${scrolls} vezes`);
}

/**
 * Curtir 2-4 posts aleatórios do feed
 */
export async function likeRandomPosts(page) {
    console.log('🎭 Comportamento humano: Curtindo posts aleatórios...');

    try {
        // Encontrar botões de curtir (like)
        const likeButtons = await page.$$('svg[aria-label="Curtir"], svg[aria-label="Like"]');

        if (likeButtons.length === 0) {
            console.log('⚠️ Nenhum botão de curtir encontrado');
            return;
        }

        const likesToDo = Math.min(Math.floor(Math.random() * 3) + 2, likeButtons.length); // 2-4 curtidas

        for (let i = 0; i < likesToDo; i++) {
            const randomIndex = Math.floor(Math.random() * likeButtons.length);
            await likeButtons[randomIndex].click();
            await randomDelay(2000, 5000);
        }

        console.log(`✅ Curtiu ${likesToDo} posts`);
    } catch (error) {
        console.log('⚠️ Erro ao curtir posts:', error.message);
    }
}

/**
 * Pausar em um post por alguns segundos (simular leitura)
 */
export async function pauseOnPost(page) {
    console.log('🎭 Comportamento humano: Pausando em um post...');

    const pauseDuration = Math.floor(Math.random() * 5000) + 3000; // 3-8 segundos
    await randomDelay(pauseDuration, pauseDuration + 1000);

    console.log(`✅ Pausou por ${(pauseDuration / 1000).toFixed(1)}s`);
}

/**
 * Simula movimento humano do mouse
 */
export async function humanMouseMove(page, element) {
    const box = await element.boundingBox();
    if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        // Move o mouse em etapas para parecer mais humano
        await page.mouse.move(x - 50, y - 50);
        await randomDelay(100, 300);
        await page.mouse.move(x, y);
        await randomDelay(100, 300);
    }
}

/**
 * Executa uma sequência completa de comportamento humano antes de postar
 */
export async function simulateHumanActivity(page) {
    console.log('🎭 Iniciando simulação de comportamento humano...');

    try {
        // 1. Scroll aleatório
        await scrollFeed(page);
        await randomDelay(2000, 4000);

        // 2. Curtir alguns posts
        await likeRandomPosts(page);
        await randomDelay(2000, 4000);

        // 3. Pausar em um post
        await pauseOnPost(page);

        console.log('✅ Comportamento humano simulado com sucesso!');
    } catch (error) {
        console.log('⚠️ Erro durante simulação de comportamento:', error.message);
        // Continua mesmo com erros - não crítico
    }
}
