const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

const ICONES_TIPO = {
    pageview: 'fa-eye',
    view_content: 'fa-magnifying-glass',
    add_to_cart: 'fa-cart-plus',
    initiate_checkout: 'fa-credit-card',
    purchase: 'fa-bag-shopping'
};

const NOMES_TIPO = {
    pageview: 'Visualizações de Página',
    view_content: 'Visualizou Produto',
    add_to_cart: 'Adicionou ao Carrinho',
    initiate_checkout: 'Iniciou Checkout',
    purchase: 'Comprou'
};

const NOMES_TIPO_EVENTO = {
    ViewContent: 'Visualizar Produto',
    AddToCart: 'Adicionar ao Carrinho',
    Search: 'Busca',
    InitiateCheckout: 'Início de Checkout',
    Purchase: 'Compra'
};

function formatBRL(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let periodoAtual = 7;
let paginaAtual = 1;
let filtroTipoAtual = 'todos';
let totalPaginas = 1;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    document.querySelectorAll('#periodoGroup button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#periodoGroup button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            periodoAtual = parseInt(btn.dataset.periodo, 10);
            carregarResumo();
        });
    });

    document.getElementById('btnAtualizar').addEventListener('click', () => {
        carregarResumo();
        carregarEventos();
    });

    document.getElementById('filtroTipo').addEventListener('change', (e) => {
        filtroTipoAtual = e.target.value;
        paginaAtual = 1;
        carregarEventos();
    });

    document.getElementById('btnPaginaAnterior').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarEventos(); }
    });
    document.getElementById('btnPaginaProxima').addEventListener('click', () => {
        if (paginaAtual < totalPaginas) { paginaAtual++; carregarEventos(); }
    });

    carregarResumo();
    carregarEventos();
});

async function carregarResumo() {
    try {
        const res = await fetch(`${API_URL}/api/eventos/resumo?periodo=${periodoAtual}`, {
            headers: { 'x-access-token': token }
        });
        if (!res.ok) throw new Error('Falha ao carregar resumo');
        const data = await res.json();
        renderStatusBadges(data);
        renderCards(data);
        renderFunil(data);
    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Não foi possível carregar o resumo de eventos.', background: '#1e1e1e', color: '#fff' });
    }
}

function renderStatusBadges(data) {
    const container = document.getElementById('statusBadges');
    const pixelOk = data.pixel_configurado;
    const capiOk = data.capi_configurado;
    container.innerHTML = `
        <span class="badge evt-status-badge ${pixelOk ? 'bg-success' : 'bg-secondary'}">
            <i class="fa-solid ${pixelOk ? 'fa-check' : 'fa-xmark'} me-1"></i>Pixel do Meta ${pixelOk ? 'ativo' : 'não configurado'}
        </span>
        <span class="badge evt-status-badge ${capiOk ? 'bg-success' : 'bg-secondary'}">
            <i class="fa-solid ${capiOk ? 'fa-check' : 'fa-xmark'} me-1"></i>API de Conversões ${capiOk ? 'ativa' : 'não configurada'}
        </span>
        ${data.purchase_falhas_meta > 0 ? `
        <span class="badge evt-status-badge bg-danger">
            <i class="fa-solid fa-triangle-exclamation me-1"></i>${data.purchase_falhas_meta} compra(s) não confirmada(s) no Meta
        </span>` : ''}
    `;
}

function renderCards(data) {
    const f = data.funil;
    const cards = [
        { chave: 'pageview', valor: f.pageview, sub: `${f.pageview_unicos} visitante(s) único(s)` },
        { chave: 'view_content', valor: f.view_content, sub: null },
        { chave: 'add_to_cart', valor: f.add_to_cart, sub: null },
        { chave: 'initiate_checkout', valor: f.initiate_checkout, sub: null },
        { chave: 'purchase', valor: f.purchase, sub: `R$ ${formatBRL(data.valor_total_purchase)}` }
    ];

    const container = document.getElementById('cardsResumo');
    container.innerHTML = cards.map(c => `
        <div class="col-6 col-lg">
            <div class="evt-card">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="evt-label">${NOMES_TIPO[c.chave]}</span>
                    <i class="fa-solid ${ICONES_TIPO[c.chave]} text-warning"></i>
                </div>
                <div class="evt-valor">${c.valor}</div>
                ${c.sub ? `<div class="small text-white-50 mt-1">${c.sub}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function renderFunil(data) {
    const f = data.funil;
    const t = data.taxas_conversao;
    const etapas = [
        { nome: 'Visualizações', valor: f.pageview, taxa: null },
        { nome: 'Viu Produto', valor: f.view_content, taxa: t.pageview_para_view_content },
        { nome: 'Add. Carrinho', valor: f.add_to_cart, taxa: t.view_content_para_add_to_cart },
        { nome: 'Checkout', valor: f.initiate_checkout, taxa: t.add_to_cart_para_checkout },
        { nome: 'Compra', valor: f.purchase, taxa: t.checkout_para_purchase }
    ];

    const maior = Math.max(...etapas.map(e => e.valor), 1);

    const container = document.getElementById('funilContainer');
    container.innerHTML = etapas.map(e => {
        const largura = Math.max((e.valor / maior) * 100, e.valor > 0 ? 6 : 2);
        return `
            <div class="funil-etapa">
                <div class="funil-nome">${e.nome}</div>
                <div class="funil-barra-wrapper">
                    <div class="funil-barra" style="width: ${largura}%;">${e.valor}</div>
                </div>
                <div class="funil-taxa">${e.taxa !== null ? `${e.taxa}%` : ''}</div>
            </div>
        `;
    }).join('') + `
        <div class="text-end small text-white-50 mt-2">
            Conversão total (visualização → compra): <strong class="text-warning">${t.pageview_para_purchase}%</strong>
        </div>
    `;
}

async function carregarEventos() {
    const tbody = document.getElementById('tabelaEventos');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-white-50 py-4">Carregando...</td></tr>`;

    try {
        const params = new URLSearchParams({ page: paginaAtual, per_page: 25 });
        if (filtroTipoAtual !== 'todos') params.set('tipo', filtroTipoAtual);

        const res = await fetch(`${API_URL}/api/eventos/lista?${params.toString()}`, {
            headers: { 'x-access-token': token }
        });
        if (!res.ok) throw new Error('Falha ao carregar eventos');
        const data = await res.json();
        totalPaginas = data.total_paginas;

        if (data.eventos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-white-50 py-4">Nenhum evento encontrado.</td></tr>`;
        } else {
            tbody.innerHTML = data.eventos.map(e => `
                <tr>
                    <td class="text-nowrap small">${e.timestamp}</td>
                    <td><span class="badge badge-tipo-${e.tipo}">${NOMES_TIPO_EVENTO[e.tipo] || e.tipo}</span></td>
                    <td class="small">${e.detalhe || '-'}</td>
                    <td class="text-end">${e.valor ? `R$ ${formatBRL(e.valor)}` : '-'}</td>
                    <td class="text-center">
                        ${e.tipo === 'Purchase'
                    ? (e.enviado_meta
                        ? '<i class="fa-solid fa-circle-check text-success" title="Confirmado no Meta"></i>'
                        : '<i class="fa-solid fa-triangle-exclamation text-danger" title="Falhou ao enviar pro Meta"></i>')
                    : '<i class="fa-solid fa-circle-check text-success" title="Enviado pelo navegador"></i>'}
                    </td>
                </tr>
            `).join('');
        }

        document.getElementById('paginacaoInfo').textContent = `Página ${data.pagina_atual} de ${data.total_paginas} (${data.total} evento(s))`;
        document.getElementById('btnPaginaAnterior').disabled = paginaAtual <= 1;
        document.getElementById('btnPaginaProxima').disabled = paginaAtual >= totalPaginas;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar eventos.</td></tr>`;
    }
}
