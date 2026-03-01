require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        console.log("Checking available models for your Gemini API Key...");
        // There isn't a direct listModels in the client usually, but we can test common names
        const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hi");
                const response = await result.response;
                console.log(`✅ SUCCESS: ${modelName} is working!`);
                return modelName;
            } catch (err) {
                console.log(`❌ FAILED: ${modelName} - ${err.message}`);
            }
        }
    } catch (error) {
        console.error("General Error:", error);
    }
}

listModels().then(workingModel => {
    if (workingModel) {
        console.log(`\nYour best working model is: ${workingModel}`);
        console.log("Please update aiService.js with this model name.");
    } else {
        console.log("\nNo models found. Please check your API Key and Region restrictions.");
    }
});
