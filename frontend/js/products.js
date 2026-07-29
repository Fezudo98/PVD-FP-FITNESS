

let currentPage = 1;
let currentSearch = '';
let currentCategory = '';
let currentSort = 'mais_vendidos';

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

    if (categoryParam) {
        currentCategory = categoryParam;
    }

    if (searchParam) {
        currentSearch = searchParam;
        document.getElementById('searchInput').value = currentSearch;
    }

    loadProducts();

    // Search on enter
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') searchProducts();
        });

        // Instant search with debounce
        searchInput.addEventListener('input', function (e) {
            debouncedSearch();
        });
    }
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

function filterByCategory() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        currentCategory = categoryFilter.value;
        currentPage = 1;
        resetContainer();
        loadProducts();
    }
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

function resetContainer() {
    const container = document.getElementById('productsContainer');
    if (container) {
        container.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-warning" role="status"></div></div>';
    }
}

async function loadProducts() {
    try {
        let url = `/api/store/products?page=${currentPage}&per_page=12&sort=${currentSort}`;
        if (currentSearch) url += `&q=${encodeURIComponent(currentSearch)}`;
        if (currentCategory) url += `&categoria=${encodeURIComponent(currentCategory)}`;

        const response = await fetch(url);
        const data = await response.json();
        const container = document.getElementById('productsContainer');
        if (!container) return;

        if (currentPage === 1) container.innerHTML = '';

        // Update Categories Dropdown (only on first load to avoid resetting selection)
        const categorySelect = document.getElementById('categoryFilter');
        if (categorySelect && categorySelect.options.length <= 1 && data.categorias) {
            data.categorias.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categorySelect.appendChild(option);
            });
        }

        // Set the selected category if it exists
        if (currentCategory && categorySelect) {
            // Try exact match first
            let optionToSelect = Array.from(categorySelect.options).find(opt => opt.value === currentCategory);

            // If not found, try case-insensitive match
            if (!optionToSelect) {
                optionToSelect = Array.from(categorySelect.options).find(opt => opt.value.toLowerCase() === currentCategory.toLowerCase());
            }

            if (optionToSelect) {
                categorySelect.value = optionToSelect.value;
                // Update currentCategory to match the exact value in the dropdown/DB to ensure consistency
                currentCategory = optionToSelect.value;
            } else {
                console.warn('Category not found in dropdown:', currentCategory);
            }
        }

        if (data.produtos && data.produtos.length > 0) {
            const html = data.produtos.map(p => {
                let priceDisplay = `R$ ${p.preco_venda.toFixed(2)}`;
                if (p.max_price && p.max_price > p.preco_venda) {
                    priceDisplay = `A partir de R$ ${p.preco_venda.toFixed(2)}`;
                }

                const bestSellerBadge = p.is_best_seller ?
                    `<span class="badge bg-dark text-warning position-absolute top-0 start-0 m-3 px-3 py-2 rounded-pill z-2 shadow-sm border border-warning border-opacity-25" style="letter-spacing: 1px;">
                        <i class="fas fa-fire me-1"></i> Mais Vendido
                     </span>` : '';

                return `
                <div class="col-md-6 col-lg-3">
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
                if (data.pagina_atual < data.total_paginas) {
                    loadMoreBtn.style.display = 'inline-block';
                } else {
                    loadMoreBtn.style.display = 'none';
                }
            }
        } else {
            if (currentPage === 1) {
                container.innerHTML = '<div class="col-12 text-center text-muted"><p>Nenhum produto encontrado.</p></div>';
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
