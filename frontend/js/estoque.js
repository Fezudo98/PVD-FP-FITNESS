const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let filtroAtivo = 'todos'; // 'todos' | 'baixo' | 'zero'
let todosExpandidos = false;

document.addEventListener('DOMContentLoaded', () => {
    const gruposContainer = document.getElementById('produtosGruposContainer');
    const searchInput = document.getElementById('searchInput');
    const categoryFilterSelect = document.getElementById('categoryFilterSelect');
    const toggleAllGroupsBtn = document.getElementById('toggleAllGroupsBtn');

    async function fetchStats() {
        try {
            const res = await fetch(`${API_URL}/api/produtos/stats`, { headers: { 'x-access-token': token } });
            if (!res.ok) return;
            const s = await res.json();
            document.getElementById('statPecas').textContent = s.total_pecas;
            document.getElementById('statVariantes').textContent = s.total_variantes;
            document.getElementById('statEstoqueBaixo').textContent = s.estoque_baixo;
            document.getElementById('statSemEstoque').textContent = s.sem_estoque;
            document.getElementById('statValorEstoque').textContent = `R$ ${s.valor_estoque_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
        }
    }

    async function loadCategories() {
        try {
            const response = await fetch(`${API_URL}/api/categorias`, { headers: { 'x-access-token': token } });
            const categories = await response.json();
            const currentFilter = categoryFilterSelect.value;
            categoryFilterSelect.innerHTML = '<option value="">Todas as Categorias</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categoryFilterSelect.appendChild(option);
            });
            categoryFilterSelect.value = currentFilter;
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    function renderVarianteRow(v) {
        const corSwatch = v.cor_hex ? `<span class="cor-swatch" style="background:${v.cor_hex}"></span>` : '';
        const semEstoque = v.quantidade === 0;
        const baixo = !semEstoque && v.quantidade <= (v.limite_estoque_baixo || 5);
        const rowClass = semEstoque ? 'estoque-zero-row' : (baixo ? 'estoque-baixo-row' : '');
        const qtdClass = semEstoque ? 'text-danger' : (baixo ? 'text-warning' : 'text-white');
        const barcodeButton = v.codigo_barras_url
            ? `<a href="/barcodes/${v.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light rounded-circle" title="Ver Cód. Barras" style="width: 32px; height: 32px; padding: 0; line-height: 30px;"><i class="fas fa-barcode"></i></a>`
            : '<span class="text-white-50 small">-</span>';

        return `
            <tr class="variante-row ${rowClass}">
                <td><img src="${v.imagem_url ? API_URL + '/uploads/' + v.imagem_url : '/static/img/no-image.png'}" width="40" height="40" class="rounded" style="object-fit:cover;"></td>
                <td class="text-white-50 small">${escapeHtml(v.sku)}</td>
                <td>${corSwatch}${escapeHtml(v.cor) || '-'}</td>
                <td>${escapeHtml(v.tamanho) || '-'}</td>
                <td>R$ ${v.preco_venda.toFixed(2)}</td>
                <td class="fw-bold ${qtdClass}">${v.quantidade}</td>
                <td class="text-end">${barcodeButton}</td>
            </tr>
        `;
    }

    function renderGrupos(produtos) {
        gruposContainer.innerHTML = '';
        if (produtos.length === 0) {
            gruposContainer.innerHTML = '<div class="text-center text-white-50 py-5"><i class="fas fa-box-open fa-2x mb-3 d-block"></i>Nenhum produto encontrado.</div>';
            return;
        }

        produtos.forEach(grupo => {
            const card = document.createElement('div');
            card.className = 'produto-grupo-card';

            const estoqueBadge = grupo.sem_estoque
                ? `<span class="badge badge-estoque-zero">Sem estoque</span>`
                : grupo.estoque_baixo
                    ? `<span class="badge badge-estoque-baixo">Estoque baixo</span>`
                    : `<span class="badge badge-estoque-ok">Em estoque</span>`;

            const precoTexto = grupo.min_price === grupo.max_price
                ? `R$ ${grupo.min_price.toFixed(2)}`
                : `R$ ${grupo.min_price.toFixed(2)} - R$ ${grupo.max_price.toFixed(2)}`;

            card.innerHTML = `
                <div class="produto-grupo-header">
                    <i class="fas fa-chevron-right produto-grupo-chevron"></i>
                    <img class="produto-grupo-thumb" src="${grupo.imagem_url ? API_URL + '/uploads/' + grupo.imagem_url : '/static/img/no-image.png'}" alt="${escapeHtml(grupo.nome)}">
                    <div class="flex-grow-1" style="min-width:0;">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="fw-bold text-white">${escapeHtml(grupo.nome)}</span>
                            <span class="badge bg-secondary bg-opacity-50">${escapeHtml(grupo.categoria) || 'Sem categoria'}</span>
                            <span class="badge bg-dark border border-secondary">${grupo.variant_count} variaç${grupo.variant_count === 1 ? 'ão' : 'ões'}</span>
                            ${estoqueBadge}
                        </div>
                        <div class="text-white-50 small mt-1">${precoTexto} &middot; ${grupo.total_stock} unid. no total</div>
                    </div>
                </div>
                <div class="produto-grupo-variantes">
                    <div class="table-responsive">
                        <table class="table table-dark table-sm align-middle mb-0">
                            <thead>
                                <tr class="text-white-50 small">
                                    <th>Img</th><th>SKU</th><th>Cor</th><th>Tam.</th><th>Preço</th><th>Qtd.</th><th class="text-end">Cód. Barras</th>
                                </tr>
                            </thead>
                            <tbody>${grupo.variantes.map(v => renderVarianteRow(v)).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
            gruposContainer.appendChild(card);
        });
    }

    async function fetchEstoque(page = 1, searchQuery = '') {
        try {
            const category = categoryFilterSelect.value;
            const url = `${API_URL}/api/produtos/agrupados?page=${page}&q=${encodeURIComponent(searchQuery)}&categoria=${encodeURIComponent(category)}&filtro=${filtroAtivo === 'todos' ? '' : filtroAtivo}&t=${Date.now()}`;
            const response = await fetch(url, { headers: { 'x-access-token': token } });
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!response.ok) throw new Error('Falha ao carregar o estoque.');

            const data = await response.json();
            renderGrupos(data.produtos);
            renderPagination(data.pagina_atual, data.total_paginas);
            currentPage = data.pagina_atual;
            totalPages = data.total_paginas;
            currentSearch = searchQuery;
        } catch (error) {
            console.error('Erro ao buscar estoque:', error);
            gruposContainer.innerHTML = '<div class="text-center text-danger py-5">Erro ao carregar dados.</div>';
        }
    }

    function renderPagination(paginaAtual, totalPaginas) {
        const container = document.getElementById('paginationContainer');
        container.innerHTML = '';
        if (totalPaginas <= 1) return;

        const nav = document.createElement('nav');
        const ul = document.createElement('ul');
        ul.className = 'pagination';

        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${paginaAtual === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" data-page="${paginaAtual - 1}">Anterior</a>`;
        ul.appendChild(prevLi);

        let startPage, endPage;
        if (totalPaginas <= 5) {
            startPage = 1;
            endPage = totalPaginas;
        } else if (paginaAtual <= 3) {
            startPage = 1;
            endPage = 5;
        } else if (paginaAtual + 2 >= totalPaginas) {
            startPage = totalPaginas - 4;
            endPage = totalPaginas;
        } else {
            startPage = paginaAtual - 2;
            endPage = paginaAtual + 2;
        }

        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === paginaAtual ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            ul.appendChild(li);
        }

        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${paginaAtual === totalPaginas ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" data-page="${paginaAtual + 1}">Próximo</a>`;
        ul.appendChild(nextLi);

        nav.appendChild(ul);
        container.appendChild(nav);
    }

    // Expandir/recolher grupo ao clicar no cabeçalho
    gruposContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.produto-grupo-header');
        if (header) {
            header.closest('.produto-grupo-card').classList.toggle('aberto');
        }
    });

    toggleAllGroupsBtn.addEventListener('click', () => {
        todosExpandidos = !todosExpandidos;
        document.querySelectorAll('.produto-grupo-card').forEach(card => {
            card.classList.toggle('aberto', todosExpandidos);
        });
        toggleAllGroupsBtn.innerHTML = todosExpandidos
            ? '<i class="fas fa-compress"></i> Recolher tudo'
            : '<i class="fas fa-expand"></i> Expandir tudo';
    });

    // Filtros rápidos (Todos / Estoque baixo / Sem estoque)
    document.querySelectorAll('.filtro-rapido-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-rapido-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroAtivo = btn.dataset.filtro;
            fetchEstoque(1, currentSearch);
        });
    });

    categoryFilterSelect.addEventListener('change', () => {
        fetchEstoque(1, currentSearch);
    });

    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchEstoque(1, searchInput.value);
        }, 300);
    });

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('.page-link') && target.dataset.page) {
            event.preventDefault();
            const pageNumber = parseInt(target.dataset.page);
            if (pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
                fetchEstoque(pageNumber, currentSearch);
            }
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // --- INICIALIZAÇÃO ---
    fetchEstoque(1, '');
    fetchStats();
    loadCategories();
});
