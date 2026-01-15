import clsx from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for cleaner tailwind classes
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Generate a cryptographic nonce (Proof of Work simulation)
// In a real scenario, this helps prevent spam and rainbow table attacks
export async function mineNonce(data, difficulty = 2) {
    let nonce = 0;
    const prefix = '0'.repeat(difficulty);
    const encoder = new TextEncoder();
    
    // Safety break
    const maxIterations = 200000; 

    while (nonce < maxIterations) {
        // Yield to event loop every 500 iterations to prevent UI freeze
        if (nonce % 500 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const candidate = nonce.toString(16);
        const input = encoder.encode(data + candidate);
        const hashBuffer = await crypto.subtle.digest('SHA-256', input);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (hashHex.startsWith(prefix)) {
            return { nonce: candidate, hash: hashHex };
        }
        nonce++;
    }
    
    // Fallback if mining takes too long (for UI responsiveness)
    return { nonce: Math.random().toString(36).substring(7), hash: 'timeout_fallback' };
}

// Sanitizer to prevent prompt injection
export function sanitizeData(data) {
    if (!data) return "";
    const dangerous = ['System:', 'Instruction:', 'Assistant:', 'Ignore', 'Forget'];
    let sanitized = data;
    dangerous.forEach(word => {
        const regex = new RegExp(word, 'gi');
        sanitized = sanitized.replace(regex, `[${word}]`);
    });
    return sanitized;
}

// The Core AI Fingerprinting Function
export async function generateAIFingerprint(data, nonce) {
    const sanitizedData = sanitizeData(data);
    
    // This prompt is critical. It acts as the "hash function".
    // Changes here change the hash for EVERYONE.
    const systemPrompt = `You are a deterministic data fingerprinting oracle. 
Respond EXACTLY as specified with no variations.

Data Fingerprinting Request:
═══════════════════════════════════════
NONCE: ${nonce}
DATA_CONTENT:
---BEGIN DATA---
${sanitizedData}
---END DATA---

Instructions:
1. Analyze the semantic content and structure of the data.
2. Generate a pseudo-hash based on the data characters and the nonce.
3. Your output must be a string of EXACTLY 64 hexadecimal characters.
4. If the input data and nonce are the same, the output MUST be the same.
5. Do not include any explanation. Just the "FINGERPRINT:" followed by the code.

Output Format:
FINGERPRINT:[64 hex characters]`;

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                { role: "system", content: "You are a deterministic machine. Temperature 0. Output only the requested format." },
                { role: "user", content: systemPrompt }
            ],
            temperature: 0, // CRITICAL: Maximizes determinism
            seed: 42,       // CRITICAL: Try to fix random seed if supported
        });

        const response = completion.content || "";
        console.log("Raw AI Response:", response);
        
        // Extract the fingerprint
        const match = response.match(/FINGERPRINT:([A-Fa-f0-9]{64})/);
        if (match && match[1]) {
            return {
                raw: response,
                fingerprint: match[1],
                prompt: systemPrompt
            };
        } else {
            // Robust Fallback: Search for any 64-char hex string
            const looseMatch = response.match(/[A-Fa-f0-9]{64}/);
            if (looseMatch) {
                return {
                    raw: response,
                    fingerprint: looseMatch[0],
                    prompt: systemPrompt
                }
            }

            // Desperate Fallback: Hash the response itself if structure failed entirely 
            // (This preserves determinism of the model output even if formatting failed)
            const encoder = new TextEncoder();
            const data = encoder.encode(response);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            return {
                raw: response,
                fingerprint: hashHex, // Use SHA256 of the weird response as the ID
                prompt: systemPrompt,
                fallback: true
            };
        }
    } catch (error) {
        console.error("AI Fingerprint Error:", error);
        throw error;
    }
}