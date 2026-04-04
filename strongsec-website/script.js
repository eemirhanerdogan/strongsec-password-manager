document.addEventListener('DOMContentLoaded', () => {
    // 1. SSS (Sıkça Sorulan Sorular) Akordeon Mantığı
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const questionBtn = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        questionBtn.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Tüm açık SSS'leri kapat
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                const otherAnswer = otherItem.querySelector('.faq-answer');
                otherAnswer.style.maxHeight = null;
            });

            // Eğer başlangıçta aktif değilse aç
            if (!isActive) {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // 2. Alt Bilgide Mevcut Yılı Ayarla
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // 3. Gezinme çubuğu (Navbar) kaydırma efekti
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            navbar.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
            navbar.style.background = 'rgba(11, 15, 25, 0.95)';
        } else {
            navbar.style.boxShadow = 'none';
            navbar.style.background = 'rgba(11, 15, 25, 0.8)';
        }
    });

    // 4. Yumuşak Bağlantı Kaydırma Yardımcısı (Desteklemeyen tarayıcılar veya özel ofset ihtiyaçları için yedek)
    document.querySelectorAll('.nav-links a[href^="#"], .hero-cta-group a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // Sabit gezinme çubuğu (navbar) için ofset
                const navbarHeight = 70;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navbarHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});
