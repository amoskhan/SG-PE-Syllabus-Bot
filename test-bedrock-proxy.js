
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for fetch if needed (Node 18+ has it)
// const fetch = ... 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env.local');

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/VITE_BEDROCK_BEARER_TOKEN=(.+)/);

    if (!match) {
        console.error("Could not find VITE_BEDROCK_BEARER_TOKEN in .env.local");
        process.exit(1);
    }

    const token = match[1].trim();
    const base64Part = token.replace(/^bedrock-api-key-/, '');
    const decodedUrl = atob(base64Part);

    console.log("Decoded URL:", decodedUrl);

    // Prepend https:// if missing
    const fullUrl = decodedUrl.startsWith('http') ? decodedUrl : `https://${decodedUrl}`;
    const urlObj = new URL(fullUrl);

    // Construct proxy URL
    const proxyUrl = `http://localhost:3000/bedrock-api${urlObj.search}`;

    console.log("Testing Proxy URL:", proxyUrl);

    const requestBody = {
        messages: [{ role: "user", content: [{ text: "Hello" }] }],
        inferenceConfig: {
            maxTokens: 100,
            temperature: 0.7,
            topP: 0.9,
        },
    };

    console.log("Sending request...");

    fetch(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    })
        .then(async response => {
            console.log("Response Status:", response.status);
            const text = await response.text();
            console.log("Response Body:", text);

            if (response.ok) {
                console.log("SUCCESS: Bedrock API call via proxy worked!");
            } else {
                console.error("FAILURE: Bedrock API call failed.");
            }
        })
        .catch(error => {
            console.error("Error during fetch:", error);
        });

} catch (err) {
    console.error("Error reading .env.local:", err);
}
