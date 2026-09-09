// Lógica da Home do painel administrativo (dashboard de gestão).
// Só roda na página index.html - todo o restante do sistema (produtos, estoque, etc.) segue
// intocado e usa seus próprios scripts.

document.addEventListener('DOMContentLoaded', () => {
    const kpiSection = document.getElementById('dashKpiSection');
    if (!kpiSection) return; // Não estamos na Home

    const token = localStorage.getItem('authToken');
    const userDataString = localStorage.getItem('userData');
    if (!token || !userDataString) return; // checkAuth() do main.js já redireciona pro login

    const userData = JSON.parse(userDataString);

    // KPIs, caixa, alertas e gráfico exigem permissão de admin (mesma regra do endpoint
    // /api/dashboard/resumo) - para vendedores, a seção some por completo em vez de mostrar
    // "Acesso negado" ou dados quebrados.
    if (userData.role !== 'admin') {
        kpiSection.remove();
        return;
    }

    carregarResumoDashboard();
});

function formatarMoeda(valor) {
    return `R$ ${(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function carregarResumoDashboard() {
    const token = localStorage.getItem('authToken');
    const kpiGrid = document.getElementById('dashKpiGrid');
    const alertsBox = document.getElementById('dashAlerts');

    try {
        const response = await fetch('/api/dashboard/resumo', {
            headers: { 'x-access-token': token }
        });

        if (!response.ok) throw new Error('Falha ao carregar o resumo.');

        const data = await response.json();

        // --- KPIs ---
        document.getElementById('kpiFaturamento').textContent = formatarMoeda(data.kpis.faturamento_hoje);
        document.getElementById('kpiVendas').textContent = data.kpis.vendas_hoje;
        document.getElementById('kpiTicket').textContent = formatarMoeda(data.kpis.ticket_medio_hoje);
        document.getElementById('kpiLucro').textContent = formatarMoeda(data.kpis.lucro_estimado_hoje);
        kpiGrid.querySelectorAll('.dash-kpi-value').forEach(el => el.classList.remove('is-loading'));

        // --- Caixa ---
        document.getElementById('dashSaldoCaixa').textContent = formatarMoeda(data.caixa.saldo_atual);

        // --- Alertas operacionais (só mostra o que tem dado real > 0) ---
        renderAlertas(alertsBox, data.alertas);

        // --- Gráfico dos últimos 7 dias ---
        renderGraficoVendas7d(data.grafico_7dias);

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        kpiGrid.querySelectorAll('.dash-kpi-value').forEach(el => {
            el.classList.remove('is-loading');
            el.textContent = 'Erro';
        });
        alertsBox.innerHTML = '<div class="dash-alerts-empty">Não foi possível carregar os alertas agora.</div>';
    }
}

function renderAlertas(container, alertas) {
    const itens = [];

    if (alertas.sem_estoque > 0) {
        itens.push({
            texto: `${alertas.sem_estoque} produto${alertas.sem_estoque > 1 ? 's' : ''} sem estoque`,
            href: '/estoque.html'
        });
    }
    if (alertas.estoque_baixo > 0) {
        itens.push({
            texto: `${alertas.estoque_baixo} produto${alertas.estoque_baixo > 1 ? 's' : ''} com estoque baixo`,
            href: '/estoque.html'
        });
    }
    if (alertas.pedidos_aguardando_envio > 0) {
        itens.push({
            texto: `${alertas.pedidos_aguardando_envio} pedido${alertas.pedidos_aguardando_envio > 1 ? 's' : ''} aguardando envio`,
            href: '/loja_online.html'
        });
    }

    if (itens.length === 0) {
        container.innerHTML = '<div class="dash-alerts-empty"><i class="fas fa-circle-check me-1"></i> Nenhuma pendência no momento.</div>';
        return;
    }

    container.innerHTML = itens.map(item => `
        <a href="${item.href}" class="dash-alert-item">
            <span class="dot"></span>
            <span>${item.texto}</span>
            <i class="fas fa-arrow-right dash-alert-arrow"></i>
        </a>
    `).join('');
}

let dashVendas7dChartInstance = null;

function renderGraficoVendas7d(dados) {
    const canvas = document.getElementById('dashVendas7dChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (dashVendas7dChartInstance) dashVendas7dChartInstance.destroy();

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(224, 180, 49, 0.35)');
    gradient.addColorStop(1, 'rgba(224, 180, 49, 0)');

    dashVendas7dChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dados.map(d => d.data),
            datasets: [{
                data: dados.map(d => d.total),
                borderColor: '#f0d178',
                backgroundColor: gradient,
                tension: 0.35,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#e0b431',
                pointBorderColor: '#1a1410',
                pointBorderWidth: 1,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18100f',
                    borderColor: 'rgba(239, 232, 220, 0.15)',
                    borderWidth: 1,
                    titleColor: '#EFE8DC',
                    bodyColor: '#f0d178',
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: (item) => `R$ ${item.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#B9AFA0', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(239, 232, 220, 0.06)' },
                    ticks: {
                        color: '#B9AFA0',
                        font: { size: 11 },
                        callback: (value) => `R$ ${value}`
                    },
                    beginAtZero: true
                }
            }
        }
    });
}
