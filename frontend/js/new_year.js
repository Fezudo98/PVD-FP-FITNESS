/**
 * Simple Fireworks Animation
 * Renders on a canvas overlay.
 */

(function () {
    // Check if canvas already exists
    if (document.getElementById('fireworks-canvas')) return;

    // --- Background Canvas (Behind content) ---
    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'fireworks-canvas';
    bgCanvas.style.zIndex = '-1';
    bgCanvas.style.position = 'fixed';
    bgCanvas.style.top = '0';
    bgCanvas.style.left = '0';
    bgCanvas.style.pointerEvents = 'none';
    document.body.prepend(bgCanvas);

    // --- Foreground Canvas (In front of content) ---
    const fgCanvas = document.createElement('canvas');
    fgCanvas.id = 'fireworks-fg-canvas';
    fgCanvas.style.zIndex = '9999'; // High Z-Index to be above panels
    fgCanvas.style.position = 'fixed';
    fgCanvas.style.top = '0';
    fgCanvas.style.left = '0';
    fgCanvas.style.pointerEvents = 'none';
    document.body.appendChild(fgCanvas);

    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');

    let width, height;
    let bgParticles = [];
    let fgParticles = [];
    let animationFrame;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        bgCanvas.width = width;
        bgCanvas.height = height;
        fgCanvas.width = width;
        fgCanvas.height = height;
    }

    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.color = color;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.alpha = 1;
            this.decay = Math.random() * 0.015 + 0.015;
            this.gravity = 0.05;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += this.gravity;
            this.alpha -= this.decay;
        }

        draw(ctx) {
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function createFirework() {
        const x = Math.random() * width;
        const y = Math.random() * (height / 2); // Top half
        const colors = ['#FFD700', '#FF0000', '#00FF00', '#00FFFF', '#FF00FF', '#FFFFFF'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        for (let i = 0; i < 50; i++) {
            bgParticles.push(new Particle(x, y, color));
        }
    }

    function loop() {
        // --- Background Render ---
        bgCtx.globalCompositeOperation = 'destination-out';
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        bgCtx.fillRect(0, 0, width, height);
        bgCtx.globalCompositeOperation = 'source-over';
        bgCtx.globalAlpha = 1;

        // Launch BG fireworks
        if (Math.random() < 0.05) {
            createFirework();
        }

        for (let i = bgParticles.length - 1; i >= 0; i--) {
            bgParticles[i].update();
            bgParticles[i].draw(bgCtx);
            if (bgParticles[i].alpha <= 0) {
                bgParticles.splice(i, 1);
            }
        }

        // --- Foreground Render ---
        fgCtx.clearRect(0, 0, width, height); // Just clear, transparency is key
        fgCtx.globalAlpha = 1;

        for (let i = fgParticles.length - 1; i >= 0; i--) {
            fgParticles[i].update();
            fgParticles[i].draw(fgCtx);
            if (fgParticles[i].alpha <= 0) {
                fgParticles.splice(i, 1);
            }
        }

        animationFrame = requestAnimationFrame(loop);
    }

    // Champagne Interaction Logic
    const bottleContainer = document.getElementById('champagne-container');
    const cork = document.getElementById('cork');
    let isPopping = false;

    function handleBottleClick() {
        if (isPopping) return;
        isPopping = true;

        // 1. Shake
        const icon = bottleContainer.querySelector('.bottle-icon');
        const lip = bottleContainer.querySelector('.bottle-lip');

        icon.classList.add('bottle-shaking');
        if (lip) lip.classList.add('lip-shaking'); // Use custom animation

        setTimeout(() => {
            // 2. Pop
            icon.classList.remove('bottle-shaking');
            if (lip) lip.classList.remove('lip-shaking');

            cork.classList.add('cork-flying');

            // 3. Spray
            createChampagneSpray();

            // 4. Reset
            setTimeout(() => {
                cork.classList.remove('cork-flying');
                isPopping = false;
            }, 3000);
        }, 800); // Shake duration
    }

    if (bottleContainer && cork) {
        // Prevent duplicate listeners if script re-runs
        bottleContainer.removeEventListener('click', handleBottleClick);
        bottleContainer.addEventListener('click', handleBottleClick);
    }

    function createChampagneSpray() {
        const rect = bottleContainer.getBoundingClientRect();
        // Tip of the bottle (approximate based on 45deg rotation)
        const startX = rect.left + rect.width;
        const startY = rect.top;

        for (let i = 0; i < 150; i++) { // More particles
            let p = new Particle(startX, startY, '#FFFFE0'); // Light yellow foam

            // Override velocity for spray effect
            const angle = -Math.PI / 3 + (Math.random() - 0.5) * 0.8; // Strong spray upwards/right
            const speed = Math.random() * 15 + 10; // Faster

            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.gravity = 0.3;
            p.decay = Math.random() * 0.01 + 0.005; // Last longer

            fgParticles.push(p);
        }
    }

    loop();

    // Store cleanup function globally for ThemeManager
    window.stopFireworks = function () {
        cancelAnimationFrame(animationFrame);
        window.removeEventListener('resize', resize);
        if (bottleContainer) bottleContainer.removeEventListener('click', handleBottleClick);

        if (bgCanvas.parentNode) bgCanvas.parentNode.removeChild(bgCanvas);
        if (fgCanvas.parentNode) fgCanvas.parentNode.removeChild(fgCanvas);

        window.stopFireworks = null; // Clear reference
    };
})();
