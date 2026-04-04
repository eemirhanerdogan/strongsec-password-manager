// content.js'nin anlık olarak parolalar oluşturabilmesi için generatePassword'ü burada uyguluyoruz
function generateStrongPassword(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
    let password = "";
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        password += chars[randomValues[i] % chars.length];
    }
    return password;
}

// Tüm geçerli parola alanlarını bulup senkronize etmek için yardımcı fonksiyon
function getSyncPasswordFields(targetElement) {
    const container = targetElement.closest('form') || targetElement.closest('div.form-group, div.signup, section') || targetElement.parentElement;
    let fields = [];

    if (container) {
        const allPasswords = container.querySelectorAll('input[type="password"]');
        allPasswords.forEach(pw => {
            if (!pw.disabled && !pw.readOnly) {
                const rect = pw.getBoundingClientRect();
                const style = window.getComputedStyle(pw);
                if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                    fields.push(pw);
                }
            }
        });
    }

    // Yakalanmadıysa hedef elementi her zaman dahil et
    if (!fields.includes(targetElement)) {
        fields.unshift(targetElement);
    }

    // Sadece en fazla 2 alanı doldurmak istiyoruz (Parola ve Parolayı Onayla)
    return fields.slice(0, 2);
}

function getLatestPagePassword() {
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.type === 'password' && active.value) {
        return active.value;
    }
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    for (let input of passwordInputs) {
        const rect = input.getBoundingClientRect();
        const style = window.getComputedStyle(input);
        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && input.value) {
            return input.value;
        }
    }
    return null;
}

// 1. Popup'tan gelen mevcut manuel doldurma mantığı
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fillPassword") {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        for (let input of passwordInputs) {
            const rect = input.getBoundingClientRect();
            const style = window.getComputedStyle(input);
            const isVisible = (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none'
            );
            if (isVisible) {
                input.value = request.password;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
    } else if (request.action === "forceFill") {
        // Aktif elementi bul, yoksa ilk görünür parola alanına geç
        const active = document.activeElement;
        let targetField = null;

        if (active && active.tagName === 'INPUT' && active.type === 'password') {
            targetField = active;
        } else {
            const passwordInputs = document.querySelectorAll('input[type="password"]');
            for (let input of passwordInputs) {
                const rect = input.getBoundingClientRect();
                const style = window.getComputedStyle(input);
                if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                    targetField = input;
                    break;
                }
            }
        }

        if (targetField) {
            const fieldsToFill = getSyncPasswordFields(targetField);
            fieldsToFill.forEach(field => {
                field.value = request.password;
                field.dataset.strongsecFilled = "true";
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
    } else if (request.action === "getCurrentPagePassword") {
        sendResponse({ password: getLatestPagePassword() });
    }
});

// 2. Yeni Otomatik İşlevsellik
function isSignUpForm(inputElement) {
    let score = 0;

    const currentUrl = window.location.href.toLowerCase();
    const urlSignUpKw = ['register', 'signup', 'sign-up', 'kayit', 'kayıt', 'uyelik', 'üyelik', 'hesap-olustur', 'hesap-olusturun', 'create-account', 'join'];
    const urlLoginKw = ['login', 'signin', 'sign-in', 'giris', 'oturum-ac'];

    if (urlSignUpKw.some(kw => currentUrl.includes(kw))) score += 5;
    if (urlLoginKw.some(kw => currentUrl.includes(kw))) score -= 5;

    const autocomplete = (inputElement.getAttribute('autocomplete') || "").toLowerCase();
    if (autocomplete === "new-password") score += 10;
    if (autocomplete === "current-password") score -= 10;

    const name = (inputElement.getAttribute('name') || "").toLowerCase();
    const id = (inputElement.getAttribute('id') || "").toLowerCase();
    const placeholder = (inputElement.getAttribute('placeholder') || "").toLowerCase();
    const ariaLabel = (inputElement.getAttribute('aria-label') || "").toLowerCase();
    const allAttr = `${name} ${id} ${placeholder} ${ariaLabel}`;

    const signUpKeywords = ['new', 'register', 'confirm', 'signup', 'yeni', 'tekrar', 'create'];
    const loginKeywords = ['current', 'login', 'signin', 'mevcut', 'eski', 'old'];

    if (signUpKeywords.some(kw => allAttr.includes(kw))) score += 2;
    if (loginKeywords.some(kw => allAttr.includes(kw))) score -= 2;

    const container = inputElement.closest('form') || inputElement.closest('div.form-group, div.signup, section') || inputElement.parentElement;

    let visiblePasswordCount = 0;

    const allPasswords = container.querySelectorAll('input[type="password"]');
    allPasswords.forEach(pw => {
        if (!pw.disabled && !pw.readOnly) {
            const rect = pw.getBoundingClientRect();
            const style = window.getComputedStyle(pw);
            const isVisible = (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none'
            );

            if (isVisible) visiblePasswordCount++;
        }
    });

    if (visiblePasswordCount >= 2) score += 5;

    const containerText = container.innerText.toLowerCase();
    const textSignUpKw = ['hesap oluştur', 'hesap oluşturun', 'kayıt ol', 'üye ol', 'üyelik', 'şifre oluştur', 'parola oluştur', 'sign up', 'register', 'create account'];
    const textLoginKw = ['giriş yap', 'oturum aç', 'sign in', 'log in', 'log-in', 'signin'];

    if (textSignUpKw.some(kw => containerText.includes(kw))) score += 4;
    if (textLoginKw.some(kw => containerText.includes(kw))) score -= 5;

    return score >= 4;
}

function handlePasswordInputInteraction(event) {
    const target = event.target;

    if (target && target.tagName === 'INPUT' && target.type === 'password') {
        if (target.dataset.strongsecFilled === "true" && target.value.length > 0) return;

        chrome.storage.local.get(['autoMode'], (result) => {
            if (result.autoMode) {
                if (!isSignUpForm(target)) {
                    return;
                }

                const newPassword = generateStrongPassword(16);
                const fieldsToFill = getSyncPasswordFields(target);

                fieldsToFill.forEach(field => {
                    field.value = newPassword;
                    field.dataset.strongsecFilled = "true";
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        });
    }
}

document.addEventListener('focusin', handlePasswordInputInteraction);
document.addEventListener('click', handlePasswordInputInteraction);


// ==============================================================================
// 3. Phase 2 Step 3: Autofill Suggestion Logic for Saved Passwords
// ==============================================================================

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

let dismissedForSession = false;
let emailFilledForSession = false;
let passwordFilledForSession = false;

function findEmailOrUsernameField(container) {
    const selectors = [
        'input[type="email"]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[id*="email" i]',
        'input[id*="user" i]',
        'input[type="text"]'
    ];

    for (const selector of selectors) {
        let inputs = container ? container.querySelectorAll(selector) : document.querySelectorAll(selector);
        for (let input of inputs) {
            if (!input.disabled && !input.readOnly) {
                const rect = input.getBoundingClientRect();
                const style = window.getComputedStyle(input);
                if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                    return input;
                }
            }
        }
    }
    return null;
}

function showAutofillSuggestion(savedDataArray, type, targetInput) {
    if (dismissedForSession || !targetInput || !savedDataArray || savedDataArray.length === 0) return;

    let container = document.getElementById('strongsec-autofill-suggestion');
    if (container) {
        if (container.dataset.suggestionType === type && container._targetInput === targetInput) return;

        if (container._updatePos) {
            window.removeEventListener('scroll', container._updatePos, true);
            window.removeEventListener('resize', container._updatePos, true);
        }
        if (container._targetInput && container._blurListener) {
            container._targetInput.removeEventListener('blur', container._blurListener);
        }
        if (container._blurTimeout) {
            clearTimeout(container._blurTimeout);
        }
        container.remove();
    }

    container = document.createElement('div');
    container.id = 'strongsec-autofill-suggestion';
    container.dataset.suggestionType = type;

    Object.assign(container.style, {
        position: 'absolute',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        padding: '12px 14px',
        zIndex: '2147483647',
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        fontSize: '13px',
        color: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxSizing: 'border-box'
    });

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';

    const logoImg = document.createElement('img');
    logoImg.src = chrome.runtime.getURL('icons/icon32.png');
    Object.assign(logoImg.style, {
        width: '20px',
        height: '20px',
        objectFit: 'contain'
    });

    const brandName = document.createElement('span');
    Object.assign(brandName.style, {
        fontWeight: '800',
        color: '#4f46e5',
        fontSize: '11px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase'
    });
    brandName.textContent = 'STRONGSEC';

    header.appendChild(logoImg);
    header.appendChild(brandName);

    const headWrap = document.createElement('div');
    headWrap.style.display = 'flex';
    headWrap.style.justifyContent = 'space-between';
    headWrap.style.alignItems = 'center';
    headWrap.style.paddingBottom = '10px';
    headWrap.style.borderBottom = '1px solid #e2e8f0';
    headWrap.style.marginBottom = '4px';
    headWrap.appendChild(header);

    const textWrap = document.createElement('div');
    textWrap.style.display = 'flex';
    textWrap.style.flexDirection = 'column';
    textWrap.style.gap = '6px';

    const textInfo = document.createElement('div');
    Object.assign(textInfo.style, {
        fontSize: '12px',
        fontWeight: '600',
        color: '#64748b',
        marginBottom: '2px'
    });
    textInfo.textContent = savedDataArray.length === 1 ?
        (type === 'password' ? 'Kayıtlı hesap bulundu:' : 'E-posta bilgisi bulundu:')
        : 'Kayıtlı hesaplar:';

    textWrap.appendChild(textInfo);

    function cleanupEvents() {
        if (container._updatePos) {
            window.removeEventListener('scroll', container._updatePos, true);
            window.removeEventListener('resize', container._updatePos, true);
        }
        if (container._targetInput && container._blurListener) {
            container._targetInput.removeEventListener('blur', container._blurListener);
        }
        if (container._blurTimeout) {
            clearTimeout(container._blurTimeout);
        }
        if (container.parentNode) container.remove();
    }

    function fillAccountData(data) {
        const emailField = findEmailOrUsernameField(document);
        let targetPasswordField = null;
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        for (let pw of passwordInputs) {
            const rect = pw.getBoundingClientRect();
            const style = window.getComputedStyle(pw);
            if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                targetPasswordField = pw;
                break;
            }
        }

        if (type === 'email') {
            if (emailField && data.email) {
                emailField.value = data.email;
                emailField.dispatchEvent(new Event('input', { bubbles: true }));
                emailField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            emailFilledForSession = true;
        } else {
            if (emailField && data.email) {
                emailField.value = data.email;
                emailField.dispatchEvent(new Event('input', { bubbles: true }));
                emailField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (targetPasswordField && data.password) {
                targetPasswordField.value = data.password;
                targetPasswordField.dispatchEvent(new Event('input', { bubbles: true }));
                targetPasswordField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            passwordFilledForSession = true;
        }
        cleanupEvents();
    }

    savedDataArray.forEach((data, index) => {
        const rowBtn = document.createElement('button');
        Object.assign(rowBtn.style, {
            width: '100%',
            padding: '8px 10px',
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: '600',
            color: '#1e293b',
            fontFamily: "inherit",
            transition: 'background 0.15s, border-color 0.15s'
        });

        rowBtn.textContent = data.email || `Kayıtlı hesap ${index + 1}`;

        rowBtn.addEventListener('mouseenter', () => {
            rowBtn.style.backgroundColor = '#ede9fe';
            rowBtn.style.borderColor = '#4f46e5';
        });
        rowBtn.addEventListener('mouseleave', () => {
            rowBtn.style.backgroundColor = '#f8fafc';
            rowBtn.style.borderColor = '#e2e8f0';
        });

        rowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fillAccountData(data);
        });

        textWrap.appendChild(rowBtn);
    });

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.marginTop = '4px';

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'İptal';
    Object.assign(dismissBtn.style, {
        flex: '1',
        padding: '7px 10px',
        backgroundColor: 'transparent',
        color: '#64748b',
        border: '1.5px solid #e2e8f0',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600',
        fontFamily: 'inherit',
        transition: 'background 0.15s'
    });

    dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.backgroundColor = '#f1f5f9');
    dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.backgroundColor = 'transparent');
    dismissBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanupEvents();
        dismissedForSession = true;
    });

    btnContainer.appendChild(dismissBtn);

    container.appendChild(headWrap);
    container.appendChild(textWrap);
    container.appendChild(btnContainer);

    function updatePosition() {
        if (!document.body.contains(targetInput) || !document.body.contains(container)) {
            cleanupEvents();
            return;
        }

        const rect = targetInput.getBoundingClientRect();
        const style = window.getComputedStyle(targetInput);

        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') {
            container.style.display = 'none';
        } else {
            container.style.display = 'flex';
            container.style.top = `${window.scrollY + rect.bottom + 6}px`;
            container.style.left = `${window.scrollX + rect.left}px`;
            container.style.width = `${Math.max(220, Math.min(rect.width, 350))}px`;
        }
    }

    container._updatePos = updatePosition;
    container._targetInput = targetInput;

    const handleBlur = () => {
        container._blurTimeout = setTimeout(() => {
            cleanupEvents();
        }, 200);
    };
    container._blurListener = handleBlur;

    targetInput.addEventListener('blur', handleBlur);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition, true);

    try {
        if (!window.__strongsecSuggestionDestroyed && isExtensionAlive()) {
            document.body.appendChild(container);
            updatePosition();
        }
    } catch (e) {
        window.__strongsecSuggestionDestroyed = true;
        cleanupEvents();
    }
}

function isExtensionAlive() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

// Storage'dan kayıtları kontrol edip uygunsa öneriyi gösterir
function checkAndShowSuggestion() {
    if (window.__strongsecSuggestionDestroyed || !isExtensionAlive()) {
        window.__strongsecSuggestionDestroyed = true;
        return;
    }
    if (dismissedForSession) return;

    const hostname = getCleanHostname(window.location.href);
    if (!hostname) return;

    try {
        chrome.storage.local.get(hostname, (result) => {
            if (chrome.runtime.lastError || !isExtensionAlive()) return;

            if (result && result[hostname]) {
                let accounts = Array.isArray(result[hostname]) ? result[hostname] : [result[hostname]];

                if (accounts.length === 0) return;

                if (!isExtensionAlive()) return;

                try {
                    // Promise.all kullanarak tüm account şifrelerini paralel deşifre edelim
                    Promise.all(accounts.map(acc => {
                        return new Promise(resolve => {
                            chrome.runtime.sendMessage({ action: 'decrypt', encryptedObj: acc.password }, (res) => {
                                if (chrome.runtime.lastError || !isExtensionAlive() || !res || !res.success) {
                                    resolve(null);
                                } else {
                                    // Orjinal nesne referansını bozmamak için deşifre edilmiş kopyayı olusturalim
                                    resolve({ ...acc, password: res.decrypted });
                                }
                            });
                        });
                    })).then(decryptedAccounts => {
                        decryptedAccounts = decryptedAccounts.filter(a => a !== null);

                        if (decryptedAccounts.length === 0 || !isExtensionAlive()) return;

                        const passwordInputs = document.querySelectorAll('input[type="password"]');
                        let hasVisiblePw = false;
                        let targetPwField = null;
                        for (let pw of passwordInputs) {
                            const rect = pw.getBoundingClientRect();
                            const style = window.getComputedStyle(pw);
                            if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                                hasVisiblePw = true;
                                targetPwField = pw;
                                break;
                            }
                        }

                        const emailField = findEmailOrUsernameField(document);
                        const hasVisibleEmail = emailField !== null;

                        // Burada decryptedAccounts ARRAY'i parametreye geçilir
                        if (hasVisiblePw && !passwordFilledForSession) {
                            showAutofillSuggestion(decryptedAccounts, 'password', targetPwField);
                        } else if (hasVisibleEmail && !hasVisiblePw && !emailFilledForSession) {
                            showAutofillSuggestion(decryptedAccounts, 'email', emailField);
                        }
                    });
                } catch (e) {
                    window.__strongsecSuggestionDestroyed = true;
                }
            }
        });
    } catch (e) {
        window.__strongsecSuggestionDestroyed = true;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndShowSuggestion);
} else {
    checkAndShowSuggestion();
}

const observer = new MutationObserver((mutations) => {
    if (window.__strongsecSuggestionDestroyed || !isExtensionAlive()) {
        observer.disconnect();
        if (window.suggestionCheckTimeout) clearTimeout(window.suggestionCheckTimeout);
        return;
    }

    if (!dismissedForSession) {
        if (window.suggestionCheckTimeout) clearTimeout(window.suggestionCheckTimeout);
        window.suggestionCheckTimeout = setTimeout(() => {
            if (window.__strongsecSuggestionDestroyed || !isExtensionAlive()) return;
            checkAndShowSuggestion();
        }, 800);
    }
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

document.addEventListener('focusin', (e) => {
    if (dismissedForSession || window.__strongsecSuggestionDestroyed || !isExtensionAlive()) return;

    const target = e.target;
    if (target && target.tagName === 'INPUT') {
        const type = target.type.toLowerCase();
        const rect = target.getBoundingClientRect();
        const style = window.getComputedStyle(target);

        const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';

        if (isVisible && (type === 'email' || type === 'text' || type === 'tel' || type === 'password' || target.hasAttribute('autocomplete'))) {
            const existingContainer = document.getElementById('strongsec-autofill-suggestion');
            if (existingContainer && existingContainer._targetInput === target) {
                return;
            }

            if (window.suggestionCheckTimeout) clearTimeout(window.suggestionCheckTimeout);
            window.suggestionCheckTimeout = setTimeout(() => {
                if (window.__strongsecSuggestionDestroyed || !isExtensionAlive()) return;
                checkAndShowSuggestion();
            }, 50);
        }
    }
}, true);

// ==============================================================================
// 4. Phase 2 Step 4 & 6: Robust Automatic Save Suggestion After Form Submission
// ==============================================================================

let saveSuggestionInjected = false;
let saveSuggestionDismissed = false;

// YENİ EKLENEN GLOBAL STATE:
let lastTypedPassword = '';
let lastAuthForm = null;
let lastAuthTriggerTime = 0;

let sessionCredentials = {
    email: '',
    password: ''
};

function isPasswordInputField(target) {
    if (target.type === 'password') return true;
    if (target.dataset.strongsecFilled === "true") return true;
    return false;
}

document.addEventListener('input', (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'INPUT') return;

    if (isPasswordInputField(target)) {
        const val = target.value;
        lastTypedPassword = val;
        sessionCredentials.password = val;

        const formContainer = target.closest('form') || target.closest('div.form-group, div.signup, div.login, section') || document;
        const emailField = findEmailOrUsernameField(formContainer);
        if (emailField && emailField.value.trim().length > 0) {
            sessionCredentials.email = emailField.value.trim();
        }
    } else {
        const isLikelyEmail = (
            target.type === 'email' ||
            (target.getAttribute('autocomplete') && target.getAttribute('autocomplete').includes('email')) ||
            (target.getAttribute('autocomplete') && target.getAttribute('autocomplete').includes('username')) ||
            (target.name && /email|user|login/i.test(target.name)) ||
            (target.id && /email|user|login/i.test(target.id))
        );

        if (isLikelyEmail) {
            sessionCredentials.email = target.value.trim();
        }
    }
}, true);

document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'INPUT') return;

    if (isPasswordInputField(target)) {
        const val = target.value;
        lastTypedPassword = val;
        sessionCredentials.password = val;
    } else {
        const isLikelyEmail = (
            target.type === 'email' ||
            (target.getAttribute('autocomplete') && target.getAttribute('autocomplete').includes('email')) ||
            (target.getAttribute('autocomplete') && target.getAttribute('autocomplete').includes('username')) ||
            (target.name && /email|user|login/i.test(target.name)) ||
            (target.id && /email|user|login/i.test(target.id))
        );
        if (isLikelyEmail) {
            sessionCredentials.email = target.value.trim();
        }
    }
}, true);

function getLivePasswordFromForm(form) {
    if (!form) return null;
    const pws = Array.from(form.querySelectorAll('input[type="password"], input[data-strongsec-filled="true"]'));
    const validPws = pws.filter(pw => {
        if (pw.disabled || pw.readOnly) return false;
        const rect = pw.getBoundingClientRect();
        const style = window.getComputedStyle(pw);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && pw.value;
    });

    if (validPws.length === 0) return null;
    if (validPws.length === 1) return validPws[0].value;

    const confirmKeywords = ['confirm', 'tekrar', 'retype', 'repeat', 'verify'];

    for (let pw of validPws) {
        const nameAndId = ((pw.getAttribute('name') || '') + ' ' + (pw.getAttribute('id') || '')).toLowerCase();

        if (!confirmKeywords.some(kw => nameAndId.includes(kw))) {
            return pw.value;
        }
    }

    return validPws[0].value;
}

function resolveLatestPasswordForSave(fallbackPassword) {
    if (lastTypedPassword && lastTypedPassword.length > 0) {
        return lastTypedPassword;
    }

    const liveFromForm = getLivePasswordFromForm(lastAuthForm);
    if (liveFromForm && liveFromForm.length > 0) return liveFromForm;

    const latestPage = getLatestPagePassword();
    if (latestPage && latestPage.length > 0) return latestPage;

    if (sessionCredentials && sessionCredentials.password && sessionCredentials.password.length > 0) {
        return sessionCredentials.password;
    }

    return fallbackPassword;
}

// "Kaydet" öneri popup'ını çizer
function showSaveSuggestion(domain, email, password) {
    if (saveSuggestionInjected || saveSuggestionDismissed) return;
    if (!password || password.length === 0) return; // Şifre yoksa kesinlikle gösterme

    chrome.runtime.sendMessage({ action: 'isVaultUnlocked' }, (vRes) => {
        // Vault is locked/suspended. Do strictly not proceed with injection or capture
        if (!vRes || !vRes.isUnlocked) return;

        chrome.storage.local.get(domain, (result) => {
            let accounts = [];
            if (result && result[domain]) {
                accounts = Array.isArray(result[domain]) ? result[domain] : [result[domain]];
                if (email && accounts.some(acc => acc.email === email)) {
                    return; // Avoid duplicate prompt for this exact email
                }
            }

            saveSuggestionInjected = true;

            const container = document.createElement('div');
            container.id = 'strongsec-save-suggestion-prompt';

            Object.assign(container.style, {
                position: 'fixed',
                top: '16px',
                right: '16px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                padding: '16px',
                zIndex: '2147483647',
                fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
                fontSize: '13px',
                color: '#1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '290px',
                boxSizing: 'border-box'
            });

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';
            header.style.paddingBottom = '10px';
            header.style.borderBottom = '1px solid #e2e8f0';
            header.style.marginBottom = '4px';

            const logoImg = document.createElement('img');
            logoImg.src = chrome.runtime.getURL('icons/icon32.png');
            Object.assign(logoImg.style, {
                width: '20px',
                height: '20px',
                objectFit: 'contain'
            });

            const brandName = document.createElement('span');
            Object.assign(brandName.style, {
                fontWeight: '800',
                color: '#4f46e5',
                fontSize: '11px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
            });
            brandName.textContent = 'STRONGSEC';

            header.appendChild(logoImg);
            header.appendChild(brandName);

            const text = document.createElement('div');
            Object.assign(text.style, { fontSize: '13px', color: '#1e293b', lineHeight: '1.4', fontWeight: '500' });
            text.textContent = 'Giriş bilgilerinizi kaydetmek ister misiniz?';

            const emailText = document.createElement('div');
            Object.assign(emailText.style, {
                fontSize: '12px',
                color: '#64748b',
                wordBreak: 'break-all',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '6px 8px',
                fontWeight: '600'
            });
            emailText.textContent = email || 'Kullanıcı adı/E-posta boş';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '10px';
            btnContainer.style.marginTop = '5px';

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Kaydet';
            Object.assign(saveBtn.style, {
                flex: '1',
                padding: '8px 10px',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '12px',
                fontFamily: 'inherit',
                transition: 'background 0.15s'
            });
            saveBtn.addEventListener('mouseenter', () => saveBtn.style.backgroundColor = '#059669');
            saveBtn.addEventListener('mouseleave', () => saveBtn.style.backgroundColor = '#10b981');

            const dismissBtn = document.createElement('button');
            dismissBtn.textContent = 'İptal';
            Object.assign(dismissBtn.style, {
                flex: '1',
                padding: '8px 10px',
                backgroundColor: 'transparent',
                color: '#64748b',
                border: '1.5px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                fontWeight: '600',
                transition: 'background 0.15s'
            });
            dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.backgroundColor = '#f1f5f9');
            dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.backgroundColor = 'transparent');

            saveBtn.addEventListener('click', () => {
                const finalPassword = resolveLatestPasswordForSave(password);

                if (!finalPassword) {
                    container.remove();
                    saveSuggestionDismissed = true;
                    return;
                }

                // NO PLAINTEXT FALLBACK: Strict abort return if encryption fails
                chrome.runtime.sendMessage({ action: 'encrypt', text: finalPassword }, (resEnc) => {
                    if (!resEnc || !resEnc.success) {
                        alert("STRONGSEC: Lütfen önce vault kilidini açın.");
                        return;
                    }

                    chrome.storage.local.get(domain, (finalRes) => {
                        let finalAccounts = [];
                        if (finalRes && finalRes[domain]) {
                            finalAccounts = Array.isArray(finalRes[domain]) ? finalRes[domain] : [finalRes[domain]];
                        }
                        finalAccounts.push({ email: email, password: resEnc.encrypted });

                        chrome.storage.local.set({ [domain]: finalAccounts }, () => {
                            container.remove();
                            saveSuggestionDismissed = true;
                            sessionCredentials.password = '';
                            lastTypedPassword = ''; // Reset state
                        });
                    });
                });
            });

            dismissBtn.addEventListener('click', () => {
                container.remove();
                saveSuggestionDismissed = true;
            });

            btnContainer.appendChild(saveBtn);
            btnContainer.appendChild(dismissBtn);

            container.appendChild(header);
            container.appendChild(text);
            container.appendChild(emailText);
            container.appendChild(btnContainer);

            document.documentElement.appendChild(container);
        });
    });
}

function attemptToTriggerSaveSuggestion(targetElement) {
    if (saveSuggestionDismissed || saveSuggestionInjected) return;

    let isLikelyAuthAction = false;
    let authForm = null;

    if (targetElement && targetElement.tagName === 'FORM') {
        isLikelyAuthAction = true;
        authForm = targetElement;
    } else if (targetElement) {
        const btn = targetElement.closest('button, input[type="submit"], input[type="button"], a[role="button"], div[role="button"]');
        if (btn) {
            const btnText = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').toLowerCase();
            const btnClass = (btn.className || '').toLowerCase();
            const actionKeywords = ['login', 'sign in', 'signin', 'giriş', 'giris', 'sign up', 'signup', 'register', 'kayıt', 'kayit', 'create account', 'hesap', 'continue', 'devam', 'next', 'ileri', 'submit', 'gönder', 'proceed'];

            if (actionKeywords.some(kw => btnText.includes(kw) || btnClass.includes(kw))) {
                isLikelyAuthAction = true;
                authForm = btn.closest('form');
            }
        }
    }

    if (isLikelyAuthAction) {
        lastAuthForm = authForm;
        lastAuthTriggerTime = Date.now();

        // Delay slightly so that page values settle if auto-populated on submit
        setTimeout(() => {
            const latestPassword = resolveLatestPasswordForSave(null);
            const hostname = getCleanHostname(window.location.href);

            if (latestPassword && latestPassword.length > 0 && hostname) {
                // Ensure email is up to date too
                const emailField = findEmailOrUsernameField(document);
                const latestEmail = emailField && emailField.value ? emailField.value.trim() : sessionCredentials.email;

                showSaveSuggestion(hostname, latestEmail, latestPassword);
            }
        }, 500);
    }
}

document.addEventListener('submit', (event) => {
    attemptToTriggerSaveSuggestion(event.target);
}, true);

document.addEventListener('click', (event) => {
    attemptToTriggerSaveSuggestion(event.target);
}, true);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        attemptToTriggerSaveSuggestion(event.target);
    }
}, true);
