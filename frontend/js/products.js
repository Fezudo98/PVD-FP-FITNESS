let currentPage = 1;
let currentSearch = '';
let currentCategory = '';
let currentSort = 'mais_vendidos';
let currentSizes = [];
let currentPrecoMin = null;
let currentPrecoMax = null;

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedSearch = debounce(() => searchProducts(), 300);

document.addEventListener('DOMContentLoaded', function () {
    // Initialize filters from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('categoria');
    const searchParam = urlParams.get('q');
    const sortParam = urlParams.get('sort');
    const tamanhosParam = urlParams.get('tamanhos');
    const precoMinParam = urlParams.get('preco_min');
    const precoMaxParam = urlParams.get('preco_max');

    if (categoryParam) currentCategory = categoryParam;

    if (searchParam) {
        currentSearch = searchParam;
        document.getElementById('searchInput').value = currentSearch;
    }

    if (sortParam) {
        currentSort = sortParam;
        const opcaoAtiva = document.querySelector(`.sort-option[data-value="${sortParam}"]`);
        if (opcaoAtiva) aplicarSelecaoOrdenacao(opcaoAtiva);
    }

    if (tamanhosParam) currentSizes = tamanhosParam.split(',').filter(Boolean);
    if (precoMinParam) currentPrecoMin = parseFloat(precoMinParam);
    if (precoMaxParam) currentPrecoMax = parseFloat(precoMaxParam);

    if (currentPrecoMin !== null) document.getElementById('precoMinInput').value = currentPrecoMin;
    if (currentPrecoMax !== null) document.getElementById('precoMaxInput').value = currentPrecoMax;

    loadProducts();

    // Search on enter
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') searchProducts();
        });
        searchInput.addEventListener('input', function () {
            debouncedSearch();
        });
    }

    document.getElementById('aplicarPrecoBtn').addEventListener('click', aplicarFiltroPreco);
    document.getElementById('limparFiltrosBtn').addEventListener('click', limparFiltros);
});

function searchProducts() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        currentSearch = searchInput.value;
        currentPage = 1;
        resetContainer();
        loadProducts();
    }
}

function selecionarCategoria(categoria) {
    currentCategory = categoria;
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function aplicarSelecaoOrdenacao(opcaoEl) {
    document.querySelectorAll('.sort-option').forEach(el => el.classList.remove('active'));
    opcaoEl.classList.add('active');
    const label = document.getElementById('sortDropdownLabel');
    if (label) label.textContent = opcaoEl.dataset.label;
}

function selecionarOrdenacao(opcaoEl) {
    aplicarSelecaoOrdenacao(opcaoEl);
    currentSort = opcaoEl.dataset.value;
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function toggleTamanho(tamanho, marcado) {
    if (marcado) {
        if (!currentSizes.includes(tamanho)) currentSizes.push(tamanho);
    } else {
        currentSizes = currentSizes.filter(t => t !== tamanho);
    }
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function aplicarFiltroPreco() {
    const min = document.getElementById('precoMinInput').value;
    const max = document.getElementById('precoMaxInput').value;
    currentPrecoMin = min ? parseFloat(min) : null;
    currentPrecoMax = max ? parseFloat(max) : null;
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function removerFiltro(tipo, valor) {
    if (tipo === 'categoria') currentCategory = '';
    if (tipo === 'tamanho') {
        currentSizes = currentSizes.filter(t => t !== valor);
    }
    if (tipo === 'preco') {
        currentPrecoMin = null;
        currentPrecoMax = null;
        document.getElementById('precoMinInput').value = '';
        document.getElementById('precoMaxInput').value = '';
    }
    if (tipo === 'busca') {
        currentSearch = '';
        document.getElementById('searchInput').value = '';
    }
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function limparFiltros() {
    currentCategory = '';
    currentSizes = [];
    currentPrecoMin = null;
    currentPrecoMax = null;
    currentSearch = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('precoMinInput').value = '';
    document.getElementById('precoMaxInput').value = '';
    currentPage = 1;
    resetContainer();
    loadProducts();
}

function resetContainer() {
    const container = document.getElementById('productsContainer');
    if (container) {
        container.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-warning" role="status"></div></div>';
    }
}

function renderCategoriesSidebar(categorias) {
    const list = document.getElementById('categoryListSidebar');
    if (!list) return;

    const itens = [{ nome: 'Todas as Categorias', valor: '' }, ...categorias.map(c => ({ nome: c, valor: c }))];
    list.innerHTML = itens.map(item => `
        <li class="mb-2">
            <a href="javascript:void(0)" class="text-decoration-none category-link ${item.valor === currentCategory ? 'fw-bold active' : 'text-dark'}"
                data-categoria="${item.valor}" onclick="selecionarCategoria('${item.valor.replace(/'/g, "\\'")}')">${item.nome}</a>
        </li>
    `).join('');
}

function renderSizeFilters(tamanhosDisponiveis) {
    const container = document.getElementById('sizeFilterList');
    if (!container) return;

    if (!tamanhosDisponiveis || tamanhosDisponiveis.length === 0) {
        container.innerHTML = '<span class="text-muted small">Nenhum tamanho disponível</span>';
        return;
    }

    container.innerHTML = tamanhosDisponiveis.map(t => {
        const id = `size_${t.tamanho}`.replace(/[^a-zA-Z0-9_]/g, '');
        const checked = currentSizes.includes(t.tamanho) ? 'checked' : '';
        return `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${t.tamanho}" id="${id}" ${checked}
                    onchange="toggleTamanho('${t.tamanho.replace(/'/g, "\\'")}', this.checked)">
                <label class="form-check-label size-check-label small" for="${id}">${t.tamanho} <span class="text-muted">(${t.total})</span></label>
            </div>
        `;
    }).join('');
}

function renderActiveFiltersChips() {
    const container = document.getElementById('activeFiltersChips');
    const limparBtn = document.getElementById('limparFiltrosBtn');
    if (!container) return;

    const chips = [];
    if (currentCategory) chips.push({ label: currentCategory, onclick: `removerFiltro('categoria')` });
    currentSizes.forEach(t => chips.push({ label: `Tam: ${t}`, onclick: `removerFiltro('tamanho', '${t.replace(/'/g, "\\'")}')` }));
    if (currentPrecoMin !== null || currentPrecoMax !== null) {
        const min = currentPrecoMin !== null ? formatBRL(currentPrecoMin) : '0';
        const max = currentPrecoMax !== null ? formatBRL(currentPrecoMax) : '∞';
        chips.push({ label: `R$ ${min} - R$ ${max}`, onclick: `removerFiltro('preco')` });
    }
    if (currentSearch) chips.push({ label: `"${currentSearch}"`, onclick: `removerFiltro('busca')` });

    container.innerHTML = chips.map(c => `
        <span class="filter-chip">
            ${c.label}
            <button type="button" onclick="${c.onclick}" title="Remover filtro"><i class="fa-solid fa-xmark"></i></button>
        </span>
    `).join('');

    if (limparBtn) limparBtn.classList.toggle('d-none', chips.length === 0);
}

async function loadProducts() {
    try {
        let url = `/api/store/products?page=${currentPage}&per_page=12&sort=${currentSort}`;
        if (currentSearch) url += `&q=${encodeURIComponent(currentSearch)}`;
        if (currentCategory) url += `&categoria=${encodeURIComponent(currentCategory)}`;
        if (currentSizes.length > 0) url += `&tamanhos=${encodeURIComponent(currentSizes.join(','))}`;
        if (currentPrecoMin !== null) url += `&preco_min=${currentPrecoMin}`;
        if (currentPrecoMax !== null) url += `&preco_max=${currentPrecoMax}`;

        const [response, infoParcelamento] = await Promise.all([
            fetch(url),
            obterParcelamentoInfo()
        ]);
        const data = await response.json();
        const container = document.getElementById('productsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (data.categorias) renderCategoriesSidebar(data.categorias);
        if (data.tamanhos_disponiveis) renderSizeFilters(data.tamanhos_disponiveis);
        renderActiveFiltersChips();

        const resultCount = document.getElementById('resultCount');
        if (resultCount) {
            resultCount.textContent = `${data.total_produtos} produto(s) encontrado(s)`;
        }

        if (data.produtos && data.produtos.length > 0) {
            const html = data.produtos.map(p => `
                <div class="col-6 col-md-4 col-lg-3">
                    ${renderProdutoCardMinimal(p, infoParcelamento)}
                </div>
            `).join('');

            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="col-12 text-center text-muted py-5"><p class="mb-0">Nenhum produto encontrado com esses filtros.</p></div>';
        }

        renderPagination(data.pagina_atual, data.total_paginas);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        const container = document.getElementById('productsContainer');
        if (container) container.innerHTML = '<div class="col-12 text-center text-danger"><p>Erro ao carregar produtos.</p></div>';
        const paginationEl = document.getElementById('paginationContainer');
        if (paginationEl) paginationEl.innerHTML = '';
    }
}

// Paginação numérica: sempre mostra primeira, última, a atual e as vizinhas, com "..." pro
// resto - evita uma fileira de 30 botões quando o catálogo cresce, sem perder a navegação
// direta que o "Carregar Mais" infinito não dava (voltar pra uma página especifica).
function renderPagination(paginaAtual, totalPaginas) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    if (!totalPaginas || totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    const paginas = new Set([1, totalPaginas, paginaAtual, paginaAtual - 1, paginaAtual + 1]);
    const paginasOrdenadas = [...paginas].filter(p => p >= 1 && p <= totalPaginas).sort((a, b) => a - b);

    let html = `<button ${paginaAtual === 1 ? 'disabled' : ''} onclick="irParaPagina(${paginaAtual - 1})" title="Anterior"><i class="fa-solid fa-chevron-left"></i></button>`;

    let anterior = 0;
    for (const p of paginasOrdenadas) {
        if (p - anterior > 1) {
            html += `<span class="pagination-ellipsis">&hellip;</span>`;
        }
        html += `<button class="${p === paginaAtual ? 'active' : ''}" onclick="irParaPagina(${p})">${p}</button>`;
        anterior = p;
    }

    html += `<button ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="irParaPagina(${paginaAtual + 1})" title="Próxima"><i class="fa-solid fa-chevron-right"></i></button>`;

    container.innerHTML = html;
}

function irParaPagina(pagina) {
    if (pagina < 1) return;
    currentPage = pagina;
    loadProducts();
    const container = document.getElementById('productsContainer');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
