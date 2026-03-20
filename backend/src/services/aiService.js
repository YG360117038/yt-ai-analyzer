const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk").default;
const { fetchTranscript, formatTime } = require('./transcriptService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({ apiKey: process.env.CLAUDE_API_KEY }) : null;

const AI_TIMEOUT_MS = 180000;
const VIDEO_TIMEOUT_MS = 180000;
const CHANNEL_TIMEOUT_MS = 120000;

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('AI analizi zaman aşımına uğradı. Lütfen tekrar deneyin.')), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

// ==================== VIDEO ANALYSIS ====================
async function analyzeVideo(videoData, options = {}) {
    const { isPro = false, enableVideoAnalysis = false, language = 'tr' } = options;

    let transcript = null;
    try {
        transcript = await fetchTranscript(videoData.videoId);
        if (transcript) {
            console.log(`Transcript fetched: ${transcript.segments.length} segments, ${transcript.fullText.length} chars`);
        }
    } catch (e) {
        console.warn("Transcript fetch error:", e.message);
    }

    if (isPro && enableVideoAnalysis && process.env.VIDEO_ANALYSIS_ENABLED === 'true') {
        try {
            const result = await analyzeWithVideoUnderstanding(videoData, transcript, language);
            if (result) {
                result._analysisType = 'video';
                return result;
            }
        } catch (e) {
            console.error("Video analysis failed, falling back to text:", e.message);
        }
    }

    const prompt = buildPrompt(videoData, transcript, language);

    // Run Gemini (structured JSON) and Claude creative in parallel when both available
    let geminiResult = null;
    let claudeCreativeResult = null;

    const parallelTasks = [];

    parallelTasks.push(
        analyzeWithGemini(prompt).then(r => { geminiResult = r; }).catch(e => {
            console.error("Gemini failed:", e.message);
        })
    );

    if (anthropic && isPro) {
        parallelTasks.push(
            analyzeWithClaudeCreative(videoData, transcript, language).then(r => { claudeCreativeResult = r; }).catch(e => {
                console.warn("Claude creative failed (non-fatal):", e.message);
            })
        );
    }

    await Promise.allSettled(parallelTasks);

    if (geminiResult) {
        geminiResult._analysisType = transcript ? 'transcript' : 'metadata';
        // Merge Claude creative enhancements if available
        if (claudeCreativeResult) {
            geminiResult.claude_creative = claudeCreativeResult;
        }
        return geminiResult;
    }

    // Fallback: Claude for full structural analysis
    if (anthropic) {
        try {
            const result = await analyzeWithClaude(prompt);
            if (result) {
                result._analysisType = transcript ? 'transcript' : 'metadata';
                return result;
            }
        } catch (e) {
            console.error("Claude failed:", e.message);
        }
    }

    throw new Error("AI analizi başarısız oldu. Lütfen tekrar deneyin.");
}

// ==================== CHANNEL ANALYSIS ====================
async function analyzeChannel(channelData, options = {}) {
    const { language = 'tr' } = options;
    const { channelName, videos } = channelData;

    const isEnglish = language === 'en';

    const videosText = (videos || []).slice(0, 20).map((v, i) =>
        `${i + 1}. "${v.title}" - ${v.viewCount || 'N/A'} views - ${v.publishDate || 'N/A'} - ${v.duration || 'N/A'}`
    ).join('\n');

    const responseLanguage = isEnglish
        ? 'Respond in ENGLISH. Give specific, data-driven insights based on the video list provided.'
        : 'TÜRKÇE yanıt ver. Video listesine dayanarak spesifik, veri odaklı içgörüler sun.';

    const prompt = `You are an elite YouTube channel strategist and growth hacker. Your job is to reverse-engineer what makes this channel succeed and build an actionable growth system.

CHANNEL: ${channelName}
VIDEO COUNT: ${(videos || []).length}

VIDEO LIST:
${videosText}

OUTPUT: Valid JSON only — no markdown, no extra text.

{
    "channel_health_score": {
        "overall": 75,
        "consistency": 80,
        "growth_potential": 70,
        "content_diversity": 65,
        "verdict": "Kısa kanal değerlendirmesi"
    },
    "performance_patterns": {
        "best_performing_topics": ["En iyi performans gösteren konu 1", "konu 2", "konu 3"],
        "underperforming_topics": ["Düşük performanslı konu 1", "konu 2"],
        "viral_formula": "Bu kanala özel viral içerik formülü",
        "title_patterns": ["Başarılı başlık kalıbı 1", "kalıp 2", "kalıp 3"],
        "optimal_duration": "Bu kanal için ideal video süresi"
    },
    "content_gaps": [
        {"topic": "İçerik boşluğu 1", "opportunity": "Neden fırsat var", "estimated_views": "Tahmini görüntüleme potansiyeli"},
        {"topic": "Boşluk 2", "opportunity": "...", "estimated_views": "..."},
        {"topic": "Boşluk 3", "opportunity": "...", "estimated_views": "..."}
    ],
    "optimal_posting_schedule": {
        "frequency": "Önerilen yayın sıklığı (örn: haftada 2)",
        "best_days": ["Pazartesi", "Perşembe"],
        "best_hours": "Yayın için ideal saat aralığı",
        "reasoning": "Bu zamanlamanın nedeni"
    },
    "audience_insights": {
        "core_demographic": "Ana izleyici profili",
        "interests": ["İlgi alanı 1", "ilgi 2", "ilgi 3"],
        "engagement_style": "İzleyicilerin içerikle nasıl etkileşime girdiği",
        "retention_triggers": ["Tutma faktörü 1", "faktör 2"]
    },
    "competitor_positioning": {
        "niche": "Kanalın niş konumu",
        "unique_angle": "Rakiplerden farklılaşma noktası",
        "market_saturation": "low",
        "blue_ocean_opportunities": ["Henüz keşfedilmemiş fırsat 1", "fırsat 2"]
    },
    "growth_strategy": {
        "short_term": ["30 günlük aksiyon 1", "aksiyon 2", "aksiyon 3"],
        "long_term": ["6 aylık strateji 1", "strateji 2"],
        "collaboration_ideas": ["İşbirliği fikri 1", "fikir 2"],
        "monetization_opportunities": ["Para kazanma fırsatı 1", "fırsat 2"]
    },
    "channel_strategy": {
        "channel_dna": "Kanalın DNA'sı: stil, ton, format tek paragraf",
        "best_patterns": ["En iyi performans gösteren kalıp 1", "kalıp 2", "kalıp 3"],
        "content_gaps": ["İçerik boşluğu 1", "boşluk 2", "boşluk 3"],
        "double_down": ["Üzerine basılması gereken konu 1", "konu 2"],
        "channel_formula": "Hook → X → Y → Payoff → CTA formatında kanal formülü",
        "growth_plan": {
            "7_days": "Bu hafta yapılacak 3 aksiyon",
            "30_days": "Bu ay yapılacaklar",
            "90_days": "3 aylık strateji"
        },
        "next_5_videos": [
            {"title": "Video başlığı", "why": "Neden şimdi çekilmeli", "expected_ctr": 85, "format": "tutorial"},
            {"title": "Video başlığı 2", "why": "Neden şimdi çekilmeli", "expected_ctr": 80, "format": "vlog"},
            {"title": "Video başlığı 3", "why": "Neden şimdi çekilmeli", "expected_ctr": 75, "format": "reaction"},
            {"title": "Video başlığı 4", "why": "Neden şimdi çekilmeli", "expected_ctr": 70, "format": "tutorial"},
            {"title": "Video başlığı 5", "why": "Neden şimdi çekilmeli", "expected_ctr": 65, "format": "vlog"}
        ]
    }
}

${responseLanguage}
All numeric scores must be integers. JSON only, no extra text.`;

    // Kanal analizi için daha yüksek token limiti olan özel model
    try {
        const result = await analyzeWithGeminiChannel(prompt);
        if (result) return result;
    } catch (e) {
        console.error("Gemini channel analysis failed:", e.message);
    }

    if (anthropic) {
        try {
            const result = await analyzeWithClaudeChannel(prompt);
            if (result) return result;
        } catch (e) {
            console.error("Claude channel analysis failed:", e.message);
        }
    }

    throw new Error("Kanal analizi başarısız oldu.");
}

// ==================== CLAUDE CREATIVE (parallel creative enhancement) ====================
async function analyzeWithClaudeCreative(videoData, transcript, language = 'tr') {
    if (!anthropic) return null;
    const isEnglish = language === 'en';

    const transcriptExcerpt = transcript
        ? transcript.fullText.substring(0, 8000)
        : '';

    const prompt = `${isEnglish
        ? 'You are a world-class creative writing expert and YouTube content strategist.'
        : 'Sen dünya standartlarında bir yaratıcı yazarlık uzmanı ve YouTube içerik stratejistisin.'
    }

VIDEO: "${videoData.title}"
KANAL: ${videoData.channelName}
${transcriptExcerpt ? `TRANSCRIPT:\n${transcriptExcerpt}` : ''}

${isEnglish
    ? 'Generate highly creative, compelling content enhancements. Be specific, punchy, and original.'
    : 'Çok yaratıcı, etkileyici içerik geliştirmeleri oluştur. Spesifik, çarpıcı ve özgün ol.'
}

ÇIKTI FORMATI: JSON

{
    "power_hooks": [
        {"hook": "Güçlü açılış hook 1 (ilk 3 saniye için)", "psychology": "Hangi psikolojiyi kullanıyor"},
        {"hook": "Hook 2", "psychology": "..."},
        {"hook": "Hook 3", "psychology": "..."}
    ],
    "rewritten_title_options": [
        {"title": "Yeniden yazılmış başlık 1", "ctr_boost": "CTR artış nedeni", "emotion": "Tetiklediği duygu"},
        {"title": "Başlık 2", "ctr_boost": "...", "emotion": "..."},
        {"title": "Başlık 3", "ctr_boost": "...", "emotion": "..."}
    ],
    "storytelling_upgrade": {
        "improved_opening": "İyileştirilmiş açılış paragrafı (en az 3 cümle)",
        "tension_points": ["Gerilim noktası 1 (izleyiciyi tutar)", "nokta 2"],
        "closing_impact": "Güçlü kapanış önerisi"
    },
    "viral_thumbnail_concepts": [
        {"concept": "Thumbnail konsepti 1", "elements": ["Element 1", "element 2"], "color_scheme": "Renk paleti"},
        {"concept": "Konsept 2", "elements": ["..."], "color_scheme": "..."}
    ],
    "ab_test_titles": [
        {"version_a": "A versiyonu başlık", "version_b": "B versiyonu başlık", "test_hypothesis": "Hangi versiyonun neden daha iyi performans göstereceği tahmini"}
    ]
}

${isEnglish ? 'Respond in ENGLISH.' : 'TÜRKÇE yanıt ver.'}
JSON only, no extra text.`;

    try {
        const message = await withTimeout(
            anthropic.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }]
            }),
            60000
        );

        const text = message.content?.[0]?.text;
        if (!text) return null;

        return parseAIResponse(text);
    } catch (e) {
        if (e.message && e.message.includes('credit balance')) {
            console.warn('Claude kredisi yetersiz - creative skip.');
            return null;
        }
        console.warn("Claude creative error:", e.message);
        return null;
    }
}

// ==================== VIDEO UNDERSTANDING (PRO) ====================
async function analyzeWithVideoUnderstanding(videoData, transcript, language = 'tr') {
    const videoService = require('./videoService');

    if (!videoService.isAvailable()) throw new Error('Video analysis not enabled');
    if (!videoService.acquireSlot()) throw new Error('Video analysis busy, falling back to text');

    let localPath = null;
    let geminiFile = null;

    try {
        console.log(`Downloading video: ${videoData.videoId}`);
        localPath = await videoService.downloadVideo(videoData.videoId);

        console.log('Uploading to Gemini File API...');
        geminiFile = await videoService.uploadToGemini(localPath);

        const textPrompt = buildPrompt(videoData, transcript, language) + `

ONEMLI: Bu analiz icin video dosyasi eklenmistir. Videoyu IZLE ve analizini GERCEK gorsel icerige dayandir.
- hook_structure.first_5_seconds: Videonun gercek ilk 5 saniyesini anlat
- audience_retention_heatmap: Videonun gorsel/icerik akisina gore gercekci retention tahmini yap
- style_and_tone: Konusmacinin ses tonu, yuz ifadeleri ve beden dilini analiz et
- storytelling_framework: Videonun gercek senaryosunu transkript ve goruntulerden cikar
- storyboard: Videonun gercek sahnelerini baz alarak olustur`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.4,
                maxOutputTokens: 65536,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        const result = await withTimeout(
            model.generateContent([
                { fileData: { mimeType: geminiFile.mimeType, fileUri: geminiFile.uri } },
                { text: textPrompt }
            ]),
            VIDEO_TIMEOUT_MS
        );

        const response = await result.response;
        const text = response.text();
        const parsed = parseAIResponse(text);
        if (parsed) {
            console.log('Video analysis completed successfully');
            return parsed;
        }
        return null;

    } finally {
        videoService.releaseSlot();
        videoService.cleanup(localPath, geminiFile?.name).catch(() => {});
    }
}

// ==================== GEMINI ====================
// ==================== GEMINI CHANNEL (daha yüksek token, tek deneme) ====================
async function analyzeWithGeminiChannel(prompt) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget: 0 }
        }
    });

    try {
        const result = await withTimeout(model.generateContent(prompt), CHANNEL_TIMEOUT_MS);
        const response = await result.response;
        const text = response.text();
        const finishReason = result.response.candidates?.[0]?.finishReason;
        console.log(`Gemini channel: finishReason=${finishReason}, length=${text?.length || 0}`);
        if (!text || text.length < 100) return null;
        return parseAIResponse(text);
    } catch (e) {
        console.error('Gemini channel error:', e.message);
        return null;
    }
}

// ==================== CLAUDE CHANNEL (yüksek token) ====================
async function analyzeWithClaudeChannel(prompt) {
    try {
        const message = await withTimeout(
            anthropic.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 16000,
                messages: [{
                    role: "user",
                    content: prompt + "\n\nONEMLI: Sadece JSON ver, markdown kullanma."
                }]
            }),
            CHANNEL_TIMEOUT_MS
        );
        const text = message.content?.[0]?.text;
        if (!text) return null;
        return parseAIResponse(text);
    } catch (e) {
        console.error('Claude channel error:', e.message);
        if (e.message?.includes('credit balance')) return null;
        return null;
    }
}

// ==================== GEMINI (video analizi) ====================
async function analyzeWithGemini(prompt) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
            maxOutputTokens: 24576,
            thinkingConfig: { thinkingBudget: 0 }
        }
    });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            if (attempt > 0) console.log(`Gemini retry ${attempt}...`);

            const result = await withTimeout(model.generateContent(prompt), AI_TIMEOUT_MS);
            const response = await result.response;
            const text = response.text();

            const candidate = result.response.candidates?.[0];
            const finishReason = candidate?.finishReason;
            console.log(`Gemini attempt ${attempt + 1}: finishReason=${finishReason}, responseLength=${text?.length || 0}`);

            if (finishReason === 'MAX_TOKENS') {
                console.warn('Gemini yanit kesildi (MAX_TOKENS) - truncated recovery denenecek');
            }

            if (!text || text.length < 100) {
                console.error(`Gemini bos/kisa yanit: "${(text || '').substring(0, 200)}"`);
                if (attempt === 0) continue;
            }

            const parsed = parseAIResponse(text);
            if (parsed) return parsed;

            console.error(`Gemini JSON parse basarisiz. Basi: ${text.substring(0, 500)}`);
            console.error(`Gemini JSON parse basarisiz. Sonu: ${text.substring(text.length - 500)}`);

            if (attempt === 0) continue;
        } catch (e) {
            console.error(`Gemini attempt ${attempt + 1}:`, e.message);
            if (e.status) console.error(`Gemini HTTP status: ${e.status}`);
            if (e.errorDetails) console.error(`Gemini details:`, JSON.stringify(e.errorDetails));
        }
    }
    return null;
}

// ==================== CLAUDE (fallback structural analysis) ====================
async function analyzeWithClaude(prompt) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            if (attempt > 0) console.log(`Claude retry ${attempt}...`);

            const message = await withTimeout(
                anthropic.messages.create({
                    model: "claude-sonnet-4-6",
                    max_tokens: 16000,
                    messages: [{
                        role: "user",
                        content: prompt + "\n\nONEMLI: Sadece JSON ciktisi ver, baska hicbir sey yazma. Markdown code block kullanma."
                    }]
                }),
                AI_TIMEOUT_MS
            );

            const text = message.content?.[0]?.text;
            if (!text) {
                if (attempt === 0) continue;
                throw new Error("Claude bos yanit dondurdu");
            }

            const parsed = parseAIResponse(text);
            if (parsed) return parsed;

            if (attempt === 0) continue;
        } catch (e) {
            console.error(`Claude attempt ${attempt + 1}:`, e.message);
            if (e.message && e.message.includes('credit balance')) {
                console.error('Claude kredisi yetersiz - fallback atlanıyor.');
                return null;
            }
            if (attempt === 1) throw e;
        }
    }
    return null;
}

// ==================== PROMPT ====================
function buildPrompt(videoData, transcript = null, language = 'tr') {
    const isEnglish = language === 'en';
    let transcriptSection = '';
    if (transcript) {
        const truncated = transcript.fullText.substring(0, 15000);
        const timestamped = transcript.segments.slice(0, 60).map(s =>
            `[${formatTime(s.start)}] ${s.text}`
        ).join('\n');

        transcriptSection = `

VIDEO TRANSCRIPT:
${truncated}${transcript.fullText.length > 15000 ? '\n... (truncated)' : ''}

TIMESTAMPED TRANSCRIPT:
${timestamped}`;
    }

    const transcriptNote = transcript
        ? 'TRANSCRIPT AVAILABLE: Base hook_analysis.first_10_seconds, script_extraction, clone_this_video.scene_plan voiceovers on ACTUAL speech. Do not guess.'
        : 'NO TRANSCRIPT: Use metadata + your strategic expertise to fill all fields.';

    const responseLanguage = isEnglish
        ? 'Respond in ENGLISH. ai_video_prompt fields must always be in English.'
        : 'TÜRKÇE yanıt ver. ai_video_prompt alanları her zaman İngilizce olmalı.';

    return `You are an elite YouTube growth strategist, content reverse-engineering expert, and AI video production architect.

Your job is NOT to just analyze videos. Your job is to extract the SUCCESS SYSTEM behind YouTube videos and help creators CLONE and SCALE it.

RULES:
- Be concise but powerful
- No long essays, no generic advice
- Always actionable
- Think like a YouTube strategist, not a teacher
- Focus on RESULTS, not explanations
- The "clone_this_video" section is THE MOST IMPORTANT — make it feel like "here is your next video ready to produce"

${transcriptNote}

VIDEO DATA:
Title: ${videoData.title}
Description: ${videoData.description}
Channel: ${videoData.channelName}
Views: ${videoData.viewCount || 'Unknown'}
Published: ${videoData.publishDate || 'Unknown'}
Likes: ${videoData.likeCount || 'Unknown'}
Subscribers: ${videoData.subscriberCount || 'Unknown'}
Duration: ${videoData.duration || 'Unknown'}
Comments: ${(videoData.comments || []).join(' | ')}
Tags: ${(videoData.tags || []).join(', ')}
Hashtags: ${(videoData.hashtags || []).join(', ')}
URL: ${videoData.url || ''}
${transcriptSection}

OUTPUT: Valid JSON matching EXACTLY this schema (no extra keys, no markdown, no explanation):

{
  "viral_score": {
    "score": 85,
    "ctr_potential": 80,
    "retention_potential": 75,
    "growth_potential": 90,
    "why": "Kısa açıklama neden bu skoru aldı"
  },
  "hook_analysis": {
    "type": "curiosity | shock | story | promise | controversy | question",
    "why_it_works": "Neden işe yaradığının özlü açıklaması",
    "first_10_seconds": "İlk 10 saniyede tam olarak ne oluyor"
  },
  "video_structure": {
    "hook": "Hook bölümü özeti",
    "setup": "Setup bölümü özeti",
    "buildup": "Buildup bölümü özeti",
    "payoff": "Payoff bölümü özeti",
    "cta": "CTA bölümü özeti"
  },
  "viral_patterns": [
    "Pattern 1: açıklaması",
    "Pattern 2: açıklaması",
    "Pattern 3: açıklaması"
  ],
  "title_thumbnail": {
    "why_title_works": "Başlığın neden çalıştığı",
    "ctr_angle": "CTR açısı (merak/korku/fayda vs.)",
    "thumbnail_psychology": "Thumbnail psikolojisi",
    "improved_titles": [
      {"title": "Geliştirilmiş başlık 1", "ctr_score": 88, "angle": "merak boşluğu"},
      {"title": "Başlık 2", "ctr_score": 82, "angle": "korku"},
      {"title": "Başlık 3", "ctr_score": 79, "angle": "fayda"},
      {"title": "Başlık 4", "ctr_score": 75, "angle": "şok"},
      {"title": "Başlık 5", "ctr_score": 71, "angle": "hikaye"}
    ],
    "thumbnail_text_ideas": ["Metin 1", "Metin 2", "Metin 3", "Metin 4", "Metin 5"]
  },
  "script_extraction": {
    "opening": "Açılış bölümü yeniden yapılandırması",
    "key_points": ["Ana nokta 1", "Ana nokta 2", "Ana nokta 3"],
    "ending": "Kapanış bölümü yeniden yapılandırması"
  },
  "clone_this_video": {
    "new_video_idea": "Aynı format, farklı açıdan yeni video fikri",
    "full_hook": "Tam hook metni — hemen kullanılabilir, çarpıcı ve spesifik",
    "script_outline": "Tam senaryo taslağı bölümler halinde: Giriş → Setup → Buildup → Payoff → CTA",
    "scene_plan": [
      {
        "scene": 1,
        "time": "0:00-0:15",
        "description": "Sahne açıklaması",
        "voiceover": "Tam seslendirme metni (Türkçe)",
        "ai_video_prompt": "Cinematic shot description for Runway/Sora (EN, detailed: lighting, camera, motion, style)"
      },
      {
        "scene": 2,
        "time": "0:15-0:45",
        "description": "Sahne açıklaması",
        "voiceover": "Seslendirme metni",
        "ai_video_prompt": "AI video prompt EN"
      },
      {
        "scene": 3,
        "time": "0:45-1:30",
        "description": "Sahne açıklaması",
        "voiceover": "Seslendirme metni",
        "ai_video_prompt": "AI video prompt EN"
      },
      {
        "scene": 4,
        "time": "1:30-2:30",
        "description": "Sahne açıklaması",
        "voiceover": "Seslendirme metni",
        "ai_video_prompt": "AI video prompt EN"
      },
      {
        "scene": 5,
        "time": "2:30-3:30",
        "description": "Sahne açıklaması",
        "voiceover": "Seslendirme metni",
        "ai_video_prompt": "AI video prompt EN"
      }
    ],
    "seo_tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]
  },
  "content_factory": {
    "video_ideas": [
      {"title": "Video fikri 1", "hook": "Hook metni — ilk 3 saniye", "why": "Neden viral olur"},
      {"title": "Video fikri 2", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 3", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 4", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 5", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 6", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 7", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 8", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 9", "hook": "Hook metni", "why": "Neden viral olur"},
      {"title": "Video fikri 10", "hook": "Hook metni", "why": "Neden viral olur"}
    ],
    "high_ctr_titles": [
      {"title": "Yüksek CTR başlık 1", "ctr_score": 90},
      {"title": "Başlık 2", "ctr_score": 87},
      {"title": "Başlık 3", "ctr_score": 84},
      {"title": "Başlık 4", "ctr_score": 80},
      {"title": "Başlık 5", "ctr_score": 76}
    ]
  },
  "shorts_opportunities": [
    {
      "title": "Short video başlığı",
      "timestamp": "2:30",
      "duration": "45s",
      "hook": "Short için hook metni",
      "why": "Neden viral olur"
    },
    {"title": "Short 2", "timestamp": "0:45", "duration": "30s", "hook": "Hook metni", "why": "Neden viral olur"},
    {"title": "Short 3", "timestamp": "4:10", "duration": "55s", "hook": "Hook metni", "why": "Neden viral olur"}
  ],
  "monetization": {
    "how_it_makes_money": "Bu videonun para kazanma mekanizması",
    "strategies": ["Strateji 1", "Strateji 2", "Strateji 3"],
    "best_cta": "En etkili CTA önerisi"
  }
}

CRITICAL RULES:
- ${responseLanguage}
- clone_this_video.full_hook must be READY TO USE — specific, punchy, no placeholders
- clone_this_video.scene_plan must have exactly 5 scenes with real voiceover text
- ai_video_prompt fields: detailed EN description (camera angle, lighting, motion, style, mood, 4K cinematic quality)
- content_factory.video_ideas must have exactly 10 ideas, each with a real hook sentence
- All numeric scores must be integers (not strings)
- viral_patterns must have at least 3 specific patterns observed in this video
- JSON only — no markdown, no extra text outside the JSON object
`;
}

// ==================== JSON PARSER ====================
function parseAIResponse(text) {
    if (!text || typeof text !== 'string') return null;

    try {
        const result = JSON.parse(text);
        if (result && typeof result === 'object' && (result.viral_score || result.video_score || result.channel_health_score || result.power_hooks || result.overall)) return result;
    } catch (e) {}

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    let jsonString = text.substring(firstBrace);

    jsonString = jsonString
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        .replace(/\t/g, '    ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    jsonString = jsonString.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
        return match.replace(/\n/g, '\\n').replace(/\r/g, '');
    });

    try {
        const result = JSON.parse(jsonString);
        if (result && typeof result === 'object') return result;
    } catch (e) {}

    let cleaned = jsonString.replace(/,(\s*[\]\}])/g, '$1');
    try {
        const result = JSON.parse(cleaned);
        if (result && typeof result === 'object') return result;
    } catch (e) {}

    try {
        let truncated = cleaned;
        truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*("([^"\\]|\\.)*)?$/, '');
        truncated = truncated.replace(/,\s*"[^"]*$/, '');
        truncated = truncated.replace(/,\s*$/, '');

        let opens = 0, openBrackets = 0;
        let inString = false, escape = false;
        for (let i = 0; i < truncated.length; i++) {
            const c = truncated[i];
            if (escape) { escape = false; continue; }
            if (c === '\\' && inString) { escape = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') opens++;
            if (c === '}') opens--;
            if (c === '[') openBrackets++;
            if (c === ']') openBrackets--;
        }

        if (inString) truncated += '"';
        truncated = truncated.replace(/,(\s*)$/, '$1');
        for (let i = 0; i < openBrackets; i++) truncated += ']';
        for (let i = 0; i < opens; i++) truncated += '}';

        const result = JSON.parse(truncated);
        if (result && typeof result === 'object' && (result.viral_score || result.video_score || result.channel_health_score || result.overall)) {
            console.warn(`JSON truncation recovered - ${Object.keys(result).length} keys found`);
            return result;
        }
    } catch (e) {}

    try {
        const lines = cleaned.split('\n');
        for (let removeCount = 1; removeCount < Math.min(lines.length, 50); removeCount++) {
            let partial = lines.slice(0, lines.length - removeCount).join('\n');
            partial = partial.replace(/,\s*$/, '');
            let opens = 0, openBrackets = 0;
            let inStr = false, esc = false;
            for (let i = 0; i < partial.length; i++) {
                const c = partial[i];
                if (esc) { esc = false; continue; }
                if (c === '\\' && inStr) { esc = true; continue; }
                if (c === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (c === '{') opens++;
                if (c === '}') opens--;
                if (c === '[') openBrackets++;
                if (c === ']') openBrackets--;
            }
            if (inStr) partial += '"';
            for (let i = 0; i < openBrackets; i++) partial += ']';
            for (let i = 0; i < opens; i++) partial += '}';

            try {
                const result = JSON.parse(partial);
                if (result && typeof result === 'object' && (result.viral_score || result.video_score || result.channel_health_score)) {
                    console.warn(`JSON line-removal recovered (removed ${removeCount} lines) - ${Object.keys(result).length} keys`);
                    return result;
                }
            } catch (e2) { continue; }
        }
    } catch (e) {}

    console.error("JSON parse basarisiz - tum denemeler tukendi");
    return null;
}

module.exports = { analyzeVideo, analyzeChannel };
