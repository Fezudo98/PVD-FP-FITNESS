const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// Variáveis globais para controlar o estado
let currentPage = 1;
let currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
    const estoqueTableBody = document.getElementById('estoqueTableBody');
    const searchInput = document.getElementById('searchInput');

    /**
     * Busca os produtos da API, aplicando paginação e filtro de busca.
     * @param {number} page - O número da página a ser buscada.
     * @param {string} searchQuery - O termo de busca a ser enviado para a API.
     */
    async function fetchEstoque(page = 1, searchQuery = '') {
        try {
            // Constrói a URL com os parâmetros de página e busca
            const url = `${API_URL}/api/produtos?page=${page}&q=${searchQuery}`;
            const response = await fetch(url, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) {
                throw new Error('Falha ao carregar o estoque.');
            }

            const data = await response.json();
            renderTable(data.produtos); // Renderiza os produtos da página
            renderPagination(data.pagina_atual, data.total_paginas); // Renderiza a paginação

            // Atualiza o estado global
            currentPage = data.pagina_atual;
            currentSearch = searchQuery;

        } catch (error) {
            console.error('Erro ao buscar estoque:', error);
            estoqueTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    }

    /**
     * Renderiza a tabela de estoque com uma lista de produtos.
     * @param {Array} productsToRender - A lista de produtos a ser exibida.
     */
    function renderTable(productsToRender) {
        estoqueTableBody.innerHTML = '';
        if (productsToRender.length === 0) {
            estoqueTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum produto encontrado.</td></tr>';
            return;
        }

        productsToRender.forEach(produto => {
            const tr = document.createElement('tr');
            const isLowStock = produto.quantidade <= produto.limite_estoque_baixo;
            if (isLowStock) {
                tr.classList.add('table-danger');
            }

            const barcodeButton = produto.codigo_barras_url
                ? `<a href="/barcodes/${produto.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light">Ver</a>`
                : 'N/A';

            tr.innerHTML = `
                <td><img src="${API_URL}/uploads/${produto.imagem_url || 'default.png'}" alt="${produto.nome}" width="50" class="rounded"></td>
                <td>${produto.sku}</td>
                <td>${produto.nome}</td>
                <td>${produto.categoria || 'N/A'}</td>
                <td>${produto.cor || ''} / ${produto.tamanho || ''}</td>
                <td>R$ ${produto.preco_venda.toFixed(2)}</td>
                <td><strong>${produto.quantidade}</strong></td>
                <td>${barcodeButton}</td>
            `;
            estoqueTableBody.appendChild(tr);
        });
    }

    /**
     * Cria e exibe os botões de navegação da paginação.
     */
    function renderPagination(paginaAtual, totalPaginas) {
        const oldPagination = document.querySelector('.pagination-nav');
        if (oldPagination) oldPagination.remove();
        if (totalPaginas <= 1) return;

        const nav = document.createElement('nav');
        nav.className = 'pagination-nav d-flex justify-content-center mt-4';
        const ul = document.createElement('ul');
        ul.className = 'pagination';

        const maxVisibleButtons = 5;
        let startPage, endPage;

        if (totalPaginas <= maxVisibleButtons) {
            startPage = 1;
            endPage = totalPaginas;
        } else {
            const maxPagesBeforeCurrent = Math.floor(maxVisibleButtons / 2);
            const maxPagesAfterCurrent = Math.ceil(maxVisibleButtons / 2) - 1;

            if (paginaAtual <= maxPagesBeforeCurrent) {
                startPage = 1;
                endPage = maxVisibleButtons;
            } else if (paginaAtual + maxPagesAfterCurrent >= totalPaginas) {
                startPage = totalPaginas - maxVisibleButtons + 1;
                endPage = totalPaginas;
            } else {
                startPage = paginaAtual - maxPagesBeforeCurrent;
                endPage = paginaAtual + maxPagesAfterCurrent;
            }
        }

        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${paginaAtual === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" data-page="${paginaAtual - 1}">Anterior</a>`;
        ul.appendChild(prevLi);

        // First page and ellipsis
        if (startPage > 1) {
            const liFirst = document.createElement('li');
            liFirst.className = 'page-item';
            liFirst.innerHTML = `<a class="page-link" href="#" data-page="1">1</a>`;
            ul.appendChild(liFirst);

            if (startPage > 2) {
                const liEllipsis = document.createElement('li');
                liEllipsis.className = 'page-item disabled';
                liEllipsis.innerHTML = `<span class="page-link">...</span>`;
                ul.appendChild(liEllipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === paginaAtual ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            ul.appendChild(li);
        }

        // Last page and ellipsis
        if (endPage < totalPaginas) {
            if (endPage < totalPaginas - 1) {
                const liEllipsis = document.createElement('li');
                liEllipsis.className = 'page-item disabled';
                liEllipsis.innerHTML = `<span class="page-link">...</span>`;
                ul.appendChild(liEllipsis);
            }

            const liLast = document.createElement('li');
            liLast.className = 'page-item';
            liLast.innerHTML = `<a class="page-link" href="#" data-page="${totalPaginas}">${totalPaginas}</a>`;
            ul.appendChild(liLast);
        }

        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${paginaAtual === totalPaginas ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" data-page="${paginaAtual + 1}">Próximo</a>`;
        ul.appendChild(nextLi);

        nav.appendChild(ul);
        document.querySelector('.table-responsive').after(nav);
    }

    // --- EVENT LISTENERS ---

    // Listener para o campo de busca (aciona a busca ao digitar)
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchEstoque(1, searchInput.value); // Sempre busca da página 1 ao iniciar uma nova pesquisa
        }, 300); // Debounce de 300ms para não fazer requisições a cada tecla
    });

    // Listener para os cliques nos botões de paginação
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('.page-link') && target.dataset.page) {
            event.preventDefault();
            const pageNumber = parseInt(target.dataset.page);
            // Busca a nova página mantendo o termo de busca atual
            fetchEstoque(pageNumber, currentSearch);
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // --- INICIALIZAÇÃO ---
    fetchEstoque(1, ''); // Carrega a primeira página sem busca ao iniciar
});