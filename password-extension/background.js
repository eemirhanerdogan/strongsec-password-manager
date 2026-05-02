importScripts('crypto.js');
importScripts('breach.js');

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

let currentCryptoKey = null;
const AUTO_LOCK_TIMEOUT = 5 * 60 * 60 * 1000; // 5 hours

const VERIFICATION_MAGIC_STRING = "STRONGSEC_VAULT_VALID";

async function refreshSessionExpiry() {
    const expiresAt = Date.now() + AUTO_LOCK_TIMEOUT;
    await chrome.storage.session.set({ expiresAt: expiresAt });
}

async function setSessionUnlocked(key) {
    if (!key) return;
    const jwk = await exportKeyToJWK(key);
    const expiresAt = Date.now() + AUTO_LOCK_TIMEOUT;
    await chrome.storage.session.set({
        vaultUnlocked: true,
        sessionJwk: jwk,
        expiresAt: expiresAt
    });
    currentCryptoKey = key;
}

function clearSessionUnlocked() {
    chrome.storage.session.remove(['vaultUnlocked', 'sessionJwk', 'expiresAt']);
    currentCryptoKey = null;
}

async function persistRememberedDeviceUnlock(key) {
    if (!key) return;
    try {
        const jwk = await exportKeyToJWK(key);
        await chrome.storage.local.set({
            rememberedVaultKeyJwk: jwk,
            rememberDeviceEnabled: true
        });
    } catch (e) {
        throw new Error("Cihazı hatırlama işlemi başarısız oldu.");
    }
}

async function clearRememberedDeviceUnlock() {
    await chrome.storage.local.remove(['rememberedVaultKeyJwk', 'rememberDeviceEnabled']);
}

async function getCurrentKey() {
    const session = await chrome.storage.session.get(['vaultUnlocked', 'sessionJwk', 'expiresAt']);
    const now = Date.now();

    if (session.expiresAt && now > session.expiresAt) {
        clearSessionUnlocked();
        return null;
    }

    if (currentCryptoKey) {
        if (session.vaultUnlocked) refreshSessionExpiry();
        return currentCryptoKey;
    }

    if (session.vaultUnlocked && session.sessionJwk && session.expiresAt) {
        currentCryptoKey = await importKeyFromJWK(session.sessionJwk);
        refreshSessionExpiry();
        return currentCryptoKey;
    }

    // Attempt to restore from remembered device state
    const local = await chrome.storage.local.get(['rememberedVaultKeyJwk', 'vaultMeta', 'rememberDeviceEnabled']);

    if (local.rememberDeviceEnabled) {
        console.log("Remember device enabled");
    }
    if (local.rememberedVaultKeyJwk) {
        console.log("rememberedVaultKeyJwk found");
    }

    if (local.rememberedVaultKeyJwk && local.vaultMeta && local.vaultMeta.verificationBlob) {
        try {
            const restoredKey = await importKeyFromJWK(local.rememberedVaultKeyJwk);
            const decrypted = await decryptData(restoredKey, local.vaultMeta.verificationBlob);
            if (decrypted === VERIFICATION_MAGIC_STRING) {
                console.log("rememberedVaultKeyJwk restore success");
                currentCryptoKey = restoredKey;
                await setSessionUnlocked(restoredKey);
                return restoredKey;
            }
        } catch (e) {
            // Decryption or import failed, key is invalid
        }
        // Verification failed or an error occurred, clear invalid state
        console.log("rememberedVaultKeyJwk restore failed");
        await clearRememberedDeviceUnlock();
    }

    return null;
}

// Keep port listener alive specifically to not break popup connection logic
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup-keepalive') return;
    port.onDisconnect.addListener(() => {
    });
});

async function checkAutoLock() {
    const session = await chrome.storage.session.get(['expiresAt']);
    if (session.expiresAt && Date.now() > session.expiresAt) {
        clearSessionUnlocked();
    }
}
setInterval(checkAutoLock, 60000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // ----------------------------------------------------
    // VAULT SETUP
    // ----------------------------------------------------
    if (request.action === 'setupVault') {
        (async () => {
            try {
                const salt = await generateSalt();
                const key = await deriveKey(request.masterPassword, salt);

                const verificationBlob = await encryptData(key, VERIFICATION_MAGIC_STRING);

                await chrome.storage.local.set({
                    vaultMeta: {
                        isSetup: true,
                        salt: salt,
                        verificationBlob: verificationBlob
                    }
                });

                await clearRememberedDeviceUnlock();
                await setSessionUnlocked(key);
                sendResponse({ success: true });
            } catch (error) {
                console.error("Vault setup failed:", error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // ----------------------------------------------------
    // VAULT UNLOCK
    // ----------------------------------------------------
    if (request.action === 'unlockVault') {
        (async () => {
            try {
                const result = await chrome.storage.local.get(['vaultMeta']);
                const meta = result.vaultMeta;
                if (!meta || !meta.salt || !meta.verificationBlob) {
                    sendResponse({ success: false, error: "Vault is not set up properly." });
                    return;
                }

                const key = await deriveKey(request.masterPassword, meta.salt);

                try {
                    const decrypted = await decryptData(key, meta.verificationBlob);
                    if (decrypted !== VERIFICATION_MAGIC_STRING) {
                        throw new Error("Yanlış parola.");
                    }
                } catch (e) {
                    sendResponse({ success: false, error: "Yanlış parola." });
                    return;
                }

                await setSessionUnlocked(key);

                const rememberDeviceRequested =
                    request.rememberDevice === true ||
                    (Array.isArray(request.rememberDevice) && request.rememberDevice[0] === true);

                if (rememberDeviceRequested) {
                    await persistRememberedDeviceUnlock(key);
                } else {
                    await clearRememberedDeviceUnlock();
                }

                sendResponse({ success: true });
            } catch (error) {
                console.error("Vault unlock failed:", error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // ----------------------------------------------------
    // VAULT RESET
    // ----------------------------------------------------
    if (request.action === 'resetVault') {
        (async () => {
            try {
                await chrome.storage.local.clear();
                clearSessionUnlocked();
                await clearRememberedDeviceUnlock();
                sendResponse({ success: true });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // ----------------------------------------------------
    // CHANGE MASTER PASSWORD
    // ----------------------------------------------------
    if (request.action === 'changeMasterPassword') {
        (async () => {
            try {
                const activeKey = await getCurrentKey();
                if (!activeKey) {
                    throw new Error("Vault is locked, please unlock first.");
                }

                const result = await chrome.storage.local.get(null);
                const meta = result.vaultMeta;
                if (!meta || !meta.salt || !meta.verificationBlob) {
                    throw new Error("Vault not set up properly.");
                }

                // Validate current password locally
                const validationKey = await deriveKey(request.currentPw, meta.salt);
                try {
                    const decryptedVal = await decryptData(validationKey, meta.verificationBlob);
                    if (decryptedVal !== VERIFICATION_MAGIC_STRING) {
                        throw new Error("Mevcut parola yanlış.");
                    }
                } catch (e) {
                    throw new Error("Mevcut parola yanlış.");
                }

                // Setup new key and new metadata
                const newSalt = await generateSalt();
                const newKey = await deriveKey(request.newPw, newSalt);
                const newVerificationBlob = await encryptData(newKey, VERIFICATION_MAGIC_STRING);

                let updatePayload = {
                    vaultMeta: {
                        isSetup: true,
                        salt: newSalt,
                        verificationBlob: newVerificationBlob
                    }
                };

                const internalKeys = ['autoMode', 'lastPassword', 'lastLength', 'vaultMeta'];

                // Loop over entire storage and re-encrypt seamlessly
                for (const [domain, rawData] of Object.entries(result)) {
                    if (internalKeys.includes(domain)) continue;

                    let accounts = Array.isArray(rawData) ? rawData : [rawData];
                    let updatedAccounts = [];

                    for (let i = 0; i < accounts.length; i++) {
                        let acc = accounts[i];

                        let plainPass;
                        if (typeof acc.password === 'string') {
                            plainPass = acc.password;
                        } else {
                            // Must decrypt using current locked key in memory BEFORE it vanishes
                            plainPass = await decryptData(activeKey, acc.password);
                        }

                        const newEncObj = await encryptData(newKey, plainPass);

                        updatedAccounts.push({
                            email: acc.email,
                            password: newEncObj
                        });
                    }
                    updatePayload[domain] = updatedAccounts;
                }

                // Commit all successfully re-encrypted payloads via single atomic update query
                await chrome.storage.local.set(updatePayload);

                await clearRememberedDeviceUnlock();
                clearSessionUnlocked(); // Force user to login again

                sendResponse({ success: true });
            } catch (error) {
                console.error("Change password failed:", error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // ----------------------------------------------------
    // GENERAL ACTIONS
    // ----------------------------------------------------

    if (request.action === 'lockVault') {
        clearSessionUnlocked();
        clearRememberedDeviceUnlock();
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'isVaultUnlocked') {
        (async () => {
            try {
                if (currentCryptoKey) {
                    sendResponse({ unlocked: true });
                    return;
                }
                const key = await getCurrentKey();
                sendResponse({ unlocked: !!key });
            } catch (err) {
                console.error("Error checking vault unlock state:", err);
                sendResponse({ unlocked: false });
            }
        })();
        return true;
    }

    if (request.action === 'encrypt') {
        (async () => {
            try {
                const key = await getCurrentKey();
                if (!key) {
                    sendResponse({ success: false, error: "Vault locked." });
                    return;
                }
                const encryptedObj = await encryptData(key, request.text);
                sendResponse({ success: true, encrypted: encryptedObj });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'decrypt') {
        (async () => {
            try {
                const key = await getCurrentKey();
                if (!key) {
                    sendResponse({ success: false, error: "Vault locked." });
                    return;
                }
                if (typeof request.encryptedObj === 'string') {
                    sendResponse({ success: true, decrypted: request.encryptedObj, wasString: true });
                    return;
                }
                const decryptedStr = await decryptData(key, request.encryptedObj);
                sendResponse({ success: true, decrypted: decryptedStr });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'scanAllPasswords') {
        (async () => {
            try {
                const key = await getCurrentKey();
                if (!key) {
                    sendResponse({ success: false, error: "Vault locked." });
                    return;
                }

                const result = await chrome.storage.local.get(null);
                const internalKeys = ['autoMode', 'lastPassword', 'lastLength', 'vaultMeta'];
                let scanReports = [];
                let tempData = [];
                let passwordCounts = new Map();
                let riskCache = new Map();

                for (const [domain, rawData] of Object.entries(result)) {
                    if (internalKeys.includes(domain)) continue;

                    let accounts = Array.isArray(rawData) ? rawData : [rawData];
                    for (let acc of accounts) {
                        try {
                            let plainPass = acc.password;
                            if (typeof plainPass !== 'string') {
                                plainPass = await decryptData(key, acc.password);
                            }

                            // Parola kullanım sayısını güncelle
                            passwordCounts.set(plainPass, (passwordCounts.get(plainPass) || 0) + 1);

                            // Riski önbelleğe al (aynı parola için tekrar API'ye gitmemek için)
                            if (!riskCache.has(plainPass)) {
                                const risk = await BreachService.getPasswordRisk(plainPass);
                                riskCache.set(plainPass, risk);
                            }

                            tempData.push({
                                domain: domain,
                                email: acc.email,
                                plainPassword: plainPass
                            });
                        } catch (e) {
                            console.error(`Failed to decrypt/scan for ${domain}`, e);
                        }
                    }
                }

                // Reuse verilerini hesapla ve final scanReports'u oluştur
                tempData.forEach(item => {
                    const p = item.plainPassword;
                    const count = passwordCounts.get(p);

                    scanReports.push({
                        domain: item.domain,
                        email: item.email,
                        reused: count > 1,
                        reuseCount: count,
                        risk: riskCache.get(p)
                    });
                });

                // RAM'den hemen sil (Güvenlik)
                tempData = null;
                passwordCounts.clear();
                riskCache.clear();

                sendResponse({ success: true, report: scanReports });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});
