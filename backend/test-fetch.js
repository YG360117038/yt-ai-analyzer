require('dotenv').config();

async function testFetch() {
    const apiKey = process.env.GEMINI_API_KEY.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ parts: [{ text: "Merhaba" }] }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (response.ok) {
            console.log("✅ API SUCCESS via FETCH!");
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log("❌ API FAIL via FETCH!");
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

testFetch();
