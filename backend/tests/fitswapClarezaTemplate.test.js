import { describe, expect, it } from 'vitest';
import { renderElevepicTemplate, ELEVEPIC_TEMPLATE_METADATA, ELEVEPIC_CONTENT_SCHEMAS } from '../src/services/carouselTemplateService.js';

const brand = { brandName: 'Fitswap', brandKey: 'fitswap' };

function slides(overrides = {}) {
    const base = [
        { tag: 'Rotina leve', title: 'Jantar sem <em>drama</em>', subtitle: 'Decida em segundos.' },
        { tag: 'O problema', title: 'Cansaço de <em>decidir</em>', subtitle: 'Todo dia a mesma dúvida.', questions: ['O que eu como?', 'Pode isso?', 'De novo?'] },
        { tag: 'Na prática', title: 'Simples', stats: [{ value: '2', label: 'toques para começar' }] },
        { tag: 'Não funciona', title: 'Sofrer', listItems: ['Cortar tudo'] },
        { tag: 'Funciona', title: 'Fácil', checkItems: ['Usar a geladeira'] },
        { tag: 'Como', title: 'Passos', steps: [{ title: 'Foto', text: 'Da geladeira' }] },
        { tag: 'Bora', title: 'Comece <em>hoje</em>', subtitle: 'É rápido.', ctaText: 'Baixar agora', ctaSub: 'Link na bio' },
    ];
    return base.map((s, i) => ({ ...s, ...(overrides[i] || {}) }));
}

describe('fitswap-clareza template', () => {
    it('is registered with a content schema', () => {
        expect(ELEVEPIC_TEMPLATE_METADATA.some(t => t.id === 'fitswap-clareza')).toBe(true);
        expect(ELEVEPIC_CONTENT_SCHEMAS['fitswap-clareza']).toBeDefined();
    });

    it('renders 7 slides with the embedded logo and the generated copy', () => {
        const html = renderElevepicTemplate('fitswap-clareza', { slides: slides() }, brand);

        expect(html.match(/class="slide[ "]/g)).toHaveLength(7);
        expect(html).not.toContain('__FITSWAP_LOGO__');
        expect(html).toContain('src="data:image/png;base64,');
        expect(html).toContain('Jantar sem <em>drama</em>');
        expect(html).toContain('<div class="q">De novo?</div>');
        expect(html).toContain('<div class="n num">2</div><div class="l">toques para começar</div>');
        expect(html).toContain('<span class="ic">✓</span>Usar a geladeira');
        expect(html).toContain('<h3>Foto</h3><p>Da geladeira</p>');
        expect(html).toContain('Baixar agora');
    });

    it('keeps only <em> in titles and escapes any other markup', () => {
        const html = renderElevepicTemplate('fitswap-clareza', {
            slides: slides({ 0: { title: 'Oi <script>alert(1)</script> <em>ok</em>' }, 3: { listItems: ['<b>negrito</b>'] } })
        }, brand);

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('<em>ok</em>');
        expect(html).toContain('<span class="ic">✕</span>negrito');
    });

    it('keeps the product facts when no stats are provided', () => {
        const html = renderElevepicTemplate('fitswap-clareza', { slides: slides({ 2: { stats: [] } }) }, brand);

        expect(html).toContain('foto da geladeira para começar');
        expect(html).toContain('passos até a refeição pronta');
    });
});
