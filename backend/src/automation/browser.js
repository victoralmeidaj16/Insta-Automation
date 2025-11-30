import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

// Adicionar plugin stealth para evitar detecção
puppeteer.use(StealthPlugin());

// Diretório para salvar cookies
const COOKIES_DIR = path.join(process.cwd(), 'cookies');

// Criar diretório de cookies se não existir
if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

/**
 * User agents reais e atualizados
 */
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

/**
 * Cria uma nova instância do navegador com configurações anti-detecção
 */
export async function createBrowser() {
    const browser = await puppeteer.launch({
        headless: process.env.NODE_ENV === 'production' ? 'new' : false, // Mostra navegador em dev
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--user-agent=' + USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        ],
    });

    return browser;
}

/**
 * Cria uma nova página com configurações randomizadas
 */
export async function createPage(browser) {
    const page = await browser.newPage();

    // Viewport randomizado (simula diferentes dispositivos)
    const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
    ];

    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(viewport);

    // User-Agent aleatório
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await page.setUserAgent(userAgent);

    // Configurar timezone e locale (Brasil)
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'pt-BR' });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
    });

    // Remover propriedades que indicam automação
    await page.evaluateOnNewDocument(() => {
        delete navigator.__proto__.webdriver;
    });

    return page;
}

/**
 * Salva cookies da sessão
 */
export async function saveCookies(page, accountId) {
    const cookies = await page.cookies();
    const cookiesPath = path.join(COOKIES_DIR, `${accountId}.json`);
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`✅ Cookies salvos para conta ${accountId}`);
}

/**
 * Carrega cookies salvos
 */
export async function loadCookies(page, accountId) {
    const cookiesPath = path.join(COOKIES_DIR, `${accountId}.json`);

    if (fs.existsSync(cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
        await page.setCookie(...cookies);
        console.log(`✅ Cookies carregados para conta ${accountId}`);
        return true;
    }

    return false;
}

/**
 * Remove cookies salvos
 */
export function deleteCookies(accountId) {
    const cookiesPath = path.join(COOKIES_DIR, `${accountId}.json`);
    if (fs.existsSync(cookiesPath)) {
        fs.unlinkSync(cookiesPath);
        console.log(`✅ Cookies removidos para conta ${accountId}`);
    }
}
