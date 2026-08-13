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
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) sortFilter.value = sortParam;
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

function filterBySort() {
    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
        currentSort = sortFilter.value;
        currentPage = 1;
        resetContainer();
        loadProducts();
    }
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

        const response = await fetch(url);
        const data = await response.json();
        const container = document.getElementById('productsContainer');
        if (!container) return;

        if (currentPage === 1) container.innerHTML = '';

        if (data.categorias) renderCategoriesSidebar(data.categorias);
        if (data.tamanhos_disponiveis) renderSizeFilters(data.tamanhos_disponiveis);
        renderActiveFiltersChips();

        const resultCount = document.getElementById('resultCount');
        if (resultCount) {
            resultCount.textContent = `${data.total_produtos} produto(s) encontrado(s)`;
        }

        if (data.produtos && data.produtos.length > 0) {
            const html = data.produtos.map(p => {
                let priceDisplay = `R$ ${formatBRL(p.preco_venda)}`;
                if (p.max_price && p.max_price > p.preco_venda) {
                    priceDisplay = `A partir de R$ ${formatBRL(p.preco_venda)}`;
                }

                const bestSellerBadge = p.is_best_seller ?
                    `<span class="badge bg-dark text-warning position-absolute top-0 start-0 m-3 px-3 py-2 rounded-pill z-2 shadow-sm border border-warning border-opacity-25" style="letter-spacing: 1px;">
                        <i class="fas fa-fire me-1"></i> Mais Vendido
                     </span>` : '';

                return `
                <div class="col-md-6 col-lg-4">
                    <div class="product-card h-100 position-relative border-0 shadow-sm rounded-4 overflow-hidden bg-white">
                        <div class="product-img-wrapper position-relative overflow-hidden" style="height: 300px;">
                            ${bestSellerBadge}
                            <a href="/store/produto/${p.id}" class="d-block h-100">
                                <img src="${p.imagem_url ? '/uploads/' + p.imagem_url : 'https://via.placeholder.com/300x400?text=Sem+Imagem'}"
                                     alt="${p.nome}"
                                     class="w-100 h-100 object-fit-cover transition-scale"
                                     style="object-fit: cover;">
                            </a>
                        </div>
                        <div class="card-body p-4 d-flex flex-column text-center">
                            <div class="text-muted small mb-1 text-uppercase" style="letter-spacing: 1px;">${p.categoria || 'Geral'}</div>
                            <h5 class="card-title fw-bold mb-2 flex-grow-1" style="font-family: 'Outfit', sans-serif;">
                                <a href="/store/produto/${p.id}" class="text-dark text-decoration-none stretched-link">${p.nome}</a>
                            </h5>
                            <h4 class="text-warning fw-bold mb-2">${priceDisplay}</h4>
                            ${p.total_stock <= 5 && p.total_stock > 0 ? `<div class="text-danger small fw-bold mb-3"><i class="fa-solid fa-fire me-1"></i> Restam apenas ${p.total_stock} unidades!</div>` : '<div class="mb-3"></div>'}
                            ${p.tem_variacoes ?
                                `<a href="/store/produto/${p.id}" class="btn btn-outline-dark w-100 rounded-pill position-relative z-2 fw-bold"><i class="fa-solid fa-eye me-2"></i>Ver Opções</a>`
                                :
                                `<button class="btn btn-outline-dark w-100 rounded-pill position-relative z-2 fw-bold" onclick="addToCart(${p.id}, '${p.nome}', ${p.preco_venda}, '${p.imagem_url || ''}', ${p.total_stock})"><i class="fa-solid fa-cart-plus me-2"></i>Adicionar</button>`
                            }
                        </div>
                    </div>
                </div>
            `}).join('');

            container.insertAdjacentHTML('beforeend', html);

            // Handle Load More button
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = data.pagina_atual < data.total_paginas ? 'inline-block' : 'none';
            }
        } else {
            if (currentPage === 1) {
                container.innerHTML = '<div class="col-12 text-center text-muted py-5"><p class="mb-0">Nenhum produto encontrado com esses filtros.</p></div>';
            }
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        if (currentPage === 1) {
            const container = document.getElementById('productsContainer');
            if (container) container.innerHTML = '<div class="col-12 text-center text-danger"><p>Erro ao carregar produtos.</p></div>';
        }
    }
}

function loadMore() {
    currentPage++;
    loadProducts();
}
