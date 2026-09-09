// Lógica da Home do painel administrativo (dashboard de gestão).
// Só roda na página index.html - todo o restante do sistema (produtos, estoque, etc.) segue
// intocado e usa seus próprios scripts.

document.addEventListener('DOMContentLoaded', () => {
    const kpiSection = document.getElementById('dashKpiSection');
    if (!kpiSection) return; // Não estamos na Home

    const token = localStorage.getItem('authToken');
    const userDataString = localStorage.getItem('userData');
    if (!token || !userDataString) return; // checkAuth() do main.js já redireciona pro login

    let userData;
    try {
        userData = JSON.parse(userDataString);
    } catch (error) {
        console.error('Dados locais de usuário inválidos:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        window.location.href = '/login.html';
        return;
    }

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
    const numero = Number(valor);
    const valorSeguro = Number.isFinite(numero) ? numero : 0;
    return valorSeguro.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

async function carregarResumoDashboard() {
    const token = localStorage.getItem('authToken');
    const kpiGrid = document.getElementById('dashKpiGrid');
    const alertsBox = document.getElementById('dashAlerts');
    const kpiSection = document.getElementById('dashKpiSection');

    try {
        const response = await fetch('/api/dashboard/resumo', {
            headers: { 'x-access-token': token }
        });

        if (!response.ok) throw new Error('Falha ao carregar o resumo.');

        const data = await response.json();
        const kpis = data?.kpis || {};
        const caixa = data?.caixa || {};
        const alertas = data?.alertas || {};

        // --- KPIs ---
        document.getElementById('kpiFaturamento').textContent = formatarMoeda(kpis.faturamento_hoje);
        document.getElementById('kpiVendas').textContent = Number(kpis.vendas_hoje) || 0;
        document.getElementById('kpiTicket').textContent = formatarMoeda(kpis.ticket_medio_hoje);
        document.getElementById('kpiLucro').textContent = formatarMoeda(kpis.lucro_estimado_hoje);
        kpiGrid.querySelectorAll('.dash-kpi-value').forEach(el => el.classList.remove('is-loading'));

        // --- Caixa ---
        document.getElementById('dashSaldoCaixa').textContent = formatarMoeda(caixa.saldo_atual);

        // --- Alertas operacionais (só mostra o que tem dado real > 0) ---
        renderAlertas(alertsBox, alertas);

        // --- Gráfico dos últimos 7 dias ---
        renderGraficoVendas7d(Array.isArray(data?.grafico_7dias) ? data.grafico_7dias : []);

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        kpiGrid.querySelectorAll('.dash-kpi-value').forEach(el => {
            el.classList.remove('is-loading');
            el.textContent = 'Erro';
        });
        alertsBox.innerHTML = '<div class="dash-alerts-empty">Não foi possível carregar os alertas agora.</div>';
        mostrarEstadoGrafico('Não foi possível carregar o gráfico agora.');
    } finally {
        kpiSection?.setAttribute('aria-busy', 'false');
    }
}

function renderAlertas(container, alertas) {
    const itens = [];

    const semEstoque = Number(alertas?.sem_estoque) || 0;
    const estoqueBaixo = Number(alertas?.estoque_baixo) || 0;
    const aguardandoEnvio = Number(alertas?.pedidos_aguardando_envio) || 0;

    if (semEstoque > 0) {
        itens.push({
            quantidade: semEstoque,
            texto: `Produto${semEstoque > 1 ? 's' : ''} sem estoque`,
            href: '/estoque.html'
        });
    }
    if (estoqueBaixo > 0) {
        itens.push({
            quantidade: estoqueBaixo,
            texto: `Produto${estoqueBaixo > 1 ? 's' : ''} com estoque baixo`,
            href: '/estoque.html'
        });
    }
    if (aguardandoEnvio > 0) {
        itens.push({
            quantidade: aguardandoEnvio,
            texto: `Pedido${aguardandoEnvio > 1 ? 's' : ''} aguardando envio`,
            href: '/loja_online.html'
        });
    }

    if (itens.length === 0) {
        container.innerHTML = '<div class="dash-alerts-empty"><i class="fas fa-circle-check me-1"></i> Nenhuma pendência no momento.</div>';
        return;
    }

    container.innerHTML = itens.map(item => `
        <a href="${item.href}" class="dash-alert-item">
            <span class="dash-alert-count">${item.quantidade}</span>
            <span class="dash-alert-text">${item.texto}</span>
            <i class="fas fa-arrow-right dash-alert-arrow" aria-hidden="true"></i>
        </a>
    `).join('');
}

let dashVendas7dChartInstance = null;

function renderGraficoVendas7d(dados) {
    const canvas = document.getElementById('dashVendas7dChart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        mostrarEstadoGrafico('Gráfico indisponível no momento.');
        return;
    }

    if (!dados.length) {
        mostrarEstadoGrafico('Ainda não há vendas registradas neste período.');
        return;
    }

    const status = document.getElementById('dashChartStatus');
    canvas.hidden = false;
    if (status) status.hidden = true;

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

function mostrarEstadoGrafico(mensagem) {
    const canvas = document.getElementById('dashVendas7dChart');
    const status = document.getElementById('dashChartStatus');
    if (canvas) canvas.hidden = true;
    if (status) {
        status.textContent = mensagem;
        status.hidden = false;
    }
}
