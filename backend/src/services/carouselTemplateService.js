/**
 * carouselTemplateService.js
 *
 * Renders ElevePic HTML carousel templates with dynamic brand content.
 * Strategy: CSS variable injection for brand colors + EP comment markers
 * for text substitution. Templates are never sent to AI — only content JSON is.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '../templates/elevepic');

// ─── Template registry ────────────────────────────────────────────────────────

export const ELEVEPIC_TEMPLATE_METADATA = [
  { id: 'bold',         name: 'Bold Overlay',      description: 'Dark + glow + números de impacto grandes',          slides: 7,     badge: 'Sem imagens',     color: '#3b82f6' },
  { id: 'editorial',    name: 'Editorial Premium', description: 'Layout light/dark alternado com grid',               slides: 7,     badge: 'Sem imagens',     color: '#3b82f6' },

  { id: 'editorial-sci',name: 'Scientific',        description: 'Hero image + headline bold com destaque',            slides: '3–7', badge: 'Usa biblioteca',  color: '#00e5ff' },
  { id: 'photo',        name: 'Cinematic Photo',   description: 'Foto full-bleed + Ken Burns + mockups de celular',  slides: 7,     badge: 'Usa biblioteca',  color: '#c9a84c' },
  { id: 'moodboard',    name: 'Moodboard',         description: 'Frames polaroid + film strip, estética vintage',     slides: 6,     badge: 'Usa biblioteca',  color: '#c4a882' },
  { id: 'instagram',    name: 'Instagram Native',  description: 'Chrome realista do Instagram (4:5)',                 slides: 5,     badge: 'CSS puro',        color: '#C9A84C' },
  { id: 'comparison',    name: 'Before & After',    description: 'Dois mockups lado a lado no slide 1 — Sem vs. Com o produto, imagens via Gemini', slides: 6, badge: 'IA imagens', color: '#6366f1' },
  { id: 'fitswap-swap', name: 'Food Swap',         description: 'Hook com duas fotos de refeição + mito + trocas X→Y + impacto numérico + aperitivo do app', slides: 6, badge: 'IA imagens', color: '#A6F000' },
];

const ELEVEPIC_IDS = new Set(ELEVEPIC_TEMPLATE_METADATA.map(t => t.id));

export function isElevepicTemplate(templateId) {
  return ELEVEPIC_IDS.has(templateId);
}

// ─── Template loader ──────────────────────────────────────────────────────────

function loadTemplate(templateId) {
  const filePath = join(TEMPLATES_DIR, `${templateId}.html`);
  return readFileSync(filePath, 'utf-8');
}

// ─── Color utilities ──────────────────────────────────────────────────────────

/** Convert hex → HSL, adjust Lightness by deltaL (%), convert back to hex */
function adjustHexLightness(hex, deltaL) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  l = Math.min(1, Math.max(0, l + deltaL / 100));
  const hsl2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let nr, ng, nb;
  if (s === 0) { nr = ng = nb = l; }
  else {
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q2;
    nr = hsl2rgb(p2, q2, h + 1 / 3);
    ng = hsl2rgb(p2, q2, h);
    nb = hsl2rgb(p2, q2, h - 1 / 3);
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

// ─── CSS variable injection ───────────────────────────────────────────────────

function buildCssVariableOverride(brandContext) {
  const primary   = (brandContext.primaryColor   || brandContext.branding?.primaryColor   || '#3b82f6').toLowerCase();
  const secondary = (brandContext.secondaryColor  || brandContext.branding?.secondaryColor || '#1d4ed8').toLowerCase();
  const light     = adjustHexLightness(primary, 20);
  const dark      = adjustHexLightness(primary, -20);

  return `
  /* === Injected by carouselTemplateService === */
  --blue: ${primary};
  --blue-light: ${light};
  --blue-dark: ${dark};
  --purple: ${primary};
  --purple-light: ${light};
  --purple-dark: ${dark};
  --gold: ${primary};
  --gold-l: ${light};
  --accent: ${primary};
  --brand-primary: ${primary};
  --brand-light: ${light};
  --brand-dark: ${dark};
`;
}

/** Inserts CSS variable overrides into the first :root { } block found */
function injectCssVariables(html, cssVars) {
  return html.replace(/:root\s*\{([^}]*)\}/, (match, inner) => {
    return `:root {\n${inner}${cssVars}}`;
  });
}

function isFitswapBrandContext(brandContext = {}) {
  const brandKey = String(brandContext.brandKey || '').toLowerCase();
  const brandName = String(brandContext.brandName || brandContext.name || '').toLowerCase();
  return brandKey.includes('fitswap') || brandName.includes('fitswap');
}

function injectTemplateBrandMode(html, templateId, brandContext = {}) {
  if (!isFitswapBrandContext(brandContext)) return html;

  let extraCss = '';

  if (templateId === 'bold') {
    extraCss = `
/* === Fitswap light-mode override === */
body {
  background: #f4f5ef;
}
.carousel-wrap {
  background: #eef2e8;
}
.slide {
  background:
    radial-gradient(circle at top right, rgba(111,152,0,0.08), transparent 28%),
    linear-gradient(180deg, #f8faf5 0%, #eef2e8 100%);
}
.grid-pattern {
  background-image:
    linear-gradient(rgba(111,152,0,0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(111,152,0,0.07) 1px, transparent 1px);
}
.fade-bottom {
  background: linear-gradient(to top, rgba(238,242,232,0.98) 0%, rgba(238,242,232,0.84) 44%, rgba(238,242,232,0) 100%);
}
.fade-top {
  background: linear-gradient(to bottom, rgba(248,250,245,0.92) 0%, transparent 100%);
}
.scanlines {
  background: repeating-linear-gradient(
    0deg,
    transparent, transparent 2px,
    rgba(17,24,39,0.015) 2px, rgba(17,24,39,0.015) 4px
  );
}
.orb-1 { background: rgba(111,152,0,0.08); }
.orb-2 { background: rgba(166,240,0,0.08); }
.bline { background: rgba(17,24,39,0.15); }
.brand-label,
.slide-num,
.hl-sub,
.impact-small,
.slide-counter {
  color: rgba(17,24,39,0.45);
}
.hl-main,
.impact-big,
.statement-line,
.nav-btn,
.nav-btn:hover {
  color: #111827;
}
.statement-line.dim {
  color: rgba(17,24,39,0.3);
}
.h-divider {
  background: linear-gradient(90deg, transparent, rgba(111,152,0,0.35), transparent);
}
.badge {
  background: rgba(111,152,0,0.12);
  color: #6f9800;
  box-shadow: 0 0 0 1px rgba(111,152,0,0.16);
}
.nav-btn {
  background: rgba(255,255,255,0.55);
  border-color: rgba(17,24,39,0.08);
}
.nav-btn:hover {
  background: rgba(111,152,0,0.14);
  border-color: rgba(111,152,0,0.32);
}
.dot {
  background: rgba(17,24,39,0.18);
}
.hl-blue,
.impact-num,
.statement-line.accent,
.hl-eyebrow {
  color: #6f9800;
}
.dot.active,
.progress-fill,
.hl-eyebrow::before {
  background-color: #6f9800;
}
.impact-num { text-shadow: none; }
.slide-counter {
  background: rgba(255,255,255,0.45);
}
`;
  }

  if (!extraCss) return html;
  return html.replace('</style>', `${extraCss}\n</style>`);
}

// ─── EP marker substitution ───────────────────────────────────────────────────
//
// Template files use HTML comment markers: <!--EP:key-->content<!--/EP:key-->
// This regex-based substitution is safe, tag-agnostic, and handles nested HTML.

function substituteEpSlots(html, slotValues) {
  return html.replace(
    /<!--EP:([a-zA-Z0-9_]+)-->([\s\S]*?)<!--\/EP:\1-->/g,
    (match, key, oldContent) => {
      const newContent = slotValues[key];
      return newContent !== undefined
        ? `<!--EP:${key}-->${newContent}<!--/EP:${key}-->`
        : match;
    }
  );
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function setSlotIfPresent(slots, key, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  slots[key] = trimmed;
}

function normalizeLineBreaks(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\n/g, '<br>');
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeForMatch(value = '') {
  return stripHtml(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isTudyBrandContext(brandContext = {}) {
  const brandKey = String(brandContext.brandKey || '').toLowerCase();
  const brandName = String(brandContext.brandName || brandContext.name || '').toLowerCase();
  return brandKey.includes('tudy') || brandName.includes('tudy');
}

function isAppBrandContext(brandContext = {}) {
  const text = [
    brandContext.brandKey,
    brandContext.brandName,
    brandContext.name,
    brandContext.brandContext,
    brandContext.description,
    brandContext.productService,
    brandContext.contentStrategy,
    brandContext.branding?.guidelines
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('app') || text.includes('aplicativo') || isTudyBrandContext(brandContext) || isFitswapBrandContext(brandContext);
}

function resolveBrandCta(brandName = 'Marca', brandContext = {}, fallback = '') {
  const rawFallback = String(fallback || '').trim();
  const normalizedFallback = normalizeForMatch(rawFallback);
  const fallbackLooksLikeUrl = /(?:https?:\/\/|www\.|\.com(?:\.br)?|\.app|\.io|\.co)/i.test(rawFallback);

  if (isTudyBrandContext(brandContext)) return 'Baixar o app<br><span class="hl-blue">link na bio</span>';
  if (isFitswapBrandContext(brandContext)) return 'Baixar o app<br><span class="hl-blue">link na bio</span>';
  if (isAppBrandContext(brandContext) && (fallbackLooksLikeUrl || !rawFallback)) {
    return 'Baixar o app<br><span class="hl-blue">link na bio</span>';
  }
  if (rawFallback && !fallbackLooksLikeUrl && !normalizedFallback.includes('tudy.com')) return rawFallback;
  return `Conhecer ${escapeHtml(stripHtml(brandName || 'marca'))}<br><span class="hl-blue">link na bio</span>`;
}

const GENERIC_EYEBROW_LABELS = new Set([
  'tema central',
  'a realidade',
  'realidade',
  'a virada',
  'virada',
  'o processo',
  'processo',
  'o ponto central',
  'ponto central',
  'proximo passo',
  'próximo passo',
  'sua decisao',
  'sua decisão',
  'dado de impacto',
  'impacto',
  'conteudo estrategico',
  'conteúdo estratégico'
]);

function isGenericEyebrow(value = '') {
  return GENERIC_EYEBROW_LABELS.has(normalizeForMatch(value));
}

function isGenericVisibleCopy(value = '') {
  const normalized = normalizeForMatch(value);
  if (!normalized) return false;
  return normalized === 'conteudo estrategico'
    || normalized.includes('conteudo criado para')
    || normalized.includes('alinhado ao tema principal')
    || normalized.includes('tema principal da marca')
    || normalized.includes('conteudo de valor');
}

function defaultBoldEyebrows(topic, brandContext = {}) {
  if (isTudyBrandContext(brandContext)) {
    return ['Estudo ativo', 'Na prática', 'Menos bagunça', 'Antes da prova', 'Mais clareza', 'Plano de revisão', 'Link na bio'];
  }
  if (isFitswapBrandContext(brandContext)) {
    return ['Decisão alimentar', 'Na prática', 'Sem restrição', 'Troca inteligente', 'Mais controle', 'No app', 'Link na bio'];
  }

  const topicWords = stripHtml(topic).split(/\s+/).filter(Boolean);
  const shortTopic = topicWords.slice(0, 2).join(' ');
  const topicLabel = shortTopic ? shortTopic.charAt(0).toUpperCase() + shortTopic.slice(1) : 'Ideia prática';
  return [topicLabel, 'Na prática', 'Insight útil', 'Erro comum', 'Novo caminho', 'Aplicação', 'Link na bio'];
}

function setEyebrowSlot(slots, key, value, fallback) {
  const candidate = firstNonEmpty(value);
  const resolved = candidate && !isGenericEyebrow(candidate) ? candidate : fallback;
  setSlotIfPresent(slots, key, resolved);
}

function setContentSlot(slots, key, value, fallback) {
  const candidate = firstNonEmpty(value);
  const resolved = candidate && !isGenericVisibleCopy(candidate) ? candidate : fallback;
  setSlotIfPresent(slots, key, resolved);
}

function buildTopicHeadline(source, { maxWords = 6, maxLines = 4, accentLastWord = true } = {}) {
  const words = stripHtml(source)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);

  if (words.length === 0) return '';

  const lines = [];
  const chunkSize = Math.max(1, Math.ceil(words.length / maxLines));
  for (let i = 0; i < words.length; i += chunkSize) {
    lines.push(words.slice(i, i + chunkSize).join(' ').toUpperCase());
  }

  const safeLines = lines.slice(0, maxLines).map(escapeHtml);
  if (safeLines.length === 0) return '';

  if (accentLastWord) {
    const lastIndex = safeLines.length - 1;
    const lastLineWords = safeLines[lastIndex].split(/\s+/);
    const lastWord = lastLineWords.pop();
    if (lastWord) {
      lastLineWords.push(`<span class="hl-blue">${lastWord}</span>`);
      safeLines[lastIndex] = lastLineWords.join(' ');
    }
  }

  return safeLines.join('<br>');
}

function deriveStatementLines(slide = {}) {
  if (Array.isArray(slide.statementLines) && slide.statementLines.length > 0) {
    return slide.statementLines
      .map(line => typeof line === 'string' ? line.trim() : '')
      .filter(Boolean);
  }

  const source = firstNonEmpty(slide.headline, slide.title, slide.heading, slide.statement);
  if (!source) return [];

  return source
    .split(/<br\s*\/?>|\n|[|]/i)
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

// ─── HTML builders for list structures ───────────────────────────────────────

function buildBoldStatement(lines = []) {
  const sizes = ['xl', 'xl', 'xl accent', 'lg', 'lg accent', 'md dim', 'md'];
  return lines.map((line, i) => {
    const cls = sizes[i] || 'md';
    return `<div class="statement-line ${cls}">${line}</div>`;
  }).join('\n          ');
}

function buildEditorialStats(stats = []) {
  return stats.map(s =>
    `<div class="stat-mini"><div class="stat-mini-val">${s.value}</div><div class="stat-mini-label">${s.label}</div></div>`
  ).join('\n        ');
}

function buildEditorialNegativeList(items = []) {
  return items.map(item =>
    `<li><div class="list-bullet"><span>✗</span></div>${item}</li>`
  ).join('\n        ');
}

function buildEditorialChecklist(items = []) {
  return items.map((item, i) => {
    const muted = i >= 4 ? ' class="muted"' : '';
    const iconMuted = i >= 4 ? ' muted' : '';
    return `<li${muted}><div class="check-icon${iconMuted}">✓</div>${item}</li>`;
  }).join('\n        ');
}

function buildEditorialNumberedList(items = []) {
  return items.map((item, i) =>
    `<li><div class="list-bullet"><span>${i + 1}</span></div>${item}</li>`
  ).join('\n        ');
}

// ─── Per-template slot value builders ────────────────────────────────────────

function buildBoldSlots(contentJson, brandContext = {}) {
  const { brandName = 'Marca', websiteUrl = '', websiteHandle = '', slides = [] } = contentJson;
  const topic = firstNonEmpty(contentJson.__sourceTopic, contentJson.topic, contentJson.theme, contentJson.title, brandContext.contentStrategy, brandContext.brandContext, 'conteúdo relevante');
  const safeBrandName = escapeHtml(stripHtml(brandName || 'Marca'));
  const safeTopic = stripHtml(topic || 'conteúdo estratégico');
  const eyebrowFallbacks = defaultBoldEyebrows(safeTopic, brandContext);
  const ctaFallback = resolveBrandCta(brandName, brandContext, firstNonEmpty(websiteUrl, websiteHandle));
  const slots = { brand_name: brandName, website_url: websiteUrl || websiteHandle };

  const fallbackSlots = {
    s0_eyebrow: eyebrowFallbacks[0],
    s0_headline: buildTopicHeadline(safeTopic, { maxWords: 6, maxLines: 4 }),
    s0_subtext: isTudyBrandContext(brandContext)
      ? 'Transforme material acumulado em prática guiada, revisão e clareza antes da prova.'
      : `Uma ideia prática para ${safeBrandName}, conectada ao que a marca entrega de verdade.`,
    s1_eyebrow: eyebrowFallbacks[1],
    s1_impact_num: '1',
    s1_impact_big: isTudyBrandContext(brandContext) ? 'LER\nNÃO É\nFIXAR' : 'IDEIA\nSEM AÇÃO\nNÃO MUDA',
    s1_impact_small: isTudyBrandContext(brandContext) ? 'Prática e feedback transformam revisão em retenção' : 'Aplicar melhor muda o resultado',
    s1_subtext: isTudyBrandContext(brandContext) ? 'O Tudy organiza estudo, prática e revisão em uma trilha clara.' : 'O conteúdo precisa virar uma ação simples de executar.',
    s2_eyebrow: eyebrowFallbacks[2],
    s2_statement: buildBoldStatement(isTudyBrandContext(brandContext) ? ['MATERIAL', '>', 'PRÁTICA', '>', 'CLAREZA'] : ['ENTENDER', '>', 'APLICAR', '>', 'RESULTAR']),
    s2_subtext: isTudyBrandContext(brandContext) ? 'Quando o estudo vira exercício, quiz e flashcards, a bagunça perde força.' : 'A diferença aparece quando a ideia encontra um método concreto.',
    s3_eyebrow: eyebrowFallbacks[3],
    s3_headline: isTudyBrandContext(brandContext) ? '"REVISAR SEM PRATICAR É SÓ RELER COM PRESSA."' : '"O problema não é saber. É saber o que fazer depois."',
    s3_subtext: isTudyBrandContext(brandContext) ? 'A próxima revisão precisa mostrar o que você já domina e o que ainda falha.' : `${safeBrandName} precisa aparecer como caminho claro, não como promessa vazia.`,
    s4_eyebrow: eyebrowFallbacks[4],
    s4_statement: buildBoldStatement(isTudyBrandContext(brandContext) ? ['DE', 'ACÚMULO', 'PARA', 'TRILHA'] : ['DE', 'DÚVIDA', 'PARA', 'AÇÃO']),
    s4_subtext: isTudyBrandContext(brandContext) ? 'A matéria fica mais leve quando existe sequência, prática e acompanhamento.' : 'O avanço começa quando o próximo passo fica óbvio.',
    s5_eyebrow: eyebrowFallbacks[5],
    s5_headline: isTudyBrandContext(brandContext) ? `ORGANIZE.<br><span class="hl-blue">PRATIQUE.</span><br>EVOLUA.` : `ENTENDA.<br><span class="hl-blue">APLIQUE.</span><br>AVANCE.`,
    s5_subtext: isTudyBrandContext(brandContext) ? 'Transforme conteúdo em quiz, flashcards e revisão guiada.' : 'Uma sequência clara reduz esforço e aumenta consistência.',
    s6_eyebrow: eyebrowFallbacks[6],
    s6_headline: isTudyBrandContext(brandContext) ? `BAIXE<br>O APP<br>E REVISE<br><span class="hl-blue">MELHOR.</span>` : `DÊ<br>O PRÓXIMO<br>PASSO<br><span class="hl-blue">AGORA.</span>`,
    s6_subtext: isTudyBrandContext(brandContext) ? 'Comece pelo material que você já tem e transforme em prática.' : `Veja como ${safeBrandName} aplica isso na prática.`,
    s6_cta_text: ctaFallback
  };

  slides.forEach((s, i) => {
    setEyebrowSlot(slots, `s${i}_eyebrow`, firstNonEmpty(s.eyebrow, s.tag, s.kicker), eyebrowFallbacks[i] || eyebrowFallbacks[0]);

    if (i === 1) {
      // Impact slide
      setSlotIfPresent(slots, `s${i}_impact_num`, firstNonEmpty(s.impactNumber, s.impactNum, s.value, s.statNumber));
      setSlotIfPresent(slots, `s${i}_impact_big`, normalizeLineBreaks(firstNonEmpty(s.impactLabel, s.impactBig)));
      setSlotIfPresent(slots, `s${i}_impact_small`, firstNonEmpty(s.impactCaption, s.impactSmall, s.subtitle, s.body));
    } else if (i === 2 || i === 4) {
      // Statement slides
      const lines = deriveStatementLines(s);
      if (lines.length > 0 && !isGenericVisibleCopy(lines.join(' '))) {
        slots[`s${i}_statement`] = buildBoldStatement(lines);
      }
    } else {
      setContentSlot(
        slots,
        `s${i}_headline`,
        normalizeLineBreaks(firstNonEmpty(s.headline, s.title, s.heading, s.mainText)),
        fallbackSlots[`s${i}_headline`]
      );
    }

    setContentSlot(slots, `s${i}_subtext`, firstNonEmpty(s.subtext, s.subtitle, s.body, s.description), fallbackSlots[`s${i}_subtext`]);
    if (i === 6) {
      slots.s6_cta_text = resolveBrandCta(brandName, brandContext, firstNonEmpty(s.ctaText, s.cta, s.websiteUrl, websiteUrl, websiteHandle));
    }
  });

  Object.entries(fallbackSlots).forEach(([key, value]) => {
    if (slots[key] !== undefined) return;
    if (typeof value !== 'string' || !value.trim()) return;
    slots[key] = value;
  });

  return slots;
}

function buildEditorialSlots(contentJson) {
  const { brandName = 'Marca', websiteUrl = '', slides = [] } = contentJson;
  const slots = { brand_name: brandName, website_url: websiteUrl };

  slides.forEach((s, i) => {
    // Only set slots with actual content (don't overwrite template defaults with empty strings)
    setSlotIfPresent(slots, `s${i}_tag`,   firstNonEmpty(s.tag, s.eyebrow, s.kicker));
    setSlotIfPresent(slots, `s${i}_title`, firstNonEmpty(s.title, s.headline, s.heading));

    if (i === 0) {
      setSlotIfPresent(slots, 's0_subtitle', firstNonEmpty(s.subtitle, s.subtext, s.body));
    } else if (i === 1) {
      setSlotIfPresent(slots, 's1_subtitle', firstNonEmpty(s.subtitle, s.subtext, s.body));
    } else if (i === 2) {
      setSlotIfPresent(slots, 's2_subtitle', firstNonEmpty(s.subtitle, s.subtext, s.body));
      const stats = Array.isArray(s.stats) && s.stats.length > 0 ? s.stats : null;
      if (stats) slots['s2_stats'] = buildEditorialStats(stats);
    } else if (i === 3) {
      const items = Array.isArray(s.listItems) && s.listItems.length > 0 ? s.listItems
          : Array.isArray(s.items) && s.items.length > 0 ? s.items : null;
      if (items) slots['s3_list'] = buildEditorialNegativeList(items);
    } else if (i === 4) {
      const items = Array.isArray(s.checkItems) && s.checkItems.length > 0 ? s.checkItems
          : Array.isArray(s.items) && s.items.length > 0 ? s.items
          : Array.isArray(s.listItems) && s.listItems.length > 0 ? s.listItems : null;
      if (items) slots['s4_list'] = buildEditorialChecklist(items);
    } else if (i === 5) {
      const items = Array.isArray(s.listItems) && s.listItems.length > 0 ? s.listItems
          : Array.isArray(s.items) && s.items.length > 0 ? s.items : null;
      if (items) slots['s5_list'] = buildEditorialNumberedList(items);
    } else if (i === 6) {
      setSlotIfPresent(slots, 's6_subtitle', firstNonEmpty(s.subtitle, s.subtext, s.body));
      setSlotIfPresent(slots, 's6_cta_text', firstNonEmpty(s.ctaText, s.cta));
      setSlotIfPresent(slots, 's6_cta_sub',  firstNonEmpty(s.ctaSub, s.ctaSubtitle));
    }
  });

  return slots;
}



function buildInstagramSlots(contentJson) {
  const { brandName = 'Marca', socialHandle = '', brandInitial = '', igCaption = '', websiteUrl = '', slides = [] } = contentJson;
  const initial = brandInitial || brandName.charAt(0).toUpperCase();
  const slots = {
    brand_name:     brandName,
    brand_handle:   socialHandle || brandName.toLowerCase().replace(/\s+/g, ''),
    brand_initial:  initial,
    brand_tagline:  contentJson.brandTagline || '',
    ig_caption:     igCaption,
    website_url:    websiteUrl,
  };

  slides.forEach((s, i) => {
    setSlotIfPresent(slots, `s${i}_tag`,      firstNonEmpty(s.tag, s.eyebrow, s.kicker));
    setSlotIfPresent(slots, `s${i}_headline`, firstNonEmpty(s.heading, s.headline, s.title));
    setSlotIfPresent(slots, `s${i}_subtext`,  firstNonEmpty(s.subtext, s.subtitle, s.body));
    if (i === 1) {
      const listItems = Array.isArray(s.listItems) && s.listItems.length > 0 ? s.listItems
          : Array.isArray(s.items) && s.items.length > 0 ? s.items : null;
      if (listItems) slots[`s${i}_list`] = listItems.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
    }
    if (i === 2) {
      const stepCards = Array.isArray(s.stepCards) && s.stepCards.length > 0 ? s.stepCards : null;
      if (stepCards) slots[`s${i}_steps`] = stepCards.map(c => `<div class="step-card"><div class="step-title">${escapeHtml(c.title||'')}</div><div class="step-body">${escapeHtml(c.body||'')}</div></div>`).join('\n');
    }
    if (i === 3) {
      const statsRow = Array.isArray(s.statsRow) && s.statsRow.length > 0 ? s.statsRow : null;
      if (statsRow) slots[`s${i}_stats`] = statsRow.map(st => `<div class="stat-item"><div class="stat-value">${escapeHtml(st.value||'')}</div><div class="stat-label">${escapeHtml(st.label||'')}</div></div>`).join('\n');
    }
    if (s.ctaText)    slots[`s${i}_cta`] = s.ctaText;
    if (s.websiteUrl) slots['website_url'] = s.websiteUrl;
  });

  return slots;
}

// ─── Comparison slots ─────────────────────────────────────────────────────────

function buildComparisonSlots(contentJson, brandContext = {}) {
  const { brandName = 'Marca', websiteUrl = '', slides = [] } = contentJson;
  const handle = contentJson.socialHandle || contentJson.websiteHandle || websiteUrl || `@${brandName.toLowerCase().replace(/\s+/g, '')}`;

  const slots = {
    brand_name: escapeHtml(brandName),
    s5_handle:  escapeHtml(handle),
  };

  slides.forEach((s, i) => {
    const eyebrow  = firstNonEmpty(s.eyebrow, s.tag, s.kicker);
    const headline = firstNonEmpty(s.headline, s.heading, s.title);
    const subtext  = firstNonEmpty(s.subtext, s.subtitle, s.body);

    if (eyebrow)  setSlotIfPresent(slots, `s${i}_eyebrow`, eyebrow);
    if (headline) setSlotIfPresent(slots, `s${i}_headline`, headline);
    if (subtext)  setSlotIfPresent(slots, `s${i}_subtext`, subtext);

    if (i === 0) {
      // Detect brand type from brandContext to pick appropriate fallback prompts
      const bKey = String(brandContext.brandKey || brandContext.brandName || brandContext.name || '').toLowerCase();
      const isFitswap  = bKey.includes('fitswap') || bKey.includes('nutriverse');
      const isElevepic = bKey.includes('elevepic');

      const defaultBeforePrompt = isFitswap
        ? 'Overhead food photography of a typical everyday Brazilian meal: white rice, black beans, and a fried egg on a simple white ceramic plate on a wooden kitchen table, natural window light from the side, casual smartphone photo, no food styling, honest and relatable, the meal looks edible but ordinary and unoptimized'
        : isElevepic
          ? 'Candid portrait of a professional in their early 30s standing in a busy office corridor, wearing a plain shirt and dark jeans, natural overhead fluorescent lighting creating slight shadows, neutral expression with a faint smile, slightly slouched posture, blurry background of desks and people, shot on iPhone 8 equivalent quality, no depth-of-field separation, slightly underexposed, honest documentary feel, common and unremarkable appearance'
          : 'Candid photo of a person in an everyday environment, natural uncontrolled lighting, common clothing, neutral expression, casual smartphone quality, honest and relatable, no professional staging';

      const defaultAfterPrompt = isFitswap
        ? 'Overhead food photography of a macro-optimized version of a classic Brazilian meal: grilled chicken breast sliced over a small portion of white rice with fresh herbs, sautéed green vegetables with olive oil, wedge of lemon on the side, clean white ceramic plate on a light oak wood surface, soft natural daylight from the left, professional food photography quality, slight depth of field, fresh and appetizing, nutritionally intentional plating'
        : isElevepic
          ? 'Authentic professional portrait of a business consultant in their early 30s, wearing a fitted navy blazer over a plain white t-shirt (no tie), standing near a large window in a real bookshelf-filled office, soft natural side light from the window creating gentle realistic shadows, slight skin texture and natural micro-imperfections visible, relaxed confident posture with weight slightly shifted and one hand loosely holding a notebook, direct calm gaze at camera, no heavy retouching, Sony A7III equivalent, 85mm f/1.8, gentle background bokeh on bookshelves, editorial color grade warm but not cinematic — feels like a real professional photo done right, not a stock photo'
          : 'Professional photo of a person in a clean organized environment, professional camera quality, controlled studio lighting, confident posture and expression, shallow depth of field, editorial composition, premium and credible appearance';

      const beforePrompt = s.beforeImagePrompt || defaultBeforePrompt;
      const afterPrompt  = s.afterImagePrompt  || defaultAfterPrompt;

      const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      slots['s0_before_img'] = `<img src="${placeholder}" data-ai-prompt="${escapeHtml(beforePrompt)}" style="width:100%;height:100%;object-fit:cover;">`;
      slots['s0_after_img']  = `<img src="${placeholder}" data-ai-prompt="${escapeHtml(afterPrompt)}"  style="width:100%;height:100%;object-fit:cover;">`;

      const beforeLabel = firstNonEmpty(s.beforeLabel, 'Sem');
      const afterLabel  = firstNonEmpty(s.afterLabel,  'Com');
      setSlotIfPresent(slots, 's0_before_label', escapeHtml(beforeLabel));
      setSlotIfPresent(slots, 's0_after_label',  escapeHtml(afterLabel));
    }

    if (i === 1) {
      setSlotIfPresent(slots, 's1_impact_num',   firstNonEmpty(s.impactNumber, s.number));
      setSlotIfPresent(slots, 's1_impact_big',   firstNonEmpty(s.impactLabel,  s.label));
      setSlotIfPresent(slots, 's1_impact_small', firstNonEmpty(s.impactCaption, s.caption, subtext));
    }

    if (i === 2) {
      const items = Array.isArray(s.checkItems) && s.checkItems.length > 0 ? s.checkItems
          : Array.isArray(s.items)       && s.items.length > 0       ? s.items : null;
      if (items) {
        slots['s2_checks'] = items.map(item =>
          `<li class="check-item"><div class="check-icon"></div><span class="check-text">${escapeHtml(item)}</span></li>`
        ).join('\n          ');
      }
    }

    if (i === 3) {
      setSlotIfPresent(slots, 's3_quote',       firstNonEmpty(s.quote, headline));
      setSlotIfPresent(slots, 's3_attribution', firstNonEmpty(s.attribution, s.source, subtext));
    }

    if (i === 4) {
      const steps = Array.isArray(s.steps) && s.steps.length > 0 ? s.steps
          : Array.isArray(s.stepCards) && s.stepCards.length > 0 ? s.stepCards : null;
      if (steps) {
        slots['s4_steps'] = steps.map((step, idx) =>
          `<div class="step-card">
            <div class="step-num">${String(idx + 1).padStart(2, '0')}</div>
            <div class="step-content">
              <div class="step-title">${escapeHtml(step.title || '')}</div>
              <div class="step-body">${escapeHtml(step.body || step.description || '')}</div>
            </div>
          </div>`
        ).join('\n          ');
      }
    }

    if (i === 5) {
      setSlotIfPresent(slots, 's5_cta_text', firstNonEmpty(s.ctaText, s.cta, 'Conhecer agora'));
    }
  });

  return slots;
}

// ─── Fitswap Swap slots ───────────────────────────────────────────────────────

function buildFitswapSplitPrompt(dishName) {
  const dish = dishName || 'macarrão ao molho vermelho';
  return `Create a hyper-realistic, premium editorial food image in a vertical split composition (4:5). The image shows the SAME dish transformed into a healthier version. DISH: ${dish}. LEFT SIDE — ORIGINAL (CALORIC): A real, everyday version of ${dish} on a plate. Looks indulgent and heavier: richer sauce, more oil, butter, or cheese, less structure, more processed or dense ingredients. Warm indoor lighting, slightly dim. Natural imperfections, home-cooked feel. RIGHT SIDE — SMART HEALTHY VERSION: The SAME ${dish}, clearly recognizable, but intelligently adapted for health: cleaner structure, lighter sauce, fresher ingredients, better balance, reduced heaviness, still appetizing. Bright natural daylight, clean tones. IMPORTANT: It must feel like the SAME ${dish} upgraded, not a different recipe. Still delicious. Never "diet food". SUBTLE TRANSFORMATION CUE: A minimal, elegant visual continuity between both sides (same plate, same angle, same framing), suggesting evolution rather than replacement. No arrows, no gimmicks. OPTIONAL TECH HINT: A minimal smartphone nearby or faint neon-lime accent (#A6F000) suggesting AI-driven adjustment, no readable UI text. CAMERA & STYLE: Editorial food photography. Same camera angle on both sides. Shallow depth of field. Soft shadows, slight grain for realism. BACKGROUND: Neutral kitchen or clean surface. Minimal distractions. TEXT OVERLAY: Small clean sans-serif — Left: "Original", Right: "Smart Version". RULES: No cartoon or CGI food, no calorie numbers, no fitness clichés, no influencer hands or poses, no exaggerated effects. OVERALL MESSAGE: Same ${dish}. Smarter version. Health without giving up flavor.`;
}

function buildFitswapSwapSlots(contentJson, brandContext = {}) {
  const { brandName = 'Fitswap', websiteUrl = '', slides = [] } = contentJson;
  const handle = contentJson.socialHandle || contentJson.websiteHandle || websiteUrl || '@fitswap';

  const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  const slots = {
    brand_name: escapeHtml(brandName),
    s5_handle:  escapeHtml(handle),
  };

  slides.forEach((s, i) => {
    const eyebrow  = firstNonEmpty(s.eyebrow, s.tag, s.kicker);
    const headline = firstNonEmpty(s.headline, s.heading, s.title);
    const subtext  = firstNonEmpty(s.subtext, s.subtitle, s.body);

    if (eyebrow)  setSlotIfPresent(slots, `s${i}_eyebrow`, escapeHtml(eyebrow));
    if (headline) setSlotIfPresent(slots, `s${i}_headline`, headline);
    if (subtext)  setSlotIfPresent(slots, `s${i}_subtext`, escapeHtml(subtext));

    if (i === 0) {
      const dishName    = firstNonEmpty(s.dishName, contentJson.dishName, '');
      const imagePrompt = s.imagePrompt || buildFitswapSplitPrompt(dishName);
      slots['s0_food_img'] = `<img src="${placeholder}" data-ai-prompt="${escapeHtml(imagePrompt)}" style="width:100%;height:100%;object-fit:cover;">`;
    }

    if (i === 1) {
      setSlotIfPresent(slots, 's1_myth',    escapeHtml(firstNonEmpty(s.myth, s.mythText, headline)));
      setSlotIfPresent(slots, 's1_truth',   escapeHtml(firstNonEmpty(s.truth, s.truthText, subtext)));
    }

    if (i === 2) {
      const swaps = Array.isArray(s.swaps) && s.swaps.length > 0 ? s.swaps : null;
      if (swaps) {
        slots['s2_swaps'] = swaps.map(sw =>
          `<div class="swap-row">
            <span class="swap-from">${escapeHtml(sw.from || '')}</span>
            <span class="swap-arrow">→</span>
            <span class="swap-to">${escapeHtml(sw.to || '')}</span>
            ${sw.note ? `<span class="swap-note">${escapeHtml(sw.note)}</span>` : ''}
          </div>`
        ).join('\n          ');
      }
    }

    if (i === 3) {
      const stats = Array.isArray(s.stats) && s.stats.length > 0 ? s.stats : null;
      if (stats) {
        slots['s3_stats'] = stats.map((st, idx) =>
          `<div class="stat-block${idx === 1 ? ' accent-stat' : ''}">
            <span class="stat-num">${escapeHtml(st.number || st.value || '')}</span>
            <span class="stat-unit">${escapeHtml(st.unit || '')}</span>
            <span class="stat-label">${escapeHtml(st.label || '')}</span>
          </div>`
        ).join('\n          ');
      }
      setSlotIfPresent(slots, 's3_disclaimer', escapeHtml(firstNonEmpty(s.disclaimer, s.footnote, '* valores médios baseados nas trocas acima')));
    }

    if (i === 4) {
      const steps = Array.isArray(s.steps) && s.steps.length > 0 ? s.steps : null;
      if (steps) {
        slots['s4_steps'] = steps.map((step, idx) =>
          `<div class="step-card">
            <div class="step-num">0${idx + 1}</div>
            <div class="step-content">
              <div class="step-title">${escapeHtml(step.title || '')}</div>
              <div class="step-body">${escapeHtml(step.body || step.description || '')}</div>
            </div>
          </div>`
        ).join('\n          ');
      }
    }

    if (i === 5) {
      setSlotIfPresent(slots, 's5_save_hint', escapeHtml(firstNonEmpty(s.saveHint, s.hint, 'Salva esse post antes de sair.')));
      setSlotIfPresent(slots, 's5_cta_text',  escapeHtml(firstNonEmpty(s.ctaText, s.cta, 'Baixar o app')));
    }
  });

  return slots;
}

// ─── Image distribution ───────────────────────────────────────────────────────

function distributeImages(html, templateId, libraryImages) {
  if (!libraryImages || libraryImages.length === 0) return html;

  const getImg = (i) => libraryImages[i % libraryImages.length];
  let imgIdx = 0;

  if (templateId === 'photo') {
    // Replace all background-image: url(...) references
    html = html.replace(
      /(style="[^"]*background(?:-image)?:\s*url\()[^)]+(\))/g,
      (match, before, after) => `${before}${getImg(imgIdx++)}${after}`
    );
    // Replace all <img src="..."> references (unsplash or local .png placeholders)
    html = html.replace(
      /(<img[^>]+src=")([^"]*)(")([^>]*>)/g,
      (match, before, src, quote, rest) => `${before}${getImg(imgIdx++)}${quote}${rest}`
    );
  }

  if (templateId === 'moodboard') {
    // Replace all <img src="..."> inside polaroid/frame elements
    html = html.replace(
      /(<img[^>]+src=")[^"]*(")/g,
      (match, before, after) => `${before}${getImg(imgIdx++)}${after}`
    );
  }

  return html;
}

// ─── editorial-sci special renderer ──────────────────────────────────────────

function renderEditorialSci(html, contentJson, brandContext, libraryImages) {
  const primary     = brandContext.primaryColor || brandContext.branding?.primaryColor || '#00E5FF';
  const logoUrl     = brandContext.logoUrl || brandContext.branding?.logoUrl || null;
  const brandInitials = (contentJson.brandInitials || brandContext.brandName || 'BR').substring(0, 2).toUpperCase();

  // Build logo HTML — img if logoUrl available, otherwise initials text
  const logoInner = logoUrl
    ? `<img src="${logoUrl}" alt="logo">`
    : brandInitials;

  // Resolve slides array — support both old single-headline schema and new slides[]
  let slides = [];
  if (Array.isArray(contentJson.slides) && contentJson.slides.length > 0) {
    slides = contentJson.slides;
  } else if (contentJson.headline) {
    // Backward compat: wrap single headline in a slides array
    slides = [{
      headline: contentJson.headline,
      imageFallbackQuery: contentJson.imageFallbackQuery || 'professional,editorial'
    }];
  } else {
    slides = [{ headline: 'YOUR HEADLINE HERE', imageFallbackQuery: 'professional,editorial' }];
  }

  const slideCount = slides.length;

  // Build all slide divs
  const slideDivs = slides.map((s, i) => {
    // Image: library first, then slide-specific fallback, then global fallback
    const imgUrl = (libraryImages && libraryImages.length > 0)
      ? libraryImages[i % libraryImages.length]
      : `https://source.unsplash.com/random/420x525/?${encodeURIComponent(s.imageFallbackQuery || contentJson.imageFallbackQuery || 'professional,editorial')}`;

    const headline = s.headline || '';
    const slideAccent = s.accentColor || primary;
    const dotsHtml = slides.map((_, dotIndex) =>
      `<div class="dot${dotIndex === i ? ' active' : ''}"></div>`
    ).join('');

    return `  <div class="slide${i === 0 ? ' active' : ''}" style="--slide-accent: ${slideAccent};">
    <div class="hero-image">
      <img src="${imgUrl}" alt="Slide ${i + 1}">
      <div class="gradient-overlay"></div>
    </div>
    <div class="content-area">
      <div class="micro-ui">
        <div class="divider"></div>
        <div class="logo-center">${logoInner}</div>
        <div class="divider"></div>
      </div>
      <h1 class="headline">${headline}</h1>
      <div class="footer-ui">
        <div class="swipe-dots">${dotsHtml}</div>
        ${slideCount > 1 ? '<div class="swipe-text">Swipe</div>' : ''}
      </div>
    </div>
  </div>`;
  }).join('\n');

  // Replace content between the EP comment markers (reliable with nested divs)
  html = html.replace(
    /<!--\s*EP:CAROUSEL_SLIDES_START\s*-->[\s\S]*?<!--\s*EP:CAROUSEL_SLIDES_END\s*-->/,
    `<!-- EP:CAROUSEL_SLIDES_START -->\n${slideDivs}\n<!-- EP:CAROUSEL_SLIDES_END -->`
  );

  return html;
}

// ─── Main renderer ────────────────────────────────────────────────────────────

/**
 * Renders an ElevePic template with dynamic brand + content data.
 *
 * @param {string} templateId  - One of the 7 ElevePic template IDs
 * @param {object} contentJson - AI-generated content JSON matching the template schema
 * @param {object} brandContext - Business profile brand data { primaryColor, brandName, ... }
 * @param {string[]} libraryImages - Array of image URLs from the brand's library
 * @returns {string} Complete, ready-to-render HTML string
 */
export function renderElevepicTemplate(templateId, contentJson, brandContext, libraryImages = []) {
  let html = loadTemplate(templateId);

  // 1. Inject CSS variable overrides for brand colors
  const cssVars = buildCssVariableOverride(brandContext);
  html = injectCssVariables(html, cssVars);
  html = injectTemplateBrandMode(html, templateId, brandContext);

  // 2. Special case: editorial-sci uses script injection instead of EP slots
  if (templateId === 'editorial-sci') {
    return renderEditorialSci(html, contentJson, brandContext, libraryImages);
  }

  // 3. Build slot values and substitute EP markers
  let slots = {};
  switch (templateId) {
    case 'bold':      slots = buildBoldSlots(contentJson, brandContext);      break;
    case 'editorial': slots = buildEditorialSlots(contentJson); break;

    case 'instagram':    slots = buildInstagramSlots(contentJson);                         break;
    case 'comparison':   slots = buildComparisonSlots(contentJson, brandContext);          break;
    case 'fitswap-swap': slots = buildFitswapSwapSlots(contentJson, brandContext);         break;
    case 'photo':
    case 'moodboard':
      // Text content from contentJson.slides (basic brand name + per-slide text)
      slots = { brand_name: contentJson.brandName || 'Marca' };
      (contentJson.slides || []).forEach((s, i) => {
        if (s.eyebrow)  slots[`s${i}_eyebrow`]  = s.eyebrow;
        if (s.headline) slots[`s${i}_headline`] = s.headline;
        if (s.subtext)  slots[`s${i}_subtext`]  = s.subtext;
        if (s.ctaText)  slots[`s${i}_cta`]      = s.ctaText;
      });
      break;
  }

  html = substituteEpSlots(html, slots);

  // 4. Distribute library images for image-heavy templates
  if (templateId === 'photo' || templateId === 'moodboard') {
    html = distributeImages(html, templateId, libraryImages);
  }

  return html;
}

// ─── JSON schema definitions (used by generateElevepicContent in aiService) ──

export const ELEVEPIC_CONTENT_SCHEMAS = {
  bold: {
    description: 'Dark overlay carousel with 7 slides. Text-only, no images.',
    fields: {
      brandName: 'string — the brand name',
      websiteUrl: 'string — website or @handle for the CTA slide',
      slides: `array of 7 objects:
  [0] hook: { eyebrow, headline, subtext }
  [1] impact: { eyebrow, impactNumber (big num like "3"), impactLabel (e.g. "Segundos.\\nÉ tudo que você tem."), impactCaption, subtext }
  [2] statement: { eyebrow, statementLines: string[5] (line1..line5 for the statement block), subtext }
  [3] pain: { eyebrow, headline (quoted phrase or provocative statement, can use <br>), subtext }
  [4] turning_point: { eyebrow, statementLines: string[4] (contrast "DE\\nX\\nPARA\\nY"), subtext }
  [5] process: { eyebrow, headline (3 words separated by <br>, e.g. "SIMPLES.<br>RÁPIDO.<br>PODEROSO."), subtext }
  [6] cta: { eyebrow, headline (call to action, uppercase, use <br> for line breaks, last word can wrap in <span class="hl-blue">), subtext, ctaText }`
    }
  },

  editorial: {
    description: 'Alternating light/dark editorial carousel with 7 slides.',
    fields: {
      brandName: 'string',
      websiteUrl: 'string',
      slides: `array of 7 objects:
  [0] cover (light): { tag, title (with optional <em>word</em> for italic), subtitle }
  [1] problem (dark): { tag, title (with optional <em>), subtitle }
  [2] data (light): { tag, title, subtitle, stats: [{value, label}, {value, label}, {value, label}] }
  [3] consequences (dark): { tag, title (with optional <em>), listItems: string[4] (negative consequences) }
  [4] solution (light): { tag, title, checkItems: string[5] (positive outcomes, last one can be a bonus) }
  [5] how-it-works (dark): { tag, title (with optional <em>), listItems: string[4] (numbered steps) }
  [6] cta (light): { tag, title (with optional <em>), subtitle, ctaText, ctaSub }`
    }
  },



  'editorial-sci': {
    description: 'Multi-slide carousel: each slide has hero image (top 60%) + bold uppercase headline (bottom 40%). Logo and brand accent color injected automatically.',
    fields: {
      brandInitials: 'string — 2 chars shown as logo fallback if no brand logo, e.g. "FB"',
      imageFallbackQuery: 'string — global Unsplash search keywords if no library images, e.g. "nutrition,food,healthy"',
      slides: `array of 3–7 objects (match the number of key points from the brief):
  each: {
    headline: "UPPERCASE BOLD STATEMENT. Wrap 1-2 key words in <span class='accent'>WORD</span> to highlight them in the brand color. Use <br> for line breaks. Keep to 4-6 lines max.",
    imageFallbackQuery: "optional per-slide Unsplash keywords override, e.g. 'running,athlete'"
  }
  Example slide: { "headline": "YOUR WALKING SPEED<br>PREDICTS YOUR <span class='accent'>LIFESPAN</span>.", "imageFallbackQuery": "walking,health" }`
    }
  },

  photo: {
    description: 'Cinematic photo carousel with 7 slides. Images from library.',
    fields: {
      brandName: 'string',
      slides: `array of 7 objects:
  [0-6]: { eyebrow, headline (with optional <br>), subtext }
  [6] also: { ctaText }`
    }
  },

  moodboard: {
    description: 'Vintage moodboard carousel with polaroid/film frames. 6 slides. Images from library.',
    fields: {
      brandName: 'string',
      slides: `array of 6 objects:
  [0-5]: { eyebrow, headline (with optional <em>italic</em>), subtext }`
    }
  },

  comparison: {
    description: 'Before & After carousel. Slide 1 shows two Gemini-generated photos side by side (Sem vs Com). 6 slides total.',
    fields: {
      brandName: 'string',
      websiteUrl: 'string — website or @handle for CTA slide',
      slides: `array of 6 objects:
  [0] hook: {
    eyebrow: string,
    headline: string,
    subtext: string,
    beforeLabel: string (e.g. "Sem ElevePic" or "Sem FitSwap"),
    afterLabel: string (e.g. "Com ElevePic" or "Com FitSwap"),

    beforeImagePrompt: string — A detailed English photography prompt for the BEFORE state.
      GOAL: Show the realistic situation WITHOUT the brand's product/service.
      DO NOT exaggerate flaws or create caricature. Realistic, common, unremarkable.

      FOR PHOTO/VISUAL SERVICES (e.g. ElevePic — professional photography brand):
        Represent a professional BEFORE any visual positioning improvement.
        - Lighting: natural, uncontrolled, slightly unflattering or irregular
        - Setting: public or everyday (street, simple office, café, hallway) — slightly disorganized, no aesthetic intent
        - Clothing: generic, neutral, no clear positioning (avoid formal attire that implies authority)
        - Posture: natural or slightly insecure, no leadership body language
        - Expression: neutral or slightly forced, no strong presence or confidence
        - Camera quality: simulate an older smartphone (iPhone 6–8 era), slight softness, limited depth of field
        - Composition: casual, no clear artistic direction
        - AVOID: terms like "ugly", "bad", "terrible". The person should look common and forgettable, not mocked.
        Example output: "Candid portrait of a professional in their early 30s standing in a busy office corridor, wearing plain beige shirt and dark jeans, natural overhead fluorescent lighting creating slight shadows under eyes, neutral expression with a faint smile, slightly slouched posture, blurry background of other people and desks, shot on iPhone 8 equivalent quality, 4.7mm lens, no depth-of-field separation, f/1.8 equivalent, slightly underexposed, realistic skin tones, honest documentary feel"

      FOR NUTRITION/FOOD BRANDS (e.g. FitSwap — AI nutrition planning):
        Show a common everyday meal as normally eaten, without optimization.
        - The food must be recognizable and relatable (rice + beans + fried egg, pasta, bread with butter — NOT pizza or hamburger)
        - Plating: simple, no garnish, ordinary home plate or cheap restaurant plate
        - Lighting: natural window light, slightly flat
        - Composition: overhead (flat lay) or slight angle, casual, no food styling intent
        - Setting: home kitchen table, everyday background
        - Camera quality: casual smartphone photo
        - AVOID: making the food look disgusting. It should look normal and edible, just unoptimized.
        Example output: "Overhead food photography of a typical Brazilian everyday meal: white rice, black beans, and a sunny-side-up fried egg on a simple white ceramic plate, placed on a wooden kitchen table with a glass of water nearby, natural window light from the side creating slight shadows, casual smartphone photo quality, no food styling, honest and relatable, the meal looks edible but ordinary"

    afterImagePrompt: string — A detailed English photography prompt for the AFTER state.
      GOAL: Show the transformed situation WITH the brand's product/service. NOT just "prettier" — but INTENTIONALLY engineered for status/result.
      The golden rule: "Nothing should look artificial. Everything must look naturally superior."

      FOR PHOTO/VISUAL SERVICES (e.g. ElevePic):
        Show authentic visual authority — credibility that feels real, not staged. The goal is "best version of themselves", NOT "a different person in a stock photo".
        CRITICAL: The person must look like a real human being, not a stock photo model. Natural imperfections = credibility.
        - Lighting: soft natural side light from a window — NOT dramatic studio/cinematic lighting. Gentle shadows, not theatrical contrast.
        - Setting: real environments with character — a bookshelf-filled office, a real desk with objects on it, a coffee shop with personality. NOT city skyline, NOT black studio, NOT generic "clean office". Slightly lived-in is more credible than perfectly staged.
        - Clothing: casual authority — fitted blazer over a plain t-shirt or open collar shirt. NO full suit + tie (feels like "generic CEO", creates distance). Look: "modern consultant", not "bank director".
        - Posture: relaxed presence — weight slightly shifted, gentle body rotation, hands holding something (notebook, cup) or loosely at side. NOT symmetrical frozen pose with hands perfectly positioned.
        - Expression: calm and slightly open — NOT hard neutral, NOT rigid serious, NOT forced smile. The look of someone comfortable in their expertise.
        - Camera quality: professional but natural (Sony A7III equivalent, 85mm f/1.8) — gentle background bokeh, NOT exaggerated blurry background.
        - Skin: natural texture preserved — visible pores, subtle micro-imperfections. NO heavy retouching that makes skin look like plastic.
        - Composition: editorial portrait, slight off-center framing or 3/4 angle — NOT perfectly centered symmetrical headshot.
        - Emotional tone: "this person is genuinely good at what they do" — NOT intimidating, NOT fake-premium.
        - AVOID: city skyline background, full suit + tie, dramatic theatrical lighting, symmetrical stiff pose, plastic over-retouched skin, crossed arms looking away, studio color lighting (colored gels), "fake coach" aesthetics.
        Example output: "Authentic professional portrait of a business consultant in their early 30s, wearing a fitted navy blazer over a plain white t-shirt (no tie), standing near a large window in a real bookshelf-filled office, soft natural side light from the window creating gentle realistic shadows with slight directional depth, natural skin texture with subtle micro-imperfections preserved, relaxed confident posture with body slightly turned and one hand loosely holding a notebook, direct calm gaze at camera with a slightly open expression, no heavy retouching, Sony A7III equivalent, 85mm f/1.8, gentle bokeh on background bookshelves, editorial color grade warm but not cinematic, honest and credible — feels like a real professional photo done right, not a stock photo"

      FOR NUTRITION/FOOD BRANDS (e.g. FitSwap):
        Show the SAME meal reimagined as a macro-optimized, nutritionally intentional version. The upgrade should feel achievable, not like a luxury meal.
        - The food must be recognizably related to the BEFORE meal (same base dish, elevated)
        - Higher protein, less excess fat/calories — visually: leaner proteins, more colorful vegetables, fresher ingredients
        - Plating: clean minimal plate, possibly white ceramic, intentional arrangement (no excessive styling)
        - Lighting: soft natural daylight or professional food photography lighting — bright, fresh, appetizing
        - Composition: overhead or 45-degree angle, clean background (white surface or light wood)
        - Camera quality: professional food photography, slight depth of field
        - The food should look genuinely appetizing AND nutritionally coherent
        - AVOID: making it look like a "diet meal" or unappetizing. It should look like something you'd actually want to eat.
        Example output: "Overhead food photography of a macro-optimized version of a classic Brazilian meal: 100g grilled chicken breast sliced over a small portion of white rice with fresh herbs, a generous portion of sautéed green vegetables (broccoli and zucchini) with olive oil, wedge of lemon on the side, clean white ceramic plate on a light oak wood surface, soft natural daylight from the left creating gentle shadows, professional food photography quality, slight depth of field, fresh and appetizing, nutritionally intentional plating"
  }
  [1] impact: { eyebrow, impactNumber (e.g. "73%"), impactLabel (1-2 short lines explaining the number), impactCaption (context sentence) }
  [2] checklist: { eyebrow, headline (can use <em>word</em> for italic), checkItems: string[3] (specific, measurable benefits — no hype) }
  [3] quote: { eyebrow, quote (first-person testimonial or insight — natural, not sales-y), attribution (e.g. "Usuário real · 3 semanas de uso") }
  [4] process: { eyebrow, headline (short, e.g. "Três etapas. Sem enrolação."), steps: [{title, body}] (array of 3 steps) }
  [5] cta: { eyebrow, headline (direct, last word or phrase can wrap in <span class="accent">word</span>), ctaText (button label, action verb) }`
    }
  },

  instagram: {
    description: 'Instagram-chrome carousel (realistic IG frame). 5 slides.',
    fields: {
      brandName: 'string',
      socialHandle: 'string — @handle',
      brandInitial: 'string — single letter',
      igCaption: 'string — Instagram caption text',
      slides: `array of 5 objects:
  [0] cover: { tag, heading, subtext }
  [1] body: { heading, subtext, listItems: string[] }
  [2] steps: { heading, stepCards: [{title, body}] }
  [3] stats: { heading, statsRow: [{value, label}], subtext }
  [4] cta: { heading, subtext, ctaText }`
    }
  },

  'fitswap-swap': {
    description: 'Fitswap Food Swap carousel — light aesthetic. 6 slides: editorial split food image hook → myth reframe → ingredient swap list → numeric impact → app teaser → CTA. All slides revolve around the same dish chosen in slide 0.',
    fields: {
      brandName: 'string — e.g. "Fitswap"',
      websiteUrl: 'string — website or @handle for CTA slide',
      dishName: 'string — REQUIRED. The everyday Brazilian dish chosen for this carousel. NOT pizza, NOT hamburger. Examples: lasanha, macarrão ao molho vermelho, brigadeiro, panqueca, bolo de chocolate, strogonoff, frango à parmegiana, risoto, coxinha, pão de queijo recheado, bobó de camarão, arroz carreteiro. This dish must be referenced consistently across ALL 6 slides.',
      slides: `array of 6 objects:

  [0] hook: {
    eyebrow: string — short label tied to the dish, e.g. "Mesma lasanha" or "Mesmo strogonoff"
    headline: string — punchy hook mentioning the dish or the transformation concept. Can use <em>word</em> for italic. E.g. "Você não precisa <em>cortar a lasanha.</em>" or "Mesmo macarrão. Decisão <em>melhor.</em>"
    subtext: string — 1 short line, e.g. "Pequenas trocas. Mesmo sabor. Resultado diferente."

    dishName: string — the exact same value as the top-level dishName field (repeat it here so the slot builder can access it per-slide)

    imagePrompt: string — A single editorial split-composition image prompt following this EXACT template structure (fill in {dishName} with the actual dish name):

      "Create a hyper-realistic, premium editorial food image in a vertical split composition (4:5). The image shows the SAME dish transformed into a healthier version. DISH: {dishName}. LEFT SIDE — ORIGINAL (CALORIC): A real, everyday version of {dishName} on a plate. Looks indulgent and heavier: richer sauce, more oil, butter, or cheese, less structure, more processed or dense ingredients. Warm indoor lighting, slightly dim. Natural imperfections, home-cooked feel. RIGHT SIDE — SMART HEALTHY VERSION: The SAME {dishName}, clearly recognizable, but intelligently adapted for health: cleaner structure, lighter sauce, fresher ingredients, better balance, reduced heaviness, still appetizing. Bright natural daylight, clean tones. IMPORTANT: It must feel like the SAME {dishName} upgraded, not a different recipe. Still delicious. Never diet food. SUBTLE TRANSFORMATION CUE: A minimal, elegant visual continuity between both sides (same plate, same angle, same framing), suggesting evolution rather than replacement. No arrows, no gimmicks. OPTIONAL TECH HINT: A minimal smartphone nearby or faint neon-lime accent (#A6F000) suggesting AI-driven adjustment, no readable UI text. CAMERA & STYLE: Editorial food photography. Same camera angle on both sides. Shallow depth of field. Soft shadows, slight grain for realism. BACKGROUND: Neutral kitchen or clean surface. Minimal distractions. TEXT OVERLAY: Small clean sans-serif — Left: Original, Right: Smart Version. RULES: No cartoon or CGI food, no calorie numbers, no fitness clichés, no influencer hands or poses, no exaggerated effects."
  }

  [1] myth: {
    eyebrow: string — e.g. "O que você acredita" or "Crença comum"
    myth: string — a false belief SPECIFIC to the chosen dish. Written as something the user genuinely thinks about that dish. E.g. for lasanha: "Lasanha engorda demais. Não tem como comer sem culpa." For macarrão: "Carboidrato à noite vira gordura automaticamente."
    truth: string — the dish-specific reframe. Direct, reassuring. E.g. for lasanha: "Lasanha com os ingredientes certos é proteína, fibra e sabor. Não é o vilão." For macarrão: "Não é o macarrão. É a quantidade e o molho. Troca simples, resultado real."
    subtext: string — 1 sentence bridging to the swap list, referencing the dish. E.g. "3 trocas na sua lasanha mudam tudo sem mudar o sabor."
  }

  [2] swaps: {
    eyebrow: string — reference the dish, e.g. "4 trocas na lasanha" or "No seu macarrão"
    headline: string — short, can use <em>. E.g. "Só <em>ajustar</em> o que já está na lasanha."
    swaps: array of 4 objects — ALL swaps must be SPECIFIC ingredients of the chosen dish: [
      { from: string — original ingredient used in the dish (e.g. "molho bechamel pesado"), to: string — the swap (e.g. "molho de iogurte grego"), note: string — quantified benefit (e.g. "-90kcal" or "+6g prot." or "menos gordura saturada") }
    ]
    IMPORTANT: Do NOT use generic swaps like "arroz branco → arroz integral" if the dish is lasanha. Every swap must make sense for the specific dish chosen.
  }

  [3] impact: {
    eyebrow: string — reference the dish, e.g. "Na mesma lasanha" or "No mesmo macarrão"
    stats: array of exactly 2 objects: [
      { number: string — calorie reduction with sign, e.g. "-220", unit: string — "kcal", label: string — "a menos" },
      { number: string — protein gain with sign, e.g. "+18g", unit: string — "prot.", label: string — "a mais" }
    ]
    RULE: Numbers must be realistic estimates based on the specific swaps in slide 2 applied to a typical portion of the dish. Do the math based on actual ingredient substitutions — don't invent large numbers.
    disclaimer: string — always "* valores médios por porção com as trocas acima"
  }

  [4] howto: {
    eyebrow: string — e.g. "Como o Fitswap faz isso" or "No app"
    headline: string — short punchy line, can use <br> and <em>. E.g. "Não é receita.<br><em>É decisão.</em>"
    steps: array of exactly 3 objects — steps should feel like they reference the dish experience naturally: [
      { title: string — max 4 words, action-oriented, body: string — 1 short sentence describing the experience, NOT the feature }
    ]
    TONE: Describe the experience from the user's perspective. "Fala o que quer comer" not "O usuário insere o prato desejado".
  }

  [5] cta: {
    eyebrow: string — e.g. "Próximo passo"
    headline: string — direct, last word/phrase in <span class="accent">. Can reference the dish concept. E.g. "É isso que o<br>Fitswap <span class=\\"accent\\">resolve.</span>"
    saveHint: string — encourage saving, e.g. "Salva esse post antes de sair." or "Salva para testar com a sua lasanha."
    ctaText: string — app download CTA, e.g. "Baixar o app" or "Testar grátis"
  }`
    }
  },
};
