require('dotenv').config();
const { executeTool } = require('./tools');

async function testTool() {
    console.log("--- Testing get_cow_info Latency ---");
    const start = Date.now();
    try {
        const result = await executeTool('get_cow_info', { animalNumber: "123" });
        console.log(`Tool took: ${Date.now() - start}ms`);
        console.log("Result:", JSON.stringify(result).substring(0, 100));
    } catch (err) {
        console.error("Tool failed:", err);
    }
}

testTool();
