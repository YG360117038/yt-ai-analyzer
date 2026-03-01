require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function checkModels() {
    try {
        // Correct way to list models in the newer SDK versions might vary, 
        // but we can try to fetch them via the discovery endpoint if needed.
        // For now, let's try a very specific version of the model name.
        console.log("Testing with full model path...");
        const modelsToTest = [
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro",
            "models/gemini-1.0-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro"
        ];

        for (const m of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("test");
                console.log(`✅ SUCCESS: ${m}`);
            } catch (e) {
                console.log(`❌ FAIL: ${m} - ${e.message}`);
            }
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

checkModels();
