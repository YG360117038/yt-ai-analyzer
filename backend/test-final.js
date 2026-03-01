require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

async function testFinal() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("Merhaba, çalışıyor musun?");
        console.log("Response:", result.response.text());
        console.log("✅ SUCCESS: gemini-2.5-flash is working!");
    } catch (e) {
        console.error("❌ FAIL:", e.message);
    }
}

testFinal();
