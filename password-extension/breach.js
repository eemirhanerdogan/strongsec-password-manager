const BreachService = {
    sha1: async function (message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.toUpperCase();
    },

    checkPasswordBreach: async function (password) {
        try {
            const hash = await this.sha1(password);
            const prefix = hash.substring(0, 5);
            const suffix = hash.substring(5);

            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                headers: { "Add-Padding": "true" }
            });

            if (!response.ok) {
                throw new Error('HIBP API error');
            }

            const text = await response.text();
            const lines = text.split('\n');

            for (let line of lines) {
                const [hashSuffix, count] = line.trim().split(':');
                if (hashSuffix === suffix) {
                    return parseInt(count, 10);
                }
            }
            return 0;
        } catch (e) {
            console.error("HIBP check failed:", e);
            return -1;
        }
    },

    getPasswordStrength: function (password) {
        const length = password.length;
        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSymbol = /[^a-zA-Z0-9]/.test(password);

        const typesCount = hasLower + hasUpper + hasNumber + hasSymbol;

        if (length < 8) return "weak";
        if (length >= 12 && typesCount >= 4) return "strong";
        if (typesCount >= 3 && length >= 8) return "medium";
        return "weak";
    },

    getPasswordRisk: async function (password) {
        const strength = this.getPasswordStrength(password);
        const breachCount = await this.checkPasswordBreach(password);

        let breached = breachCount > 0;
        let status = "safe";
        let message = "Güvenli ve temiz.";

        if (breachCount === -1) {
            status = strength === "strong" ? "safe" : (strength === "weak" ? "weak" : "safe");
            message = "Bağlantı hatası: Sızıntı kontrol edilemedi";
            breached = false;
        } else if (breached) {
            status = "breached";
            message = `Sızdırılmış! (${breachCount} kez)`;
        } else if (strength === "weak") {
            status = "weak";
            message = "Sızdırılmamış ancak tahmin edilebilir (Zayıf).";
        }

        return {
            breached: breached,
            breachCount: breachCount,
            strength: strength,
            status: status,
            message: message
        };
    }
};
