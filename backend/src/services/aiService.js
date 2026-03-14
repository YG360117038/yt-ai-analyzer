const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk").default;
const { fetchTranscript, formatTime } = require('./transcriptService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({ apiKey: process.env.CLAUDE_API_KEY }) : null;

const AI_TIMEOUT_MS = 180000; // 180 saniye
const VIDEO_TIMEOUT_MS = 180000; // 180 saniye (video analizi icin)

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('AI analizi zaman aşımına uğradı. Lütfen tekrar deneyin.')), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

async function analyzeVideo(videoData, options = {}) {
    const { isPro = false, enableVideoAnalysis = false, language = 'tr' } = options;

    // 1. Transcript cek (tum kullanicilar)
    let transcript = null;
    try {
        transcript = await fetchTranscript(videoData.videoId);
        if (transcript) {
            console.log(`Transcript fetched: ${transcript.segments.length} segments, ${transcript.fullText.length} chars`);
        }
    } catch (e) {
        console.warn("Transcript fetch error:", e.message);
    }

    // 2. Pro kullanicilar icin video analizi (Gemini File API)
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

    // 3. Metin analizi (transcript ile zenginlestirilmis)
    const prompt = buildPrompt(videoData, transcript, language);

    try {
        const result = await analyzeWithGemini(prompt);
        if (result) {
            result._analysisType = transcript ? 'transcript' : 'metadata';
            return result;
        }
    } catch (e) {
        console.error("Gemini failed:", e.message);
    }

    // 4. Claude fallback
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

// ==================== VIDEO UNDERSTANDING (PRO) ====================
async function analyzeWithVideoUnderstanding(videoData, transcript, language = 'tr') {
    const videoService = require('./videoService');

    if (!videoService.isAvailable()) {
        throw new Error('Video analysis not enabled');
    }
    if (!videoService.acquireSlot()) {
        throw new Error('Video analysis busy, falling back to text');
    }

    let localPath = null;
    let geminiFile = null;

    try {
        // 1. Video indir
        console.log(`Downloading video: ${videoData.videoId}`);
        localPath = await videoService.downloadVideo(videoData.videoId);

        // 2. Gemini'ye yukle
        console.log('Uploading to Gemini File API...');
        geminiFile = await videoService.uploadToGemini(localPath);

        // 3. Multimodal prompt olustur
        const textPrompt = buildPrompt(videoData, transcript, language) + `

    ONEMLI: Bu analiz icin video dosyasi eklenmistir. Videoyu IZLE ve analizini GERCEK gorsel icerige dayandir.
    - hook_structure.first_5_seconds: Videonun gercek ilk 5 saniyesini anlat
    - audience_retention_heatmap: Videonun gorsel/icerik akisina gore gercekci retention tahmini yap
    - tone_analysis: Konusmacinin ses tonu, yuz ifadeleri ve beden dilini analiz et
    - script_reverse_engineering: Videonun gercek senaryosunu transkript ve goruntulerden cikar
    - storyboard: Videonun gercek sahnelerini baz alarak olustur
    - content_style_breakdown: Gercek duzenleme stili, gecisler, efektler, grafikleri analiz et`;

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
                {
                    fileData: {
                        mimeType: geminiFile.mimeType,
                        fileUri: geminiFile.uri
                    }
                },
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
async function analyzeWithGemini(prompt) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
            maxOutputTokens: 65536,
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

            // Parse basarisiz - ilk 500 ve son 500 karakteri logla
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

// ==================== CLAUDE ====================
async function analyzeWithClaude(prompt) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            if (attempt > 0) console.log(`Claude retry ${attempt}...`);

            const message = await withTimeout(
                anthropic.messages.create({
                    model: "claude-sonnet-4-20250514",
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
        ).join('\n    ');

        transcriptSection = `

    VIDEO TRANSCRIPT (konusma metni):
    ${truncated}${transcript.fullText.length > 15000 ? '\n    ... (devami kirpildi)' : ''}

    ZAMANA GORE TRANSCRIPT:
    ${timestamped}`;
    }

    const transcriptNote = transcript
        ? (isEnglish
            ? 'NOTE: Video transcript is available. Base your analysis on the transcript - extract first 5 seconds, hook analysis, script reverse engineering, retention strategy from ACTUAL speech content, do not guess.'
            : 'NOT: Video transkripti mevcut. Analizi transkripte dayanarak yap - ilk 5 saniye, hook analizi, senaryo tersine muhendisligi, retention stratejisi gibi alanlari GERCEK konusma iceriginden cikar, tahmin yapma.')
        : (isEnglish
            ? 'NOTE: Transcript is not available. Base your analysis on metadata with your best estimates.'
            : 'NOT: Transkript mevcut degil. Analizi metadata\'ya dayanarak en iyi tahminlerinle yap.');

    return `
    ${isEnglish
        ? 'You are the world\'s best YouTube content strategist and AI prompt engineer.\n    Deeply analyze the following YouTube video data and prepare a comprehensive strategy report.'
        : 'Sen dünyanın en iyi YouTube içerik stratejisti ve AI prompt mühendisisin.\n    Aşağıdaki YouTube video verilerini derinlemesine analiz et ve kapsamlı bir strateji raporu hazırla.'}

    ${transcriptNote}

    VIDEO VERİLERİ:
    Başlık: ${videoData.title}
    Açıklama: ${videoData.description}
    Kanal: ${videoData.channelName}
    Görüntülenme: ${videoData.viewCount || "Bilinmiyor"}
    Yayın Tarihi: ${videoData.publishDate || "Bilinmiyor"}
    Beğeni Sayısı: ${videoData.likeCount || "Bilinmiyor"}
    Abone Sayısı: ${videoData.subscriberCount || "Bilinmiyor"}
    Video Süresi: ${videoData.duration || "Bilinmiyor"}
    Yorumlar: ${(videoData.comments || []).join(" | ")}
    Etiketler: ${(videoData.tags || []).join(", ")}
    Hashtag'ler: ${(videoData.hashtags || []).join(", ")}
    URL: ${videoData.url || ""}
    ${transcriptSection}

    ÇIKTI FORMATI: JSON (aşağıdaki yapıya kesinlikle uy)

    {
        "video_score": {
            "overall_score": "(0-100 puan)",
            "seo_score": "(0-100)",
            "engagement_score": "(0-100)",
            "viral_potential": "(0-100)",
            "content_quality": "(0-100)",
            "verdict": "Kısa bir değerlendirme cümlesi"
        },

        "content_style_breakdown": "İçerik tarzının detaylı analizi (anlatım biçimi, düzenleme stili, pacing)",
        "psychological_triggers": ["Kullanılan psikolojik tetikleyici 1", "tetikleyici 2", "..."],
        "hook_structure": {
            "type": "Hook tipi (soru, şok, merak boşluğu vs.)",
            "analysis": "Hook'un neden işe yaradığının detaylı açıklaması",
            "first_5_seconds": "İlk 5 saniyede ne oluyor (tahmin)"
        },
        "retention_strategy": "İzleyici tutma stratejisinin detaylı analizi",
        "thumbnail_psychology": {
            "analysis": "Küçük resim psikolojisi analizi",
            "improvement_tips": ["İyileştirme önerisi 1", "öneri 2"]
        },
        "target_audience": {
            "demographics": "Yaş, cinsiyet, ilgi alanları",
            "psychographics": "Motivasyonlar, acı noktaları, istekler",
            "viewer_intent": "İzleyici bu videoyu neden açtı"
        },
        "tone_analysis": "Ton ve yazı stili analizi (resmi/samimi, enerjik/sakin vs.)",
        "script_reverse_engineering": "Videonun senaryo yapısının tersine mühendisliği",
        "cta_strategy": "CTA stratejisi analizi",

        "competitor_analysis": {
            "niche_positioning": "Bu video niş içinde nasıl konumlanıyor",
            "differentiation": "Rakiplerden farkı ne",
            "market_gap": "Hangi boşluğu dolduruyor"
        },

        "comment_sentiment": {
            "overall_mood": "Genel yorum duygu analizi (pozitif/negatif/nötr)",
            "top_themes": ["Yorumlarda öne çıkan tema 1", "tema 2", "tema 3"],
            "audience_questions": ["İzleyicilerin sorduğu/merak ettiği konu 1", "konu 2"],
            "content_ideas_from_comments": ["Yorumlardan çıkarılabilecek yeni video fikri 1", "fikir 2"]
        },

        "video_flow_mermaid": "graph TD yapısında Mermaid.js grafik kodu (videonun akışını gösteren)",

        "deep_digest_summary": {
            "key_takeaways": ["En önemli ders 1", "ders 2", "ders 3", "ders 4", "ders 5"],
            "action_plan": ["Aksiyon adımı 1", "adım 2", "adım 3"],
            "one_sentence_summary": "Videoyu tek cümleyle özetle"
        },

        "notebook_podcast_script": "Videoyu bir sunucu ve bir uzman arasında geçen 2 dakikalık doğal bir podcast tartışması senaryosu. Her konuşmacı satırı 'Sunucu:' veya 'Uzman:' ile başlasın.",

        "audience_retention_heatmap": [85, 90, 88, 75, 70, 65, 60, 72, 80, 85, 78, 65, 55, 60, 70, 82, 90, 95, 88, 75],

        "similar_video_prompts": [
            "Bu videoyla benzer ama farklı açıdan bir video prompt'u 1",
            "prompt 2", "prompt 3", "prompt 4", "prompt 5"
        ],
        "viral_hook_prompts": [
            "Viral potansiyeli yüksek giriş prompt'u 1",
            "prompt 2", "prompt 3", "prompt 4", "prompt 5"
        ],
        "title_variations": [
            "Alternatif başlık 1", "başlık 2", "başlık 3", "başlık 4", "başlık 5"
        ],
        "seo_descriptions": [
            "SEO uyumlu açıklama 1", "açıklama 2", "açıklama 3"
        ],
        "high_ctr_titles": [
            "Yüksek tıklama oranlı başlık 1", "başlık 2", "başlık 3", "başlık 4", "başlık 5",
            "başlık 6", "başlık 7", "başlık 8", "başlık 9", "başlık 10"
        ],
        "thumbnail_text_ideas": [
            "Thumbnail metin fikri 1", "fikir 2", "fikir 3", "fikir 4", "fikir 5",
            "fikir 6", "fikir 7", "fikir 8", "fikir 9", "fikir 10"
        ],
        "seo_tags": ["önerilen tag 1", "tag 2", "tag 3", "tag 4", "tag 5", "tag 6", "tag 7", "tag 8", "tag 9", "tag 10", "tag 11", "tag 12", "tag 13", "tag 14", "tag 15"],

        "full_script_template": "Bu videonun tarzında yazılmış tam bir senaryo şablonu (giriş, gelişme, sonuç bölümleri ile)",
        "hook_variations": [
            "Alternatif giriş hook'u 1", "hook 2", "hook 3", "hook 4", "hook 5"
        ],
        "storytelling_framework": {
            "structure": "Kullanılan hikaye anlatım yapısı",
            "hero": "Ana karakter/konu",
            "conflict": "Problem/çatışma",
            "resolution": "Çözüm",
            "template": "Bu framework'ü kullanarak yeni bir video için şablon"
        },

        "aggressive_sales": "Bu videonun içeriğini agresif satış tonuyla yeniden yazılmış versiyonu (kısa paragraf)",
        "calm_educational": "Sakin, eğitici tonla yeniden yazılmış versiyonu",
        "documentary": "Belgesel tarzı anlatımla yazılmış versiyonu",
        "motivational": "Motivasyonel stil ile yazılmış versiyonu",
        "controversial": "Tartışmalı/provokatif stille yazılmış versiyonu",

        "ai_prompts_toolkit": {
            "chatgpt_prompts": [
                "Bu videonun konusuyla ilgili ChatGPT'ye sorulabilecek güçlü prompt 1",
                "prompt 2", "prompt 3", "prompt 4", "prompt 5"
            ],
            "midjourney_prompts": [
                "Bu video için Midjourney thumbnail prompt'u 1",
                "prompt 2", "prompt 3"
            ],
            "blog_post_prompt": "Bu videoyu blog yazısına çevirecek AI prompt'u",
            "twitter_thread_prompt": "Bu videoyu Twitter thread'ine çevirecek prompt",
            "linkedin_post_prompt": "Bu videoyu LinkedIn paylaşımına çevirecek prompt",
            "tiktok_script_prompt": "Bu videoyu kısa TikTok/Reels senaryosuna çevirecek prompt",
            "email_newsletter_prompt": "Bu videoyu email bültenine çevirecek prompt"
        },

        "content_repurpose_ideas": [
            "Bu videodan türetilebilecek içerik fikri 1 (format ve platform belirt)",
            "fikir 2", "fikir 3", "fikir 4", "fikir 5"
        ],

        "monetization_ideas": [
            "Bu içerikten para kazanma fikri 1",
            "fikir 2", "fikir 3"
        ],

        "video_production": {
            "storyboard": [
                {
                    "sahne": 1,
                    "sure": "0:00-0:10",
                    "aciklama": "Sahnenin detayli aciklamasi",
                    "kamera": "Kamera acisi ve hareketi (close-up, wide shot, dolly vs.)",
                    "ses": "Arka plan muzigi veya ses efekti",
                    "metin": "Ekranda gosterilecek metin (varsa)",
                    "ai_video_prompt": "Bu sahneyi Runway/Sora/Kling ile olusturmak icin detayli Ingilizce prompt. Ornek: Cinematic wide shot of a person walking through a neon-lit city at night, 4K, dramatic lighting, slow motion, volumetric fog",
                    "voiceover_script": "Bu sahnede soylenecek tam seslendirme metni (Turkce)",
                    "text_overlay": ["Ekranda gosterilecek alt yazi veya baslik 1", "text 2"],
                    "duration_seconds": 10
                },
                {"sahne": 2, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 3, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 4, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 5, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 6, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 7, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0},
                {"sahne": 8, "sure": "...", "aciklama": "...", "kamera": "...", "ses": "...", "metin": "...", "ai_video_prompt": "...", "voiceover_script": "...", "text_overlay": ["..."], "duration_seconds": 0}
            ],
            "overall_style": "Videonun genel gorsel stili (sinematik, minimal, enerjik, retro vs.)",
            "color_palette": "Onerilen renk paleti (ornek: koyu mavi tonlari, sicak turuncu vurgular)",
            "music_mood": "Arka plan muzigi tarz onerisi (ornek: epik orkestral, lo-fi chill, enerjik EDM)",
            "transition_style": "Sahneler arasi gecis tipi (cut, fade, zoom, glitch vs.)",
            "aspect_ratio_recommendation": "Onerilen en-boy orani ve neden (16:9 YouTube, 9:16 Shorts/TikTok, 1:1 Instagram)",
            "full_voiceover_script": "Videonun tamami icin kesintisiz seslendirme metni. Tum sahnelerin voiceover'larini birlestir, dogal bir akis ile yaz. Turkce.",
            "music_recommendations": [
                {"name": "Muzik tarzi/parca onerisi", "mood": "Enerji seviyesi (sakin/orta/enerjik)", "where": "Hangi sahnelerde kullanilmali"},
                {"name": "...", "mood": "...", "where": "..."},
                {"name": "...", "mood": "...", "where": "..."}
            ],
            "export_ready_prompts": {
                "sora_prompt": "OpenAI Sora icin optimize edilmis tek uzun prompt - tum video icerigi tek seferde (ENG, 4K cinematic detayli)",
                "runway_prompt": "Runway Gen-3 icin optimize edilmis tek uzun prompt (ENG, motion details, camera movements)",
                "pika_prompt": "Pika Labs icin optimize edilmis tek prompt (ENG, stylized, motion emphasis)",
                "kling_prompt": "Kling AI icin optimize edilmis tek prompt (ENG, realistic, high detail)",
                "luma_prompt": "Luma Dream Machine icin optimize edilmis tek prompt (ENG, 3D-aware, lighting focus)"
            }
        },

        "ai_video_prompts": {
            "runway_prompts": [
                "Bu videonun konusunu Runway ML ile olusturmak icin detayli Ingilizce prompt 1 (sahne detayi, kamera, isik, stil belirt)",
                "prompt 2",
                "prompt 3"
            ],
            "luma_prompts": [
                "Bu videonun konusunu Luma AI ile olusturmak icin detayli Ingilizce prompt 1",
                "prompt 2",
                "prompt 3"
            ],
            "kling_prompts": [
                "Bu videonun konusunu Kling AI ile olusturmak icin detayli Ingilizce prompt 1",
                "prompt 2",
                "prompt 3"
            ],
            "sora_prompts": [
                "Bu videonun konusunu OpenAI Sora ile olusturmak icin detayli Ingilizce prompt 1 (cinematic, high quality, motion details)",
                "prompt 2",
                "prompt 3"
            ],
            "pika_prompts": [
                "Bu videonun konusunu Pika Labs ile olusturmak icin detayli Ingilizce prompt 1",
                "prompt 2",
                "prompt 3"
            ],
            "shorts_reels_prompts": [
                "Bu icerikten 15-60 saniyelik kisa video (Shorts/Reels/TikTok) icin AI video prompt'u 1",
                "prompt 2",
                "prompt 3"
            ],
            "thumbnail_dalle_prompts": [
                "Bu video icin DALL-E/Midjourney ile thumbnail olusturmak icin detayli Ingilizce prompt 1",
                "prompt 2",
                "prompt 3"
            ]
        },

        "b_roll_suggestions": [
            "B-roll onerisi 1 (sahne aciklamasi + AI prompt)",
            "B-roll onerisi 2",
            "B-roll onerisi 3",
            "B-roll onerisi 4",
            "B-roll onerisi 5"
        ],

        "content_briefing": {
            "timeline": [
                {"timestamp": "0:00-0:30", "topic": "Konu basligi", "summary": "Bu bolumde ne anlatiliyor (detayli)"},
                {"timestamp": "0:30-1:30", "topic": "...", "summary": "..."},
                {"timestamp": "1:30-3:00", "topic": "...", "summary": "..."},
                {"timestamp": "3:00-5:00", "topic": "...", "summary": "..."},
                {"timestamp": "5:00+", "topic": "...", "summary": "..."}
            ],
            "study_notes": "Videonun icerigi uzerinden hazirlanmis detayli calisma notlari. Basliklar ve alt basliklarla yapilandirilmis, ogrenmek isteyen biri icin yazilmis kapsamli not (en az 300 kelime).",
            "quick_recap": "30 saniyede okunabilecek hizli ozet (3-4 cumle)"
        },

        "faq": [
            {"question": "Bu videodan ogrenilebilecek en onemli sey nedir?", "answer": "Detayli cevap..."},
            {"question": "Video hangi problemlere cozum sunuyor?", "answer": "Detayli cevap..."},
            {"question": "Videonun hedef kitlesi kimler?", "answer": "Detayli cevap..."},
            {"question": "Videodaki bilgiler guncel mi?", "answer": "Detayli cevap..."},
            {"question": "Bu konuda daha fazla bilgi icin ne yapilmali?", "answer": "Detayli cevap..."},
            {"question": "Izleyici iceriden cikarilabilecek soru 1?", "answer": "..."},
            {"question": "Izleyici iceriden cikarilabilecek soru 2?", "answer": "..."}
        ],

        "key_concepts": [
            {"term": "Anahtar kavram/terim 1", "definition": "Tanimi ve video baglamindaki anlami", "importance": "Neden onemli"},
            {"term": "Kavram 2", "definition": "...", "importance": "..."},
            {"term": "Kavram 3", "definition": "...", "importance": "..."},
            {"term": "Kavram 4", "definition": "...", "importance": "..."},
            {"term": "Kavram 5", "definition": "...", "importance": "..."}
        ],

        "content_dna": {
            "format_formula": "Bu videonun format formulu (ornek: Hook + Problem + 3 Cozum + CTA seklinde yapilanmis)",
            "unique_elements": ["Bu videoyu benzersiz yapan eleman 1", "eleman 2", "eleman 3"],
            "replicable_patterns": ["Tekrar kullanilabilecek kalip 1", "kalip 2", "kalip 3"],
            "success_factors": ["Basari faktoru 1", "faktor 2", "faktor 3"],
            "content_pillars": ["Icerik sutunu 1 (ana tema)", "sutun 2", "sutun 3"],
            "emotional_arc": "Videonun duygusal yolculugu (merak -> saskinlik -> motivasyon gibi)"
        },

        "recreation_mega_prompt": "Bu videonun tarzinda, tonunda ve yapisinda yepyeni bir video olusturmak icin kullanilabilecek tek bir mega prompt. Icinde su bilgiler olmali: hedef kitle, ton, format yapisi, hook stili, gorsel stil, muzik onerisi, senaryo yapisi, CTA stratejisi. En az 200 kelime, dogrudan bir AI aracina (ChatGPT, Claude vs.) yapistirinca kullanilabilir olmali."
    }

    ${isEnglish ? `IMPORTANT RULES:
    - Prepare ALL responses in ENGLISH (ONLY ai_video_prompts, runway_prompts, luma_prompts, kling_prompts, sora_prompts, pika_prompts, shorts_reels_prompts, thumbnail_dalle_prompts, export_ready_prompts and ai_video_prompt fields inside storyboard should be in ENGLISH as AI video services work in English).
    - Provide real, actionable, original analyses. Do not give generic/cliché responses.` : `ÖNEMLİ KURALLAR:
    - Tüm yanıtları TÜRKÇE olarak hazırla (SADECE ai_video_prompts, runway_prompts, luma_prompts, kling_prompts, sora_prompts, pika_prompts, shorts_reels_prompts, thumbnail_dalle_prompts, export_ready_prompts ve storyboard icindeki ai_video_prompt alanlari INGILIZCE olacak cunku AI video servisleri Ingilizce calisir).
    - Gerçek, uygulanabilir, özgün analizler yap. Genel/klişe yanıtlar verme.`}
    - AI video prompt'lari cok detayli olmali: sahne aciklamasi, kamera acisi, isik durumu, renk tonu, hareket, stil, kalite (4K, cinematic vs.) icermeli.
    - Storyboard tam 8 sahne icermeli, her sahne icin ai_video_prompt INGILIZCE ve kullanima hazir olmali.
    - Her storyboard sahnesi voiceover_script (Turkce seslendirme metni) ve text_overlay (ekran yazilari) icermeli.
    - full_voiceover_script alani tum sahnelerin seslendirme metinlerini birlestirmis, dogal akisli tek bir metin olmali.
    - export_ready_prompts icindeki her prompt, ilgili platforma ozel optimize edilmis, detayli ve kullanima hazir olmali.
    - Video suresi ${videoData.duration || "bilinmiyor"} - storyboard sahnelerini bu sureye gore olustur.
    - Mermaid kodu geçerli ve render edilebilir olmalı.
    - Heatmap dizisi tam olarak 20 eleman içermeli ve 0-100 arası değerler olmalı.
    - content_briefing.study_notes en az 300 kelime, detayli ve egitici olmali.
    - content_briefing.timeline video suresine gore 5-8 bolum icermeli.
    - faq en az 7 soru-cevap icermeli, izleyicinin gercekten sorabilecegi sorular olmali.
    - key_concepts en az 5 terim icermeli.
    - recreation_mega_prompt en az 200 kelime, dogrudan AI'a yapistirinca kullanilabilir olmali.
    - JSON çıktısı parse edilebilir olmalı, ekstra karakter veya açıklama ekleme.
    `;
}

// ==================== JSON PARSER ====================
function parseAIResponse(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Direkt parse
    try {
        const result = JSON.parse(text);
        if (result && typeof result === 'object' && result.video_score) return result;
    } catch (e) {}

    // 2. JSON blogu cikar (ilk { ile son } arasi)
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    let jsonString = text.substring(firstBrace);

    // 3. Temizlik - kontrol karakterlerini temizle
    jsonString = jsonString
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        .replace(/\t/g, '    ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // 4. Direkt dene
    try {
        const result = JSON.parse(jsonString);
        if (result && typeof result === 'object') return result;
    } catch (e) {}

    // 5. Trailing comma temizligi
    let cleaned = jsonString.replace(/,(\s*[\]\}])/g, '$1');
    try {
        const result = JSON.parse(cleaned);
        if (result && typeof result === 'object') return result;
    } catch (e) {}

    // 6. String-aware bracket dengeleme ile truncated JSON recovery
    try {
        let truncated = cleaned;
        // Sondaki eksik key-value'yu kaldir (birden fazla pattern dene)
        truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*("([^"\\]|\\.)*)?$/, '');
        truncated = truncated.replace(/,\s*"[^"]*$/, '');
        truncated = truncated.replace(/,\s*$/, '');

        // String-aware bracket sayimi
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

        // Acik string'i kapat
        if (inString) truncated += '"';
        // Trailing comma temizle (kapanislardan once)
        truncated = truncated.replace(/,(\s*)$/, '$1');
        // Acik bracket ve brace'leri kapat
        for (let i = 0; i < openBrackets; i++) truncated += ']';
        for (let i = 0; i < opens; i++) truncated += '}';

        const result = JSON.parse(truncated);
        if (result && typeof result === 'object' && result.video_score) {
            console.warn(`JSON truncation recovered - ${Object.keys(result).length} keys found (some fields may be missing)`);
            return result;
        }
    } catch (e) {}

    // 7. Son care: satirlari sondan kaldirarak dene
    try {
        const lines = cleaned.split('\n');
        for (let removeCount = 1; removeCount < Math.min(lines.length, 50); removeCount++) {
            let partial = lines.slice(0, lines.length - removeCount).join('\n');
            // Sondaki virgul ve boslugu temizle
            partial = partial.replace(/,\s*$/, '');
            // Acik bracket/brace say ve kapat
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
                if (result && typeof result === 'object' && result.video_score) {
                    console.warn(`JSON line-removal recovered (removed ${removeCount} lines) - ${Object.keys(result).length} keys`);
                    return result;
                }
            } catch (e2) { continue; }
        }
    } catch (e) {}

    console.error("JSON parse basarisiz - tum denemeler tukendi");
    return null;
}

module.exports = { analyzeVideo };
