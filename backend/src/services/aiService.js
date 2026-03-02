const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzeVideo(videoData) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7
        }
    });

    const prompt = `
    Sen dünyanın en iyi YouTube içerik stratejisti ve AI prompt mühendisisin.
    Aşağıdaki YouTube video verilerini derinlemesine analiz et ve kapsamlı bir strateji raporu hazırla.

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
                    "sure": "0:00-0:05",
                    "aciklama": "Sahnenin detayli aciklamasi",
                    "kamera": "Kamera acisi ve hareketi (close-up, wide shot, dolly vs.)",
                    "ses": "Arka plan muzigi veya ses efekti",
                    "metin": "Ekranda gosterilecek metin (varsa)",
                    "ai_video_prompt": "Bu sahneyi Runway/Luma/Kling ile olusturmak icin Ingilizce prompt. Ornek: Cinematic wide shot of a person walking through a neon-lit city at night, 4K, dramatic lighting, slow motion"
                },
                {
                    "sahne": 2,
                    "sure": "0:05-0:15",
                    "aciklama": "...",
                    "kamera": "...",
                    "ses": "...",
                    "metin": "...",
                    "ai_video_prompt": "..."
                },
                {
                    "sahne": 3,
                    "sure": "0:15-0:30",
                    "aciklama": "...",
                    "kamera": "...",
                    "ses": "...",
                    "metin": "...",
                    "ai_video_prompt": "..."
                },
                {
                    "sahne": 4,
                    "sure": "0:30-0:45",
                    "aciklama": "...",
                    "kamera": "...",
                    "ses": "...",
                    "metin": "...",
                    "ai_video_prompt": "..."
                },
                {
                    "sahne": 5,
                    "sure": "0:45-1:00",
                    "aciklama": "...",
                    "kamera": "...",
                    "ses": "...",
                    "metin": "...",
                    "ai_video_prompt": "..."
                }
            ],
            "overall_style": "Videonun genel gorsel stili (sinematik, minimal, enerjik, retro vs.)",
            "color_palette": "Onerilen renk paleti (ornek: koyu mavi tonlari, sicak turuncu vurgular)",
            "music_mood": "Arka plan muzigi tarz onerisi (ornek: epik orkestral, lo-fi chill, enerjik EDM)",
            "transition_style": "Sahneler arasi gecis tipi (cut, fade, zoom, glitch vs.)",
            "aspect_ratio_recommendation": "Onerilen en-boy orani ve neden (16:9 YouTube, 9:16 Shorts/TikTok, 1:1 Instagram)"
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
        ]
    }

    ÖNEMLİ KURALLAR:
    - Tüm yanıtları TÜRKÇE olarak hazırla (SADECE ai_video_prompts, runway_prompts, luma_prompts, kling_prompts, shorts_reels_prompts, thumbnail_dalle_prompts ve storyboard icindeki ai_video_prompt alanlari INGILIZCE olacak cunku AI video servisleri Ingilizce calisir).
    - Gerçek, uygulanabilir, özgün analizler yap. Genel/klişe yanıtlar verme.
    - AI video prompt'lari cok detayli olmali: sahne aciklamasi, kamera acisi, isik durumu, renk tonu, hareket, stil, kalite (4K, cinematic vs.) icermeli.
    - Storyboard tam 5 sahne icermeli, her sahne icin ai_video_prompt INGILIZCE ve kullanima hazir olmali.
    - Mermaid kodu geçerli ve render edilebilir olmalı.
    - Heatmap dizisi tam olarak 20 eleman içermeli ve 0-100 arası değerler olmalı.
    - JSON çıktısı parse edilebilir olmalı, ekstra karakter veya açıklama ekleme.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("Raw AI Response length:", text.length);

    try {
        // Direkt parse dene (responseMimeType: "application/json" ile gelmeli)
        try {
            return JSON.parse(text);
        } catch (e) {
            console.log("Direct parse failed, extracting JSON...");
        }

        // JSON blogu cikar
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("AI yanitinda gecerli bir JSON bulunamadi.");
        }

        let jsonString = jsonMatch[0];

        // 1. ilk deneme
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.log("Initial parse failed, cleaning...", e.message);
        }

        // 2. Temizlik
        jsonString = jsonString
            .replace(/,(\s*[\]\}])/g, '$1')           // trailing comma
            .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')   // kontrol karakterleri
            .replace(/\t/g, ' ')                        // tab
            .replace(/\n/g, '\\n')                      // newline in string
            .replace(/\r/g, '')                          // carriage return
            .replace(/\\'/g, "'")                        // escaped single quote
            .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')  // unquoted keys
            .replace(/""+/g, '"');                        // double quotes

        try {
            return JSON.parse(jsonString);
        } catch (e2) {
            console.log("Clean parse failed, trying repair...", e2.message);
        }

        // 3. Son care: bracket dengeleme
        let braceCount = 0;
        let lastValidIdx = 0;
        for (let i = 0; i < jsonString.length; i++) {
            if (jsonString[i] === '{') braceCount++;
            if (jsonString[i] === '}') {
                braceCount--;
                if (braceCount === 0) { lastValidIdx = i; break; }
            }
        }
        if (lastValidIdx > 0) {
            jsonString = jsonString.substring(0, lastValidIdx + 1);
        }

        try {
            return JSON.parse(jsonString);
        } catch (e3) {
            console.error("All parse attempts failed:", e3.message);
            console.error("JSON snippet (first 1000):", jsonString.substring(0, 1000));
            throw new Error("AI yaniti islenemedi. Lutfen tekrar deneyin.");
        }
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError.message);
        throw new Error("AI yaniti islenirken hata: " + parseError.message);
    }
}

module.exports = { analyzeVideo };
