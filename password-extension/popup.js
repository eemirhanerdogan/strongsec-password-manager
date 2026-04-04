// --- SW KEEPALIVE ---
// Popup açık olduğu sürece SW'a port bağlarız;
// Chrome, bağlı port olan bir SW'ı uyutmaz — key bellekte kalır.
const _keepAlivePort = chrome.runtime.connect({ name: 'popup-keepalive' });

function generatePassword(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
    let password = "";
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        password += chars[randomValues[i] % chars.length];
    }
    return password;
}

let currentPassword = "";
let isPasswordVisible = false;

const btn = document.getElementById("generateBtn");
const fillBtn = document.getElementById("forceFillBtn");
const copyBtn = document.getElementById("copyBtn");
const toggleVisibleBtn = document.getElementById("toggleVisibleBtn");
const output = document.getElementById("passwordOutput");
const autoModeToggle = document.getElementById("autoModeToggle");
const lengthSelect = document.getElementById("lengthSelect");
const strengthText = document.getElementById("strengthText");

const emailInput = document.getElementById("emailInput");
const saveBtn = document.getElementById("saveBtn");
const saveFeedback = document.getElementById("saveFeedback");

const savedPasswordsList = document.getElementById("savedPasswordsList");
const emptySavedMessage = document.getElementById("emptySavedMessage");

const setupContainer = document.getElementById("setupContainer");
const setupPassword = document.getElementById("setupPassword");
const setupConfirmPassword = document.getElementById("setupConfirmPassword");
const setupBtn = document.getElementById("setupBtn");
const setupError = document.getElementById("setupError");

const unlockContainer = document.getElementById("unlockContainer");
const unlockPassword = document.getElementById("unlockPassword");
const unlockBtn = document.getElementById("unlockBtn");
const resetVaultBtn = document.getElementById("resetVaultBtn");
const unlockError = document.getElementById("unlockError");

const mainContainer = document.getElementById("mainContainer");
const lockVaultBtn = document.getElementById("lockVaultBtn");

const currentMasterPw = document.getElementById("currentMasterPw");
const newMasterPw = document.getElementById("newMasterPw");
const confirmNewMasterPw = document.getElementById("confirmNewMasterPw");
const changeMasterPwBtn = document.getElementById("changeMasterPwBtn");
const changeMasterPwMsg = document.getElementById("changeMasterPwMsg");

function updateDisplay() {
    if (!currentPassword) {
        output.textContent = "Henüz parola üretilmedi";
        toggleVisibleBtn.style.display = "none";
        return;
    }

    toggleVisibleBtn.style.display = "inline-block";
    toggleVisibleBtn.textContent = isPasswordVisible ? "Gizle" : "Göster";

    if (isPasswordVisible) {
        output.textContent = currentPassword;
    } else {
        output.textContent = "•".repeat(currentPassword.length);
    }
}

async function updateStrengthUI(password) {
    if (!password) {
        strengthText.textContent = "Henüz üretilmedi";
        strengthText.style.color = "#555";
        return;
    }

    strengthText.textContent = "HIBP üzerinden kontrol ediliyor...";
    strengthText.style.color = "#555";

    const risk = await BreachService.getPasswordRisk(password);

    if (risk.status === "breached") {
        strengthText.textContent = risk.message;
        strengthText.style.color = "#d32f2f";
    } else if (risk.status === "weak") {
        strengthText.textContent = risk.message;
        strengthText.style.color = "#ff9800";
    } else {
        strengthText.textContent = risk.message;
        strengthText.style.color = "#4caf50";
    }
}

function initializeApp() {
    chrome.storage.local.get(null, (result) => {
        autoModeToggle.checked = !!result.autoMode;

        if (result.lastLength) {
            lengthSelect.value = result.lastLength;
        }

        updateDisplay();
        refreshSavedPasswords();
    });
}

autoModeToggle.addEventListener("change", (e) => {
    chrome.storage.local.set({ autoMode: e.target.checked });
});

toggleVisibleBtn.addEventListener("click", () => {
    isPasswordVisible = !isPasswordVisible;
    updateDisplay();
});

btn.addEventListener("click", () => {
    const selectedLength = parseInt(lengthSelect.value, 10);
    currentPassword = generatePassword(selectedLength);
    isPasswordVisible = false;

    updateDisplay();
    updateStrengthUI(currentPassword);

    chrome.storage.local.set({
        lastLength: selectedLength
    });
});

copyBtn.addEventListener("click", () => {
    if (!currentPassword) {
        alert("Lütfen önce parola üretin.");
        return;
    }

    navigator.clipboard.writeText(currentPassword).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Kopyalandı!";
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 1500);
    });
});

fillBtn.addEventListener("click", () => {
    if (!currentPassword) {
        alert("Lütfen önce parola üretin.");
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "forceFill",
                password: currentPassword
            });
        }
    });
});

function getCleanHostname(url) {
    try {
        const urlObj = new URL(url);
        let hostname = urlObj.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        return null;
    }
}

function showFeedback(message, isError = false) {
    saveFeedback.textContent = message;
    saveFeedback.style.color = isError ? "#d32f2f" : "#388e3c";
    saveFeedback.style.display = "block";
    setTimeout(() => {
        saveFeedback.style.display = "none";
    }, 3000);
}

saveBtn.addEventListener("click", () => {
    const email = emailInput.value.trim();
    if (!email) {
        showFeedback("Lütfen e-posta veya kullanıcı adı girin.", true);
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            showFeedback("Aktif sekme bulunamadı.", true);
            return;
        }

        const currentTabUrl = tabs[0].url;
        const cleanDomain = getCleanHostname(currentTabUrl);

        if (!cleanDomain) {
            showFeedback("Geçerli bir site bulunamadı.", true);
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: "getCurrentPagePassword" }, (response) => {
            (async () => {
                let passwordToSave = (response && response.password) ? response.password : currentPassword;

                if (!passwordToSave) {
                    showFeedback("Lütfen parola üretin veya sayfada girin.", true);
                    return;
                }

                saveFeedback.textContent = "Güvenlik kontrolü yapılıyor...";
                saveFeedback.style.color = "#555";
                saveFeedback.style.display = "block";

                const risk = await BreachService.getPasswordRisk(passwordToSave);

                if (risk.breached) {
                    const confirmed = confirm(`DİKKAT! Bu şifre veri sızıntılarında ${risk.breachCount} kez açığa çıkmış (ÇALINMIŞ!). Yinede kaydetmek istiyor musunuz?`);
                    if (!confirmed) {
                        saveFeedback.style.display = "none";
                        return;
                    }
                } else if (risk.status === "weak") {
                    console.warn("STRONGSEC: Şifre sızdırılmamış ancak zayıf!");
                }

                chrome.runtime.sendMessage({ action: 'encrypt', text: passwordToSave }, (res) => {
                    if (!res || !res.success) {
                        handleVaultExpired();
                        return;
                    }

                    const encryptedPassword = res.encrypted;

                    chrome.storage.local.get(cleanDomain, (resDomain) => {
                        let accounts = resDomain[cleanDomain] || [];
                        if (!Array.isArray(accounts)) accounts = [accounts];

                        accounts.push({
                            email: email,
                            password: encryptedPassword
                        });

                        let customData = {};
                        customData[cleanDomain] = accounts;

                        chrome.storage.local.set(customData, () => {
                            if (chrome.runtime.lastError) {
                                showFeedback("Hata oluştu.", true);
                            } else {
                                showFeedback(`${cleanDomain} için kaydedildi!`, false);
                                emailInput.value = "";
                                refreshSavedPasswords();
                            }
                        });
                    });
                });
            })();
        });
    });
});

async function renderSavedPasswords(storageData) {
    savedPasswordsList.innerHTML = '';
    let hasSavedPasswords = false;

    const internalKeys = ['autoMode', 'lastPassword', 'lastLength', 'vaultMeta'];

    for (const [domain, rawData] of Object.entries(storageData)) {
        if (internalKeys.includes(domain)) continue;

        let accounts = Array.isArray(rawData) ? rawData : [rawData];
        let domainNeedsMigration = !Array.isArray(rawData);

        let validAccountsList = [];

        for (let index = 0; index < accounts.length; index++) {
            let account = accounts[index];

            const res = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'decrypt', encryptedObj: account.password }, resolve);
            });

            if (!res || !res.success) {
                const checkRes = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'isVaultUnlocked' }, resolve));
                if (!checkRes || !checkRes.isUnlocked) {
                    handleVaultExpired();
                    return;
                }
                continue;
            }

            let decryptedPassword = res.decrypted;
            let finalPasswordObj = account.password;

            if (res.wasString) {
                const encRes = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: 'encrypt', text: decryptedPassword }, resolve);
                });
                if (encRes && encRes.success) {
                    finalPasswordObj = encRes.encrypted;
                    account.password = encRes.encrypted;
                    domainNeedsMigration = true;
                } else {
                    const checkRes = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'isVaultUnlocked' }, resolve));
                    if (!checkRes || !checkRes.isUnlocked) {
                        handleVaultExpired();
                        return;
                    }
                    continue;
                }
            }

            validAccountsList.push({
                originalIndex: index,
                email: account.email,
                passwordObj: finalPasswordObj,
                decryptedPassword: decryptedPassword
            });
        }

        if (domainNeedsMigration) {
            let updateData = {};
            updateData[domain] = accounts;
            chrome.storage.local.set(updateData);
        }

        if (validAccountsList.length === 0) continue;

        hasSavedPasswords = true;

        const domainContainer = document.createElement('div');
        domainContainer.className = 'domain-container';

        const domainHeader = document.createElement('div');
        domainHeader.className = 'domain-header';

        const domainTitle = document.createElement('div');
        domainTitle.className = 'domain-title';
        domainTitle.textContent = domain;

        const domainInfo = document.createElement('div');
        domainInfo.className = 'domain-info';

        const accountCountSpan = document.createElement('span');
        accountCountSpan.className = 'account-count';
        accountCountSpan.textContent = `${validAccountsList.length} hesap`;

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'arrow-icon';
        arrowSpan.innerHTML = '&#9654;'; // ▶

        domainInfo.appendChild(accountCountSpan);
        domainInfo.appendChild(arrowSpan);

        domainHeader.appendChild(domainTitle);
        domainHeader.appendChild(domainInfo);

        const accountsContainer = document.createElement('div');
        accountsContainer.className = 'accounts-container';
        accountsContainer.style.maxHeight = '0';
        accountsContainer.style.overflow = 'hidden';

        domainHeader.addEventListener('click', () => {
            const isActive = domainHeader.classList.contains('active');

            document.querySelectorAll('.domain-header').forEach(h => h.classList.remove('active'));
            document.querySelectorAll('.accounts-container').forEach(c => c.style.maxHeight = '0');

            if (!isActive) {
                domainHeader.classList.add('active');
                accountsContainer.style.maxHeight = accountsContainer.scrollHeight + 50 + "px";
            }
        });

        domainContainer.appendChild(domainHeader);
        domainContainer.appendChild(accountsContainer);

        validAccountsList.forEach((acc) => {
            const index = acc.originalIndex;
            const decryptedPassword = acc.decryptedPassword;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'saved-item';

            const normalView = document.createElement('div');
            normalView.className = 'saved-item-normal';

            const emailEl = document.createElement('div');
            emailEl.className = 'saved-email';
            emailEl.textContent = acc.email || 'Email/Kullanıcı adı yok';

            const passwordRow = document.createElement('div');
            passwordRow.className = 'saved-password-row';

            const passwordSpan = document.createElement('span');
            passwordSpan.textContent = "•".repeat(decryptedPassword.length);

            passwordRow.appendChild(passwordSpan);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'saved-item-actions';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-small btn-toggle';
            toggleBtn.textContent = 'Göster';
            let isVisible = false;

            toggleBtn.addEventListener('click', () => {
                isVisible = !isVisible;
                if (isVisible) {
                    passwordSpan.textContent = decryptedPassword;
                    toggleBtn.textContent = 'Gizle';
                } else {
                    passwordSpan.textContent = "•".repeat(decryptedPassword.length);
                    toggleBtn.textContent = 'Göster';
                }
            });

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-small btn-edit';
            editBtn.textContent = 'Düzenle';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-small btn-delete';
            deleteBtn.textContent = 'Sil';

            deleteBtn.addEventListener('click', () => {
                if (confirm(`${domain} için kayıtlı hesabı silmek istediğinize emin misiniz?`)) {
                    chrome.storage.local.get(domain, (result) => {
                        let currentAccounts = result[domain];
                        if (!Array.isArray(currentAccounts)) currentAccounts = [currentAccounts];
                        currentAccounts.splice(index, 1);
                        if (currentAccounts.length === 0) {
                            chrome.storage.local.remove(domain, () => refreshSavedPasswords());
                        } else {
                            chrome.storage.local.set({ [domain]: currentAccounts }, () => refreshSavedPasswords());
                        }
                    });
                }
            });

            actionsDiv.appendChild(toggleBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);

            normalView.appendChild(emailEl);
            normalView.appendChild(passwordRow);
            normalView.appendChild(actionsDiv);

            const editView = document.createElement('div');
            editView.className = 'saved-item-edit';
            editView.style.display = 'none';

            const emailInputEdit = document.createElement('input');
            emailInputEdit.type = 'text';
            emailInputEdit.className = 'edit-input';
            emailInputEdit.value = acc.email || '';
            emailInputEdit.placeholder = 'Yeni e-posta/kullanıcı adı';

            const passwordInputEdit = document.createElement('input');
            passwordInputEdit.type = 'text';
            passwordInputEdit.className = 'edit-input edit-password';
            passwordInputEdit.value = decryptedPassword;
            passwordInputEdit.placeholder = 'Yeni parola';

            const editRiskBadge = document.createElement('div');
            editRiskBadge.style.fontSize = '12px';
            editRiskBadge.style.marginTop = '4px';
            editRiskBadge.style.marginBottom = '6px';
            editRiskBadge.style.fontWeight = 'bold';

            passwordInputEdit.addEventListener('input', async (e) => {
                const val = e.target.value.trim();
                if (!val) {
                    editRiskBadge.textContent = '';
                    return;
                }
                editRiskBadge.textContent = 'Kontrol ediliyor...';
                editRiskBadge.style.color = '#555';
                const risk = await BreachService.getPasswordRisk(val);
                if (risk.status === 'breached') {
                    editRiskBadge.textContent = risk.message;
                    editRiskBadge.style.color = '#d32f2f';
                } else if (risk.status === 'weak') {
                    editRiskBadge.textContent = risk.message;
                    editRiskBadge.style.color = '#ff9800';
                } else {
                    editRiskBadge.textContent = risk.message;
                    editRiskBadge.style.color = '#4caf50';
                }
            });

            const editActionsDiv = document.createElement('div');
            editActionsDiv.className = 'saved-item-actions';

            const saveEditBtn = document.createElement('button');
            saveEditBtn.className = 'btn-small btn-save-edit';
            saveEditBtn.textContent = 'Kaydet';

            const cancelEditBtn = document.createElement('button');
            cancelEditBtn.className = 'btn-small btn-cancel';
            cancelEditBtn.textContent = 'İptal';

            editBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'isVaultUnlocked' }, (checkRes) => {
                    if (!checkRes || !checkRes.isUnlocked) {
                        handleVaultExpired();
                        return;
                    }

                    const allEditViews = document.querySelectorAll('.saved-item-edit');
                    const allNormalViews = document.querySelectorAll('.saved-item-normal');
                    allEditViews.forEach(v => v.style.display = 'none');
                    allNormalViews.forEach(v => v.style.display = 'block');
                    document.querySelectorAll('.saved-item').forEach(el => el.classList.remove('edit-mode'));

                    normalView.style.display = 'none';
                    editView.style.display = 'block';
                    itemDiv.classList.add('edit-mode');

                    emailInputEdit.value = acc.email || '';
                    passwordInputEdit.value = decryptedPassword;

                    accountsContainer.style.maxHeight = accountsContainer.scrollHeight + 50 + "px";
                });
            });

            cancelEditBtn.addEventListener('click', () => {
                editView.style.display = 'none';
                normalView.style.display = 'block';
                itemDiv.classList.remove('edit-mode');
            });

            saveEditBtn.addEventListener('click', () => {
                const newEmail = emailInputEdit.value.trim();
                const newPassword = passwordInputEdit.value.trim();

                if (!newEmail || !newPassword) {
                    alert('E-posta ve parola alanları boş bırakılamaz!');
                    return;
                }

                (async () => {
                    saveEditBtn.textContent = 'Analiz...';
                    saveEditBtn.disabled = true;

                    const risk = await BreachService.getPasswordRisk(newPassword);
                    if (risk.breached) {
                        const confirmed = confirm(`DİKKAT! Bu şifre veri sızıntılarında ${risk.breachCount} kez açığa çıkmış. Yine de kaydetmek istiyor musunuz?`);
                        if (!confirmed) {
                            saveEditBtn.textContent = 'Kaydet';
                            saveEditBtn.disabled = false;
                            return;
                        }
                    } else if (risk.status === "weak") {
                        console.warn("STRONGSEC: Şifre sızdırılmamış ancak zayıf!");
                    }

                    saveEditBtn.textContent = 'Kaydet';
                    saveEditBtn.disabled = false;

                    chrome.runtime.sendMessage({ action: 'encrypt', text: newPassword }, (resEnc) => {
                        if (!resEnc || !resEnc.success) {
                            handleVaultExpired();
                            return;
                        }

                        chrome.storage.local.get(domain, (result) => {
                            let currentAccounts = result[domain];
                            if (!Array.isArray(currentAccounts)) currentAccounts = [currentAccounts];
                            currentAccounts[index] = {
                                email: newEmail,
                                password: resEnc.encrypted
                            };
                            chrome.storage.local.set({ [domain]: currentAccounts }, () => refreshSavedPasswords());
                        });
                    });
                })();
            });

            editActionsDiv.appendChild(saveEditBtn);
            editActionsDiv.appendChild(cancelEditBtn);

            editView.appendChild(emailInputEdit);
            editView.appendChild(passwordInputEdit);
            editView.appendChild(editRiskBadge);
            editView.appendChild(editActionsDiv);

            itemDiv.appendChild(normalView);
            itemDiv.appendChild(editView);

            accountsContainer.appendChild(itemDiv);
        });

        savedPasswordsList.appendChild(domainContainer);
    }

    if (hasSavedPasswords) {
        savedPasswordsList.style.display = 'block';
        emptySavedMessage.style.display = 'none';
    } else {
        savedPasswordsList.style.display = 'none';
        emptySavedMessage.style.display = 'block';
    }
}

function refreshSavedPasswords() {
    chrome.storage.local.get(null, (result) => {
        renderSavedPasswords(result);
    });
}

// --- SCAN ALL PASSWORDS ---

const scanAllBtn = document.getElementById("scanAllBtn");
const scanResultsContainer = document.getElementById("scanResultsContainer");
const scanLoadingText = document.getElementById("scanLoadingText");
const scanSummary = document.getElementById("scanSummary");
const scanList = document.getElementById("scanList");

if (scanAllBtn) {
    scanAllBtn.addEventListener("click", () => {
        scanAllBtn.disabled = true;
        scanAllBtn.textContent = "Taranıyor...";
        scanAllBtn.style.backgroundColor = "#999";

        scanResultsContainer.style.display = "block";
        scanLoadingText.style.display = "block";
        scanSummary.style.display = "none";
        scanList.style.display = "none";
        scanList.innerHTML = "";
        scanSummary.innerHTML = "";

        chrome.runtime.sendMessage({ action: "scanAllPasswords" }, (res) => {
            scanAllBtn.disabled = false;
            scanAllBtn.textContent = "Tüm Şifreleri Tara";
            scanAllBtn.style.backgroundColor = "#0277bd";
            scanLoadingText.style.display = "none";

            if (!res || !res.success) {
                scanSummary.style.display = "block";
                scanSummary.innerHTML = `<span style="color:#d32f2f;">Tarama başarısız: ${res?.error || "Bilinmeyen hata"}</span>`;
                return;
            }

            const reports = res.report || [];
            if (reports.length === 0) {
                scanSummary.style.display = "block";
                scanSummary.textContent = "Taranacak parola bulunamadı.";
                return;
            }

            let breached = 0;
            let weak = 0;
            let safe = 0;
            let reused = 0;

            reports.forEach(r => {
                if (r.risk.status === "breached") breached++;
                else if (r.risk.status === "weak") weak++;
                else safe++;

                if (r.reused) reused++;
            });

            scanSummary.style.display = "block";
            scanSummary.innerHTML = `
                Toplam: ${reports.length} | 
                <span style="color:#d32f2f">Sızdırılmış: ${breached}</span> | 
                <span style="color:#ff9800">Zayıf: ${weak}</span> | 
                <span style="color:#4caf50">Güvenli: ${safe}</span><br/>
                <span style="color:#ef6c00; font-size:12px;">Tekrar kullanılan parola içeren kayıt: ${reused}</span>
            `;

            if (reports.length > 0) {
                scanList.style.display = "block";
                reports.forEach(r => {
                    const item = document.createElement("div");
                    item.style.borderBottom = "1px solid #ddd";
                    item.style.padding = "5px 0";
                    item.style.marginBottom = "5px";

                    let color = "#4caf50";
                    let countText = "";
                    if (r.risk.status === "breached") {
                        color = "#d32f2f";
                        countText = r.risk.breachCount !== undefined
                            ? `(${r.risk.breachCount} kez)`
                            : "";
                    } else if (r.risk.status === "weak") {
                        color = "#ff9800";
                    }

                    let reuseBadge = "";
                    if (r.reused) {
                        reuseBadge = `<div style="color:#ef6c00; font-size:12px; margin-top:3px; font-weight:bold;">Tekrar kullanılan parola (${r.reuseCount} kayıt)</div>`;
                    }

                    item.innerHTML = `
                        <div style="font-weight:bold;">${r.domain}</div>
                        <div style="font-size:11px; color:#555;">${r.email || "Email yok"}</div>
                        <div style="color:${color}; font-size:12px; margin-top:3px;">
                            ${r.risk.message} ${countText}
                        </div>
                        ${reuseBadge}
                    `;
                    scanList.appendChild(item);
                });
            }
        });
    });
}

// --- AUTHENTICATION / VAULT LOCK ---

function showAuthError(el, msg) {
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 3000);
}

function handleVaultExpired() {
    mainContainer.style.display = "none";
    currentPassword = "";
    updateDisplay();
    savedPasswordsList.innerHTML = '';

    unlockContainer.style.display = "block";
    showAuthError(unlockError, "Vault oturumu sona erdi. Lütfen tekrar açın.");
}

function checkAndShowAuth() {
    chrome.storage.local.get(['vaultMeta'], (result) => {
        if (result.vaultMeta && result.vaultMeta.isSetup) {
            setupContainer.style.display = "none";
            unlockContainer.style.display = "block";
            unlockPassword.focus();
        } else {
            unlockContainer.style.display = "none";
            setupContainer.style.display = "block";
            setupPassword.focus();
        }
    });
}

function initAuth() {
    // Önce SW'a sor: key bellekte var mı? (port sayesinde SW canlı olmalı)
    chrome.runtime.sendMessage({ action: 'isVaultUnlocked' }, (res) => {
        if (res && res.isUnlocked) {
            // SW key'e sahip — direkt ana ekran
            setupContainer.style.display = "none";
            unlockContainer.style.display = "none";
            mainContainer.style.display = "block";
            initializeApp();
            chrome.storage.local.remove('lastPassword');
            return;
        }

        // SW'da key yok. Session flag'a bak:
        chrome.storage.session.get(['vaultUnlocked'], (sessionData) => {
            if (sessionData.vaultUnlocked) {
                // Flag true ama key yok = SW öldü, session stale.
                // Güvenlik: stale flag'ı temizle, auth iste.
                clearSessionUnlocked_popup();
            }
            // Her iki durumda da auth ekranını göster
            checkAndShowAuth();
        });
    });
}

// Popup tarafından stale session flag temizleme
function clearSessionUnlocked_popup() {
    chrome.storage.session.remove(['vaultUnlocked']);
}

setupBtn.addEventListener("click", () => {
    const pw = setupPassword.value;
    const confirmPw = setupConfirmPassword.value;

    if (pw.length < 6) {
        showAuthError(setupError, "Parola en az 6 karakter olmalıdır.");
        return;
    }
    if (pw !== confirmPw) {
        showAuthError(setupError, "Parolalar eşleşmiyor.");
        return;
    }

    chrome.runtime.sendMessage({ action: 'setupVault', masterPassword: pw }, (res) => {
        if (res && res.success) {
            setupContainer.style.display = "none";
            mainContainer.style.display = "block";
            setupPassword.value = '';
            setupConfirmPassword.value = '';
            initializeApp();
        } else {
            showAuthError(setupError, "Vault oluşturulamadı: " + (res?.error || "Bilinmeyen hata"));
        }
    });
});

unlockBtn.addEventListener("click", () => {
    const pw = unlockPassword.value;

    chrome.runtime.sendMessage({ action: 'unlockVault', masterPassword: pw }, (res) => {
        if (res && res.success) {
            unlockContainer.style.display = "none";
            mainContainer.style.display = "block";
            unlockPassword.value = '';
            initializeApp();

            chrome.storage.local.remove('lastPassword');
        } else {
            showAuthError(unlockError, res?.error || "Yanlış parola.");
        }
    });
});

lockVaultBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: 'lockVault' }, (res) => {
        mainContainer.style.display = "none";

        currentPassword = "";
        updateDisplay();
        savedPasswordsList.innerHTML = '';

        checkAndShowAuth();
    });
});

resetVaultBtn.addEventListener("click", () => {
    if (confirm("Bu işlem tüm kayıtlı şifreleri kalıcı olarak siler ve vault'u sıfırlar. Devam etmek istiyor musunuz?")) {
        chrome.runtime.sendMessage({ action: 'resetVault' }, (res) => {
            if (res && res.success) {
                unlockPassword.value = '';
                unlockError.style.display = "none";
                checkAndShowAuth();
            } else {
                showAuthError(unlockError, "Sıfırlama işlemi başarısız: " + (res?.error || "Bilinmeyen hata"));
            }
        });
    }
});

changeMasterPwBtn.addEventListener("click", () => {
    const curPw = currentMasterPw.value;
    const newPw = newMasterPw.value;
    const confirmNewPw = confirmNewMasterPw.value;

    if (!curPw || !newPw || !confirmNewPw) {
        changeMasterPwMsg.textContent = "Lütfen tüm alanları doldurun.";
        changeMasterPwMsg.style.color = "#d32f2f";
        changeMasterPwMsg.style.display = "block";
        setTimeout(() => changeMasterPwMsg.style.display = "none", 3000);
        return;
    }

    if (newPw.length < 6) {
        changeMasterPwMsg.textContent = "Yeni parola en az 6 karakter olmalıdır.";
        changeMasterPwMsg.style.color = "#d32f2f";
        changeMasterPwMsg.style.display = "block";
        setTimeout(() => changeMasterPwMsg.style.display = "none", 3000);
        return;
    }

    if (newPw !== confirmNewPw) {
        changeMasterPwMsg.textContent = "Yeni parolalar eşleşmiyor.";
        changeMasterPwMsg.style.color = "#d32f2f";
        changeMasterPwMsg.style.display = "block";
        setTimeout(() => changeMasterPwMsg.style.display = "none", 3000);
        return;
    }

    changeMasterPwMsg.textContent = "İşleniyor...";
    changeMasterPwMsg.style.color = "#000";
    changeMasterPwMsg.style.display = "block";

    chrome.runtime.sendMessage({
        action: 'changeMasterPassword',
        currentPw: curPw,
        newPw: newPw
    }, (res) => {
        if (res && res.success) {
            currentMasterPw.value = '';
            newMasterPw.value = '';
            confirmNewMasterPw.value = '';
            changeMasterPwMsg.textContent = "Ana parolanız başarıyla değiştirildi!";
            changeMasterPwMsg.style.color = "#388e3c";
            setTimeout(() => changeMasterPwMsg.style.display = "none", 3000);
        } else {
            changeMasterPwMsg.textContent = "Hata: " + (res?.error || "Bilinmeyen hata");
            changeMasterPwMsg.style.color = "#d32f2f";
            setTimeout(() => changeMasterPwMsg.style.display = "none", 3000);
        }
    });
});

unlockPassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") unlockBtn.click();
});
setupConfirmPassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") setupBtn.click();
});
setupPassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") setupConfirmPassword.focus();
});

// START AUTH CHECK
initAuth();

// --- ACCORDION ---
(function () {
    const sections = document.querySelectorAll('.accordion-section');

    function openSection(section) {
        const body = section.querySelector('.accordion-body');
        section.classList.add('active');
        body.style.maxHeight = body.scrollHeight + 'px';
        // After animation: remove cap so inner dynamic content (saved list, domain items) grows freely
        body.addEventListener('transitionend', function onEnd() {
            if (section.classList.contains('active')) {
                body.style.maxHeight = 'none';
            }
            body.removeEventListener('transitionend', onEnd);
        });
    }

    function closeSection(section) {
        const body = section.querySelector('.accordion-body');
        // If max-height is 'none', snapshot concrete px first to enable transition
        if (!body.style.maxHeight || body.style.maxHeight === 'none') {
            body.style.maxHeight = body.scrollHeight + 'px';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                section.classList.remove('active');
                body.style.maxHeight = '0';
            }));
        } else {
            section.classList.remove('active');
            body.style.maxHeight = '0';
        }
    }

    function initAccordion() {
        sections.forEach(section => {
            const body = section.querySelector('.accordion-body');
            // Set initial heights
            body.style.maxHeight = section.classList.contains('active') ? 'none' : '0';

            section.querySelector('.accordion-header').addEventListener('click', () => {
                const isActive = section.classList.contains('active');
                // Close all other open sections (classic accordion)
                sections.forEach(s => {
                    if (s !== section && s.classList.contains('active')) {
                        closeSection(s);
                    }
                });
                // Toggle clicked section
                isActive ? closeSection(section) : openSection(section);
            });
        });
    }

    // Wait for mainContainer to become visible before initializing
    // (scrollHeight is 0 while parent is display:none)
    const observer = new MutationObserver(() => {
        if (mainContainer.style.display === 'block') {
            observer.disconnect();
            initAccordion();
        }
    });
    observer.observe(mainContainer, { attributes: true, attributeFilter: ['style'] });
})();