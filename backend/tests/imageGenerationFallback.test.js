import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Cadeia de provedores de imagem: Gemini é o padrão, e Seedream (BytePlus)
// cobre falhas ou indisponibilidade de quota do provedor principal.
const generateImageWithGemini = vi.fn();
const generateImageWithSeedream = vi.fn();
const normalizeBrandKey = vi.fn(() => '');

let generateSingleImage;

beforeEach(async () => {
    vi.resetModules();
    generateImageWithGemini.mockReset();
    generateImageWithSeedream.mockReset();
    normalizeBrandKey.mockClear();

    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.SEEDREAM_API_TOKEN = 'seedream-token';

    vi.doMock('openai', () => ({
        default: class {
            constructor() { this.chat = { completions: { create: vi.fn() } }; }
        }
    }));
    vi.doMock('../src/services/image/imageGenerationAdapters.js', () => ({
        generateImageWithGemini,
        generateImageWithSeedream
    }));
    vi.doMock('../src/services/image/imageStorageService.js', () => ({
        uploadBase64ToFirebase: vi.fn(async url => url),
        compositeLogoOverlay: vi.fn(async url => url)
    }));
    vi.doMock('../src/utils/brandProfiles.js', async (importOriginal) => ({
        ...await importOriginal(),
        normalizeBrandKey
    }));

    ({ generateSingleImage } = await import('../src/services/image/imageGenerationService.js'));
});

afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SEEDREAM_API_TOKEN;
});

const generate = (model) => generateSingleImage('uma foto de comida saudável', '4:5', '', false, {}, null, model);

const depletedCredits = () => new Error('Gemini Error: Your prepayment credits are depleted.');

describe('cadeia de provedores de imagem', () => {
    it('gera com Gemini por padrão, sem acionar o Seedream', async () => {
        generateImageWithGemini.mockResolvedValue('https://cdn.example.com/gemini.png');

        await expect(generate('gemini')).resolves.toBe('https://cdn.example.com/gemini.png');
        expect(generateImageWithSeedream).not.toHaveBeenCalled();
    });

    it('usa Gemini mesmo quando nenhum modelo é informado', async () => {
        generateImageWithGemini.mockResolvedValue('https://cdn.example.com/gemini.png');

        await expect(generateSingleImage('uma foto', '4:5')).resolves.toBe('https://cdn.example.com/gemini.png');
        expect(generateImageWithGemini).toHaveBeenCalledTimes(1);
    });

    it('cai para o Seedream quando o Gemini fica sem crédito', async () => {
        generateImageWithGemini.mockRejectedValue(depletedCredits());
        generateImageWithSeedream.mockResolvedValue('https://cdn.example.com/seedream.png');

        await expect(generate('gemini')).resolves.toBe('https://cdn.example.com/seedream.png');
        expect(generateImageWithSeedream).toHaveBeenCalledTimes(1);
    });

    it('tenta o Gemini quando o Seedream pedido explicitamente falha', async () => {
        generateImageWithSeedream.mockRejectedValue(new Error('BytePlus indisponível'));
        generateImageWithGemini.mockResolvedValue('https://cdn.example.com/gemini.png');

        await expect(generate('seedream')).resolves.toBe('https://cdn.example.com/gemini.png');
    });

    it('pula provedor sem chave configurada em vez de quebrar', async () => {
        delete process.env.GEMINI_API_KEY;
        generateImageWithSeedream.mockResolvedValue('https://cdn.example.com/seedream.png');

        await expect(generate('gemini')).resolves.toBe('https://cdn.example.com/seedream.png');
        expect(generateImageWithGemini).not.toHaveBeenCalled();
    });

    it('reporta a falha de cada provedor quando todos falham', async () => {
        generateImageWithGemini.mockRejectedValue(depletedCredits());
        generateImageWithSeedream.mockRejectedValue(new Error('BytePlus indisponível'));

        await expect(generate('gemini')).rejects.toThrow(/Gemini: .*credits are depleted.*Seedream \(BytePlus\): BytePlus indisponível/s);
    });

    it('incorpora businessProfileId ao contexto da imagem do carrossel', async () => {
        generateImageWithGemini.mockResolvedValue('https://cdn.example.com/gemini.png');

        await generateSingleImage('uma foto', '4:5', '', false, {}, null, 'gemini', 'profile-123');

        expect(normalizeBrandKey).toHaveBeenCalledWith(expect.objectContaining({
            businessProfileId: 'profile-123'
        }));
    });
});
