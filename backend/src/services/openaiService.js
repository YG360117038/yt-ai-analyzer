const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeVideo(videoData) {
    const prompt = `
    Analyze this YouTube video data and provide a detailed strategy report.
    VIDEO DATA:
    Title: ${videoData.title}
    Description: ${videoData.description}
    Channel: ${videoData.channelName}
    Comments: ${videoData.comments.join(" | ")}
    Tags: ${videoData.tags.join(", ")}

    OUTPUT FORMAT: JSON
    Please include the following sections in your analysis:

    1. AI Analysis:
    - Content Style Breakdown
    - Psychological Triggers Used
    - Hook Structure Analysis
    - Retention Strategy Analysis
    - Thumbnail Psychology Breakdown (based on title and description context)
    - Viral Probability Score (0-100)
    - Target Audience Identification
    - Tone & Writing Style Analysis
    - Script Structure Reverse Engineering
    - CTA Strategy Analysis

    2. Rebuild Prompts:
    - 5 Similar Video Prompts
    - 5 Viral Hook Prompts
    - 5 Title Variations
    - 5 SEO Optimized Descriptions
    - 10 High CTR Title Ideas
    - 10 Thumbnail Text Ideas

    3. Script Generator:
    - Full Script Template
    - Hook Variations
    - Storytelling Framework
    - Engagement Boost Sections

    4. Character Transformation (Tones):
    - Aggressive sales
    - Calm educational
    - Storytelling documentary
    - Motivational style
    - Controversial style

    All analysis and generated content should be in Turkish.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Higher accessibility and lower cost
        messages: [
            { role: "system", content: "Sen profesyonel bir YouTube stratejisti ve içerik analiz uzmanısın." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
}

module.exports = { analyzeVideo };
