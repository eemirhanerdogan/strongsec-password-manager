// ArrayBuffer <-> Base64 helpers
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// Security constants
const PBKDF2_ITERATIONS = 250000;
const HASH_ALGO = 'SHA-256';

async function generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return bufferToBase64(salt);
}

async function deriveKey(password, saltBase64) {
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    const saltBuffer = base64ToBuffer(saltBase64);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: HASH_ALGO
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

async function exportKeyToJWK(key) {
    return await crypto.subtle.exportKey('jwk', key);
}

async function importKeyFromJWK(jwk) {
    return await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(key, text) {
    if (!key) throw new Error("Encryption key is missing.");
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // AES-GCM requires a 12-byte initialization vector
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        data
    );

    return {
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer)
    };
}

async function decryptData(key, encryptedObj) {
    if (!key) throw new Error("Encryption key is missing.");
    if (!encryptedObj || !encryptedObj.iv || !encryptedObj.ciphertext) {
        throw new Error("Invalid encrypted object format.");
    }

    const ivBuffer = base64ToBuffer(encryptedObj.iv);
    const ciphertextBuffer = base64ToBuffer(encryptedObj.ciphertext);

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: new Uint8Array(ivBuffer)
        },
        key,
        ciphertextBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
}
