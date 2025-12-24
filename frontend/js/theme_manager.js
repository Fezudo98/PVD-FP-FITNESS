/**
 * Theme Manager for Sistema FP Fitness
 * Handles dynamic loading of theme resources (CSS/JS)
 */

const ThemeManager = {
    themes: {
        'original': {
            name: 'Original (Preto)',
            css: [],
            js: [],
            cleanup: () => {
                // Remove specific stylesheets
                document.querySelectorAll('link[href*="christmas.css"]').forEach(el => el.remove());
                // Optional: Stop snow interval if exposed, but for now CSS toggle is enough for visual cleanup
            }
        },
        'natal': {
            name: 'Natal',
            css: ['/css/christmas.css'],
            js: ['/js/christmas.js'],
            cleanup: () => { } // Natal adds elements, standard cleanup is mostly handled by page refresh or removing deps
        }
    },

    currentTheme: 'original',

    init: async function () {
        await this.loadPreferences();
        this.applyTheme(this.currentTheme);
        this.setupUI();
    },

    loadPreferences: async function () {
        try {
            const response = await fetch('/api/public/theme');
            if (response.ok) {
                const data = await response.json();
                this.currentTheme = data.theme || 'original'; // Endpoint returns {theme: '...'}
            }
        } catch (error) {
            console.error('Erro ao carregar tema:', error);
        }
    },

    applyTheme: function (themeKey) {
        if (!this.themes[themeKey]) return;

        console.log(`Applying theme: ${themeKey}`);
        const theme = this.themes[themeKey];

        // 1. Cleanup previous theme artifacts
        if (this.currentTheme !== themeKey && this.themes[this.currentTheme]) {
            this.themes[this.currentTheme].cleanup();
        }

        // Always run cleanup for Original to be safe when switching FROM Natal
        if (themeKey === 'original') {
            this.themes['original'].cleanup();
        }

        // 2. Load CSS
        theme.css.forEach(url => {
            if (!document.querySelector(`link[href="${url}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                document.head.appendChild(link);
            }
        });

        // 3. Load JS
        theme.js.forEach(url => {
            // Check if already loaded to avoid duplicates if script logic allows
            // For Christmas.js it creates snowflakes on load, so we might want to be careful.
            // Simple check:
            if (!document.querySelector(`script[src="${url}"]`)) {
                const script = document.createElement('script');
                script.src = url;
                document.body.appendChild(script);
            }
        });

        this.currentTheme = themeKey;
    },

    setTheme: async function (themeKey) {
        try {
            const formData = { 'SYSTEM_THEME': themeKey };
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                // Reload to ensure clean state for scripts like snow.js which might set intervals
                window.location.reload();
            } else {
                alert('Erro ao salvar tema.');
            }
        } catch (error) {
            console.error('Erro ao salvar tema:', error);
        }
    },

    setupUI: function () {
        const themeSelector = document.getElementById('themeSelector');
        if (themeSelector) {
            // Render dropdown options
            themeSelector.innerHTML = '';

            // Header
            const header = document.createElement('li');
            header.innerHTML = '<h6 class="dropdown-header">Escolher Tema</h6>';
            themeSelector.appendChild(header);

            Object.keys(this.themes).forEach(key => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.className = `dropdown-item ${this.currentTheme === key ? 'active' : ''}`;
                a.href = '#';
                a.textContent = this.themes[key].name;
                a.onclick = (e) => {
                    e.preventDefault();
                    this.setTheme(key);
                };
                li.appendChild(a);
                themeSelector.appendChild(li);
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
});
