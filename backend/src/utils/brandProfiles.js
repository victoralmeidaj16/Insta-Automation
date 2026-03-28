const FITSWAP_REFERENCE_PROMPTS = [
    // 1. Decision relief — woman in kitchen with app
    `Create a premium, cinematic editorial advertisement image for the Fitswap app, focused on instant clarity and relief around food decisions. FORMAT: Vertical 4:5 (1080×1350), single-frame, strong negative space for typography, high-end wellness-tech aesthetic. SCENE: Bright, clean, modern kitchen flooded with soft natural daylight. White and neutral tones dominate. Environment feels calm, organized, resolved. SUBJECT: A modern woman (25–35), realistic, not influencer. Standing naturally at the kitchen counter. One hand holding a smartphone at chest height, the other resting near a finished, healthy, real-life meal. Expression shows relief and control — decision already made. No smile. Calm confidence only. SMARTPHONE: Subtle Neon Lime glow (#A6F000) from the screen, suggesting Fitswap interface (abstract UI, no readable text). Glow is refined, minimal, intelligent — never flashy. FOOD: Balanced, appetizing, realistic meal. Fresh, simple, achievable. Not gourmet, not staged. STYLE: Ultra-realistic photography, soft grain, gentle bloom on phone glow, natural shadows, shallow depth of field. RULES: No smiling, no fitness clichés, no calorie numbers, no influencer poses, no cartoon style.`,

    // 2. Pantry scanner — AI reading ingredients
    `Create a premium, cinematic editorial advertisement image for the Fitswap app, focused on smart food creation using only available ingredients. SCENE: A real, modern kitchen in soft natural daylight. A refrigerator door is open or a pantry cabinet is partially visible. Lighting is clean and neutral. INGREDIENTS INSIDE: A small, realistic set of everyday ingredients: eggs, tomatoes, onion, leafy greens, chicken or canned protein, bread or tapioca, basic condiments. Everything looks real, imperfect, and familiar. No abundance. No gourmet setup. SUBJECT & ACTION: A hand holds a smartphone in the foreground, camera slightly angled toward the open fridge. SMARTPHONE: Screen emits a refined Neon Lime glow (#A6F000), suggesting Fitswap's AI vision system. UI is abstract and non-readable. Glow subtly reflects on nearby ingredients. RESULT: In the midground, a finished, simple, healthy meal appears on the counter — clearly made from the scanned ingredients. Connection between ingredients → meal must feel obvious but natural. STYLE: Ultra-realistic photography, soft grain, gentle bloom on phone glow, natural shadows, clean depth of field. RULES: No smiling, no influencer poses, no calorie numbers, no cartoon style, no clutter.`,

    // 3. Minimalist text-first cover — decision fatigue
    `Create a premium Instagram carousel cover image for the Fitswap app. STYLE & MOOD: Minimalist, high-end wellness-tech advertising aesthetic. Clean, modern, confident, emotionally direct. No chaos. No excess. Strong visual silence. BACKGROUND: Pure white background (#FFFFFF), occupying most of the frame (70–80% white space). Subtle soft shadowing near the bottom to add depth. No textures, no gradients. COMPOSITION: Text centered, slightly above the vertical middle. Balanced margins on all sides. Feels like a confident opening statement. ACCENT: A single neon lime (#A6F000) accent element — minimal underline, soft glow, or color change on one key element. BRANDING: Very small Fitswap logo or wordmark at the bottom. Low contrast, discreet. No CTA. LIGHTING & FINISH: Ultra-clean digital lighting, soft grain (very subtle), crisp edges, high resolution. Feels like an Apple Health / Calm-style editorial ad. RULES: No food, no people, no icons, no emojis, no CTA, no decorative elements.`,

    // 4. Emotional portrait — decision fatigue face
    `Create a premium Instagram carousel cover image for the Fitswap app, focused on emotional identification and decision fatigue. STYLE & MOOD: High-end wellness-tech advertising with cinematic emotion. Minimalist, dramatic, intimate. Apple-style campaign mixed with editorial portrait photography. COMPOSITION: Vertical 4:5. Super low-angle shot. Subject placed slightly off-center to the right, leaving strong negative space on the left for text. SUBJECT: A young adult woman (25–35), realistic and relatable. Extreme close-up on her face — only part visible (eyes, cheek, mouth). Facial expression: sad, tired, emotionally drained, subtle frustration. Not exaggerated, not crying. The look of someone who "tried again and failed." Skin texture natural, unretouched, hyper-realistic. BACKGROUND: Pure white (#FFFFFF), very clean, bright, minimal. Soft natural falloff near edges for depth. LIGHTING: Directional soft light from above and slightly behind, creating gentle shadows. High contrast but soft — cinematic portrait lighting. FINISH: Ultra-high resolution, soft grain, sharp typography. RULES: No food yet, no icons, no emojis, no CTA, no clutter. Emotion > explanation.`,

    // 5. Before/After food transformation split
    `Create a hyper-realistic, premium editorial food image in a vertical split composition (4:5). The image shows the SAME dish transformed into a healthier version. LEFT SIDE — ORIGINAL: A real, everyday version of the dish on a plate. Looks indulgent and heavier: richer sauce, more oil or cheese, less structure. Warm indoor lighting, slightly dim. Natural imperfections, home-cooked feel. RIGHT SIDE — SMART HEALTHY VERSION: The SAME dish, clearly recognizable, but intelligently adapted: cleaner structure, lighter sauce, fresher ingredients, better balance. Bright natural daylight, clean tones. IMPORTANT: It must feel like the SAME meal upgraded, not a different recipe. Still delicious. Never "diet food." SUBTLE TRANSFORMATION CUE: Minimal, elegant visual continuity between both sides (same plate, same angle, same framing) — suggesting evolution rather than replacement. No arrows, no gimmicks. OPTIONAL TECH HINT: A minimal smartphone nearby or faint neon-lime accent (#A6F000) suggesting AI-driven adjustment (no readable UI text). CAMERA & STYLE: Editorial food photography, same camera angle on both sides, shallow depth of field, soft shadows, slight grain for realism. RULES: No cartoon or CGI food, no calorie numbers, no fitness clichés, no influencer poses.`
];

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values = []) {
    return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function mergeArrayValues(primary = [], fallback = []) {
    return uniqueStrings([...(primary || []), ...(fallback || [])]);
}

function mergeFavoritePrompts(primary = [], fallback = []) {
    const merged = [...(primary || []), ...(fallback || [])].filter(Boolean);
    const seen = new Set();

    return merged.filter((item) => {
        const key = `${item.id || ''}:${normalizeText(item.name || '')}:${normalizeText(item.text || item)}`;
        if (!key.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizeBrandKey(input = {}) {
    const raw = typeof input === 'string'
        ? input
        : input.brandKey || input.brandName || input.name || '';

    const normalized = normalizeText(raw).toLowerCase();

    if (!normalized) return '';
    if (normalized.includes('fitswap') || normalized.includes('fit swap') || normalized.includes('nutriverse')) return 'fitswap';
    if (normalized.includes('inner boost')) return 'inner-boost';
    if (normalized.includes('viver mais')) return 'viver-mais';
    if (normalized.includes('tudy')) return 'tudy';

    return normalized
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function isFitswapBrand(input = {}) {
    return normalizeBrandKey(input) === 'fitswap';
}

export function getBrandPreset(brandKey) {
    if (brandKey === 'inner-boost') {
        return {
            brandKey: 'inner-boost',
            description: 'Inner Boost: Soluções práticas para clareza mental, organização e produtividade sem ansiedade.',
            brandContext: 'A Inner Boost é uma marca introspectiva, profunda e emocional que utiliza o conceito de "Espelho Mental" para confrontar a realidade e guiar o usuário para a clareza. A estética é dark, tecnológica e minimalista.',
            branding: {
                primaryColor: '#00C2FF', // Neon Blue
                secondaryColor: '#00F5A0', // Neon Green
                style: 'Mental Mirror: Dark, introspective, emotional, high-contrast. Minimalist black backgrounds with vibrant neon accents.',
                guidelines: 'Black (#0B0B0D) base, Neon Blue (#00C2FF) and Neon Green (#00F5A0) for accents. Floating 3D thought cards. Dramatic high-contrast lighting. No warm colors.'
            },
            brandKit: {
                personality: 'Introspectiva, profunda, honesta, transformadora, moderna.',
                carouselTemplate: {
                    name: 'Mirror Sequence',
                    description: 'A 5-stage emotional journey from chaos to clarity.',
                    stages: [
                        { name: 'CHOQUE', goal: 'Anxiety + Frustration - O despertar, o problema nu e cru.' },
                        { name: 'IDENTIFICAÇÃO', goal: 'Guilt + Shame - O espelho, "eu faço isso".' },
                        { name: 'CAOS', goal: 'Overwhelm - O pico da dor, bagunça mental.' },
                        { name: 'CLAREZA', goal: 'Frustration -> Action - A virada, o caminho.' },
                        { name: 'SAÍDA', goal: 'Trust/Solution - O guia para o novo eu.' }
                    ]
                }
            }
        };
    }

    if (brandKey === 'viver-mais') {
        return {
            brandKey: 'viver-mais',
            branding: {
                primaryColor: '#9446C4',
                style: 'Premium wellness, deep purple tones, elegant and calming.',
            },
            brandKit: {
                customColors: ['#9446C4', '#A158CC', '#AF67D6', '#BC79E0'],
                preferredLanguage: 'Portuguese (Brazil)'
            },
            aiPreferences: {
                defaultAspectRatio: '4:5',
                style: 'Premium wellness, deep purple tones.',
                tone: 'Calm and professional',
                favoritePrompts: []
            }
        };
    }

    if (brandKey === 'tudy') {
        return {
            brandKey: 'tudy',
            description: 'Sistema operacional de estudos com IA que transforma qualquer conteúdo bruto em aprendizado estruturado, prática ativa e progresso visível.',
            brandContext: `O Tudy é um assistente de estudos com IA que transforma qualquer material ou dúvida em prática, explicação e progresso real. Não é apenas um gerador de resumos nem um app de quiz isolado — é um sistema operacional de estudos com IA.

Três funções centrais:
1. RESOLVER POR FOTO: Tire foto de exercício, prova, anotação ou lousa. O Tudy entende, resolve passo a passo, explica o raciocínio, gera exercícios parecidos e cria flashcards.
2. CRIAR ESTUDOS COM IA: Envie PDF, foto do caderno, aula ou texto. O Tudy transforma em resumo estruturado, flashcards, quiz, prática guiada e revisão inteligente.
3. PREPARADOR DE PROVAS (TRILHAS): Escolha disciplina, tópicos e material. O Tudy cria trilha com ordem de estudo, prática por etapa, progresso visível e revisão automática.

O Tudy NÃO é: app de receita de estudo, ferramenta simples de flashcard, plataforma de conteúdo passivo.
O Tudy É: sistema de aprendizado ativo com IA — explicação + prática + progresso.

Antes do Tudy: muito conteúdo, não sabe por onde começar, relê e esquece, trava em exercícios.
Depois do Tudy: estudo estruturado, prática automática, explicação clara, progresso visível.`,

            contentStrategy: `Nicho real: estudo inteligente com IA para universitários e vestibulandos.
Transformação prometida: transformar caos de páginas, anotações e aulas em plano de estudo acionável.

Linhas editoriais:
1. PRÁTICA ATIVA > LEITURA PASSIVA: mostrar que reler não fixa — quiz, flashcards e prática guiada sim.
2. IA QUE ORGANIZA SEU ESTUDO: demonstrações do app (foto → estudo pronto, PDF → trilha).
3. PROGRESSO VISÍVEL: antes/depois de uma semana com o Tudy, evolução em provas, streak de estudos.
4. IDENTIFICAÇÃO COM A DOR: "muito conteúdo e não sabe por onde começar" — conteúdo de identificação emocional.

Formatos prioritários: Reels (POV: manda foto da prova → Tudy resolve), Carrosséis premium (mini-aulas de método de estudo), Stories com quiz interativo.`,

            targetAudience: `Estudantes universitários (18-25) com excesso de material e falta de direção. Vestibulandos precisando de prática estruturada para ENEM/vestibulares. Profissionais (25-35) estudando para certificações e avanço de carreira. Professores que querem gerar material de prática para alunos. Perfil comportamental: estudam em blocos curtos, alternam entre fontes, precisam de feedback rápido para manter engajamento.`,

            productService: `App assistente de estudos com IA que: (1) resolve questões por foto (exercício, prova, lousa) passo a passo; (2) cria estudos completos a partir de PDF, foto, áudio ou texto; (3) gera flashcards, quiz e questões discursivas automaticamente; (4) monta trilhas de preparação para provas com ordem e progresso; (5) tem comunidade com grupos de estudo e ranking; (6) aprende e adapta revisões ao desempenho do usuário.`,

            branding: {
                primaryColor: '#2257F5',   // Electric Blue
                secondaryColor: '#7C3AED', // Violet
                style: 'Dark premium focused. Deep navy/black backgrounds. Electric blue as primary accent. Space Grotesk for headlines. IBM Plex Sans for body. Cerebral, intelligent, structured aesthetic — not gaming, not toy, not corporate.',
                guidelines: `Tudy Visual Brand Kit:
COLORS: Dark bg #0F1113 (primary), Surface #191C20, Electric Blue #2257F5 (CTAs/accents), Violet #7C3AED (premium/tracks), Mint #10B981 (success), White #F4F7FA (text on dark).
TYPOGRAPHY: Space Grotesk (bold 700) for display/headlines; IBM Plex Sans for UI/body. Letter-spacing 0.02-0.03em for titles.
MOOD: Focused, cerebral, premium, modern. Like a high-performance study cabin — dark, lit, energetic, silent.
PHOTOGRAPHY: Subjects must look concentrated, autonomous, capable. Environments: real desks, libraries, study corners, coffee shops, transport. Directional light, soft contrast, realistic color temp.
NEVER: White/light backgrounds for hero shots, fitness clichés, cartoon/educational toy aesthetic, cyberpunk neon excess, smiling generic stock photos, cluttered multi-idea compositions, AI brain holograms.
ALWAYS: Dark surfaces as base. Blue as primary interaction color. Progress and structure as visual motifs. Overlay UI elements must look editorial, not artificial.`
            },

            aiPreferences: {
                defaultAspectRatio: '4:5',
                style: 'Tudy dark editorial. Deep navy backgrounds (#0F1113, #191C20). Electric blue (#2257F5) accents. Focused human subjects in real study environments. Premium but human — real students, not models.',
                tone: 'Inteligente, direto, encorajador, focado, preciso. Nunca acadêmico frio. Nunca exagerado ou teatral. Linguagem orientada à ação.',
                favoritePrompts: []
            },

            brandKit: {
                coreMessage: 'Transforme conteúdo em aprendizado.',
                personality: 'Inteligente (nunca fria), rápida (nunca apressada), focada (nunca rígida), acolhedora (nunca infantil), premium (nunca intimidadora).',
                archetype: 'O Sábio + O Guia — credibilidade e inteligência estruturada tornada acessível e orientada à ação.',
                valuePillars: [
                    'Aprendizado ativo (quiz + flashcards + prática, não leitura passiva)',
                    'IA que organiza e estrutura (não só responde)',
                    'Progresso visível (o usuário enxerga evolução real)'
                ],
                editorialLines: [
                    'Prática Ativa > Leitura Passiva',
                    'IA que Organiza Seu Estudo',
                    'Progresso Visível',
                    'Identificação com a Dor do Estudante'
                ],
                doAlways: [
                    'Usar fundos escuros como base visual padrão',
                    'Ancorar visuais no universo de estudo real (caderno, livro, tela, mesa)',
                    'Mostrar progresso e estrutura como motivos visuais principais',
                    'Usar Space Grotesk para headlines e IBM Plex Sans para corpo',
                    'Blue (#2257F5) como cor primária de interação e acento estratégico',
                    'Comunicar resultado antes de funcionalidade'
                ],
                neverUse: [
                    'Fundos brancos ou claros em peças hero',
                    'Estética de app educacional infantil ou cartoon',
                    'Cyberpunk neon excessivo',
                    'Fotos de banco de imagem genéricas com pessoas sorrindo sem contexto',
                    'Cérebros brilhando ou hologramas robóticos para representar IA',
                    'Visual poluído com muitas ideias simultâneas',
                    'Linguagem exagerada: "mágica", "revolucionária", "genial"'
                ],
                visualReferenceUrls: [],
                appUiReferenceUrls: [],
                referencePrompts: [],
                uiPatterns: [
                    'Dark surfaces #0F1113 / #191C20',
                    'Rounded corners 12-22px',
                    'Outline icons 1.75-2px stroke',
                    'Blue (#2257F5) CTAs on dark',
                    'Progress bars and streak indicators'
                ]
            }
        };
    }

    if (brandKey !== 'fitswap') return null;

    return {
        brandKey: 'fitswap',
        description: 'Uma IA que decide o que você vai comer, com base no que você tem, quer e precisa — transformando sua alimentação sem esforço.',
        brandContext: `O Fitswap é um motor de decisão alimentar com IA. Ele resolve o problema central: "não sei o que comer". A IA analisa o que o usuário tem na geladeira, entende seu objetivo (emagrecer, hipertrofia etc.), respeita seu paladar e cria refeições automaticamente. Não é um app de receitas — é uma IA que decide por você.

Segundo núcleo: transformador de desejos. O usuário pensa em pizza, chocolate, hambúrguer — o Fitswap cria versões saudáveis mantendo o sabor e ajustando os macros. O conceito central da marca é "Prazer sem culpa".

Terceiro núcleo: sistema de rotina alimentar inteligente. O app aprende como o usuário realmente come, seus horários, padrões e desejos, e faz micro-trocas sem ruptura brusca. Não promete perfeição — promete facilidade sustentável.

O Fitswap NÃO é: app de dieta, app de receita, app fitness. O Fitswap É: sistema de alimentação inteligente do dia a dia.

O valor psicológico central: menos decisão, menos culpa, menos esforço, mais consistência.`,

        contentStrategy: `4 linhas editoriais estratégicas:
1. PRAZER SEM CULPA (anti-restrição + psicologia alimentar): mostrar que comer bem não é sobre perfeição. Antes/depois de trocas inteligentes, neurociência do "já que estraguei já era", por que dietas rígidas falham, o valor de versões "suficientemente boas".
2. IA QUE RESOLVE SUA VIDA (pilar central do produto): demonstrações da IA, scanner de despensa, desejo → versão fit automática, como a IA faz trocas sem perder sabor, plano semanal em segundos.
3. NUTRIÇÃO PRÁTICA PARA GENTE REAL (vida corrida): refeições de 5 minutos, "com o que você tem em casa dá pra fazer isso", como organizar a semana em 10 minutos, lanches de ansiedade em versões leves.
4. COMER MELHOR É EVOLUÇÃO, NÃO PUNIÇÃO: conteúdo emocional de identificação e identidade de marca — "a dieta não fracassa porque você come errado, mas porque tenta comer perfeito".

Formatos prioritários: Reels virais (POV scanner de despensa, comparativo manual vs. app), Carrosséis premium (mini-aulas, transformações), Stories interativos.`,

        targetAudience: `Mulheres com objetivo estético (25-40) que buscam corpo fitness e saúde sem abrir mão do sabor. Busy achievers — profissionais ocupados que querem comer bem mas não têm tempo para planejar. Entusiastas fitness com foco em macros e performance. Pessoas que tentaram dietas rígidas e falharam — buscam algo sustentável. Restrições alimentares (veganos, celíacos, intolerantes). Perfis premium de lifestyle que valorizam personalização e exclusividade.`,

        productService: `App assistente nutricional com IA que: (1) cria refeições com o que o usuário tem em casa via Scanner de Despensa; (2) transforma desejos em versões fit — pizza, chocolate, hambúrguer → versão saudável com sabor mantido; (3) monta plano alimentar semanal personalizado em segundos; (4) faz micro-trocas inteligentes para criar consistência sem ruptura; (5) aprende padrões, horários e preferências do usuário ao longo do tempo.`,

        branding: {
            primaryColor: '#A6F000',
            secondaryColor: '#111827',
            logoUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/logos/fitswap-logo.png` : 'http://localhost:3000/logos/fitswap-logo.png',
            style: 'Minimalist premium wellness-tech. White-space heavy. Calm, fresh, editorial. Hyper-realistic food photography. Practical Brazilian kitchen scenes. Subtle neon lime (#A6F000) tech accents. Premium but human — never gourmet, always achievable.',
            guidelines: `Fitswap Visual Brand Kit:
COLORS: White (#FFFFFF) 70-80% dominant, Dark Gray (#111827) 10-15% for structure, Neon Lime (#A6F000) 5-10% accent only, Medium Gray for secondary text.
TYPOGRAPHY: Inter or SF Pro. Heavy weight (800-900) for headlines. Tight letter-spacing. All caps for overlay titles.
LAYOUT: Much white space. Clean cards with rounded corners 16-24px. Single focal point per image. Lower 40% clean for text overlay.
FOOD AESTHETIC: Real, achievable food. Not gourmet, not staged. Everyday ingredients. Home-cooked feel with editorial lighting.
NEVER: Neon Lime as background, heavy shadows, decorative fonts, visual clutter, fitness clichés, influencer poses, readable UI text generated by AI, dark backgrounds, abstract philosophical objects as main subject.
ALWAYS: Anchor visuals to food, kitchen, eating, or nutrition context. Communicate utility, clarity, calm, competence.`
        },

        aiPreferences: {
            defaultAspectRatio: '4:5',
            style: 'Fitswap editorial wellness-tech. Clean white kitchens. Soft natural daylight. Dark gray (#111827) typography dominant. Subtle neon lime (#A6F000) highlights. Practical food scenes. Premium but human and achievable.',
            tone: 'Motivador, direto, acolhedor, moderno, simples. Nunca terrorismo nutricional. Nunca julgamento. Sempre parceiro, nunca fiscal.',
            favoritePrompts: [
                {
                    id: 'fitswap-white-overlay-template',
                    name: '🍎 Carrossel Fitswap (Overlay Branco)',
                    text: '[WHITE_OVERLAY] [HEADLINE: DELICIE-SE SEM PESO NA CONSCIÊNCIA] [HIGHLIGHTS: DELICIE-SE, CONSCIÊNCIA] [BACKGROUND: A professional top-down editorial shot of a vibrant, colorful healthy meal bowl on a white kitchen surface, surrounded by fresh ingredients, soft natural daylight, shallow depth of field, extremely photorealistic, no text no logos.]',
                    description: 'Gerar imagem da cena + overlay branco com headline destacada em verde lima. Ideal para posts do Fitswap.',
                    createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
                    preset: true,
                    overlayMode: 'fitswap-white'
                },
                ...FITSWAP_REFERENCE_PROMPTS.map((text, index) => ({
                    id: `fitswap-preset-${index + 1}`,
                    name: `Fitswap Referência ${index + 1}`,
                    text,
                    createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
                    preset: true
                }))
            ]
        },

        brandKit: {
            coreMessage: 'Uma IA que decide o que você vai comer, com base no que você tem, quer e precisa — sem esforço.',
            personality: 'Moderna, leve, tecnológica, motivadora, acolhedora. Parceira — nunca fiscalizadora. Empática com quem já tentou e falhou.',
            valuePillars: [
                'IA que reduz atrito (menos decisão, mais ação)',
                'Prazer sem culpa (desejos → versões inteligentes)',
                'Consistência sem esforço (micro-trocas sustentáveis)'
            ],
            editorialLines: [
                'Prazer Sem Culpa — anti-restrição e psicologia alimentar',
                'IA que Resolve Sua Vida — demonstrações do produto',
                'Nutrição Prática Para Gente Real — vida corrida, sem tempo',
                'Comer Melhor é Evolução, Não Punição — identidade de marca'
            ],
            doAlways: [
                'Usar muito espaço em branco',
                'Ancorar visuais no universo de comida, cozinha, ingredientes ou alimentação',
                'Manter layout limpo e card branco como estrutura',
                'Aplicar Inter ou SF Pro em peso alto para títulos',
                'Usar Neon Lime apenas como destaque',
                'Mostrar comida real, alcançável — não gourmet, não encenada',
                'Comunicar utilidade diária, clareza, calma e competência'
            ],
            neverUse: [
                'Neon Lime como fundo principal',
                'Sombra pesada',
                'Fontes decorativas',
                'Clutter visual',
                'Fitness cliché ou influencer pose',
                'UI legível gerada pela IA',
                'Fundo escuro ou dramático',
                'Objetos filosóficos abstratos sem contexto de comida (balanças, ampulhetas, tigelas em hastes)',
                'Terrorismo nutricional ou tom de julgamento',
                'Cenários gourmet ou inalcançáveis'
            ],
            visualReferenceUrls: [],
            appUiReferenceUrls: [],
            referencePrompts: FITSWAP_REFERENCE_PROMPTS,
            uiPatterns: [
                'Rounded corners 16-24px',
                'White cards',
                'Lucide outline icons 2px',
                'Simple circular illustrations'
            ]
        }
    };
}

function mergeBrandKit(profileBrandKit = {}, presetBrandKit = {}) {
    return {
        ...presetBrandKit,
        ...profileBrandKit,
        valuePillars: mergeArrayValues(profileBrandKit.valuePillars, presetBrandKit.valuePillars),
        doAlways: mergeArrayValues(profileBrandKit.doAlways, presetBrandKit.doAlways),
        neverUse: mergeArrayValues(profileBrandKit.neverUse, presetBrandKit.neverUse),
        visualReferenceUrls: mergeArrayValues(profileBrandKit.visualReferenceUrls, presetBrandKit.visualReferenceUrls),
        appUiReferenceUrls: mergeArrayValues(profileBrandKit.appUiReferenceUrls, presetBrandKit.appUiReferenceUrls),
        referencePrompts: mergeArrayValues(profileBrandKit.referencePrompts, presetBrandKit.referencePrompts),
        uiPatterns: mergeArrayValues(profileBrandKit.uiPatterns, presetBrandKit.uiPatterns)
    };
}

export function mergeBrandProfileDefaults(profile = {}) {
    const brandKey = normalizeBrandKey(profile);
    const preset = getBrandPreset(brandKey);

    if (!preset) {
        return {
            ...profile,
            brandKey: profile.brandKey || brandKey || ''
        };
    }

    const branding = {
        ...preset.branding,
        ...(profile.branding || {})
    };

    const aiPreferences = {
        ...(preset.aiPreferences || {}),
        ...(profile.aiPreferences || {}),
        favoritePrompts: mergeFavoritePrompts(profile.aiPreferences?.favoritePrompts, preset.aiPreferences?.favoritePrompts || [])
    };

    return {
        ...preset,
        ...profile,
        brandKey,
        description: normalizeText(profile.description) || preset.description,
        brandContext: normalizeText(profile.brandContext) || preset.brandContext,
        contentStrategy: normalizeText(profile.contentStrategy) || preset.contentStrategy,
        targetAudience: normalizeText(profile.targetAudience) || preset.targetAudience,
        productService: normalizeText(profile.productService) || preset.productService,
        branding,
        aiPreferences,
        brandKit: mergeBrandKit(profile.brandKit || {}, preset.brandKit)
    };
}

export function getBrandReferenceImages(profile = {}) {
    const merged = mergeBrandProfileDefaults(profile);
    const rawBranding = profile.branding || {};
    const rawBrandKit = profile.brandKit || {};

    return uniqueStrings([
        profile.logoUrl,
        rawBranding.logoUrl,
        rawBranding.logo,
        merged.logoUrl,
        merged.branding?.logoUrl,
        merged.branding?.logo,
        ...(rawBrandKit?.visualReferenceUrls || []),
        ...(rawBrandKit?.appUiReferenceUrls || []),
        ...(merged.brandKit?.visualReferenceUrls || []),
        ...(merged.brandKit?.appUiReferenceUrls || [])
    ]);
}
