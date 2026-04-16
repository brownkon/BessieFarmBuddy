import 'dotenv/config';
import { openaiService } from '../services/openai';

async function testPerformance() {
    console.log("--- Starting Full Performance Test ---");
    const startTime = Date.now();
    
    const text = "How is cow 123 doing today?";
    const history = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello! How can I help you today?" }
    ];

    try {
        const stream = await (openaiService as any).getChatStream({
            text,
            history,
            language: 'en'
        });

        console.log(`[Full Test] getChatStream call returned in ${Date.now() - startTime}ms`);
        
        let firstChunkTime = null;
        for await (const chunk of (stream as any)) {
            if (!firstChunkTime) {
                firstChunkTime = Date.now();
                console.log(`[Full Test] FIRST CHUNK received in ${firstChunkTime - startTime}ms from total start`);
            }
        }
        
        console.log(`[Full Test] Final response finished in ${Date.now() - startTime}ms`);

    } catch (err: any) {
        console.error("Test failed:", err?.message || err);
    }
}

testPerformance();
