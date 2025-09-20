const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// Variáveis globais para controlar o estado da página
let currentPage = 1;
let currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const produtosTableBody = document.getElementById('produtosTableBody');
    const addProdutoBtn = document.getElementById('addProdutoBtn');
    const productSearchInput = document.getElementById('productSearchInput'); // Campo de busca
    const produtoModal = new bootstrap.Modal(document.getElementById('produtoModal'));
    const produtoForm = document.getElementById('produtoForm');
    const modalTitle = document.getElementById('modalTitle');
    const imagemInput = document.getElementById('imagem');
    const imagePreview = document.getElementById('imagePreview');
    const generateBarcodeBtn = document.getElementById('generateBarcodeBtn');
    const barcodePreviewContainer = document.getElementById('barcodePreviewContainer');
    const barcodePreview = document.getElementById('barcodePreview');

    /**
     * Busca os produtos da API, aplicando paginação e filtro de busca.
     * @param {number} page - O número da página a ser buscada.
     * @param {string} searchQuery - O termo de busca a ser enviado para a API.
     */
    async function fetchProdutos(page = 1, searchQuery = '') {
        try {
            const url = `${API_URL}/api/produtos?page=${page}&q=${searchQuery}`;
            const response = await fetch(url, {
                headers: { 'x-access-token': token }
            });
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!response.ok) {
                throw new Error('Falha ao buscar produtos.');
            }
            
            const data = await response.json();
            
            produtosTableBody.innerHTML = '';
            if (data.produtos.length === 0) {
                 produtosTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto encontrado.</td></tr>';
            } else {
                data.produtos.forEach(produto => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><img src="${API_URL}/uploads/${produto.imagem_url || 'default.png'}" alt="${produto.nome}" width="50" class="rounded"></td>
                        <td>${produto.sku}</td>
                        <td>${produto.nome}</td>
                        <td>${produto.categoria || 'N/A'}</td>
                        <td>R$ ${produto.preco_venda.toFixed(2)}</td>
                        <td>${produto.quantidade}</td>
                        <td>
                            <button class="btn btn-sm btn-info edit-btn" data-id="${produto.id}">Editar</button>
                            <button class="btn btn-sm btn-danger delete-btn" data-id="${produto.id}">Excluir</button>
                            ${produto.codigo_barras_url ? `<a href="/barcodes/${produto.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light mt-1">Ver Cód.</a>` : ''}
                        </td>
                    `;
                    produtosTableBody.appendChild(tr);
                });
            }

            renderPagination(data.pagina_atual, data.total_paginas);
            currentPage = data.pagina_atual;
            currentSearch = searchQuery;

        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
            produtosTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar produtos.</td></tr>';
        }
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
        nav.setAttribute('aria-label', 'Navegação de produtos');
        
        const ul = document.createElement('ul');
        ul.className = 'pagination';

        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${paginaAtual === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" data-page="${paginaAtual - 1}">Anterior</a>`;
        ul.appendChild(prevLi);

        // Lógica para mostrar um número razoável de páginas
        let startPage, endPage;
        if (totalPaginas <= 5) {
            startPage = 1;
            endPage = totalPaginas;
        } else {
            if (paginaAtual <= 3) {
                startPage = 1;
                endPage = 5;
            } else if (paginaAtual + 2 >= totalPaginas) {
                startPage = totalPaginas - 4;
                endPage = totalPaginas;
            } else {
                startPage = paginaAtual - 2;
                endPage = paginaAtual + 2;
            }
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
        document.querySelector('.table-responsive').after(nav);
    }
    
    // --- EVENT LISTENERS ---

    // Listener para o campo de busca
    let searchTimeout;
    productSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchProdutos(1, productSearchInput.value);
        }, 300);
    });

    // Listener para os cliques na paginação
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('.page-link') && target.dataset.page) {
            event.preventDefault();
            const pageNumber = parseInt(target.dataset.page);
            if (pageNumber >= 1 && pageNumber <= (document.querySelectorAll('.page-item').length - 2) && pageNumber !== currentPage) {
                 fetchProdutos(pageNumber, currentSearch);
            }
        }
    });

    async function openEditModal(produtoId) {
        const response = await fetch(`${API_URL}/api/produtos/${produtoId}`, { headers: { 'x-access-token': token } });
        const produto = await response.json();
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('sku').value = produto.sku;
        document.getElementById('nome').value = produto.nome;
        document.getElementById('categoria').value = produto.categoria;
        document.getElementById('cor').value = produto.cor;
        document.getElementById('tamanho').value = produto.tamanho;
        document.getElementById('preco_custo').value = produto.preco_custo;
        document.getElementById('preco_venda').value = produto.preco_venda;
        document.getElementById('quantidade').value = produto.quantidade;
        imagePreview.src = produto.imagem_url ? `${API_URL}/uploads/${produto.imagem_url}` : '';
        imagePreview.style.display = produto.imagem_url ? 'block' : 'none';
        modalTitle.textContent = 'Editar Produto';
        generateBarcodeBtn.disabled = false;
        barcodePreview.src = produto.codigo_barras_url ? `${API_URL}/barcodes/${produto.codigo_barras_url}` : '';
        barcodePreviewContainer.style.display = produto.codigo_barras_url ? 'block' : 'none';
        produtoModal.show();
    }

    addProdutoBtn.addEventListener('click', () => {
        produtoForm.reset();
        document.getElementById('produtoId').value = '';
        imagePreview.style.display = 'none';
        modalTitle.textContent = 'Adicionar Novo Produto';
        generateBarcodeBtn.disabled = true;
        barcodePreviewContainer.style.display = 'none';
        produtoModal.show();
    });

    produtoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('produtoId').value;
        const url = id ? `${API_URL}/api/produtos/${id}` : `${API_URL}/api/produtos`;
        const method = id ? 'PUT' : 'POST';
        const formData = new FormData();
        formData.append('sku', document.getElementById('sku').value);
        formData.append('nome', document.getElementById('nome').value);
        formData.append('categoria', document.getElementById('categoria').value);
        formData.append('cor', document.getElementById('cor').value);
        formData.append('tamanho', document.getElementById('tamanho').value);
        formData.append('preco_custo', document.getElementById('preco_custo').value);
        formData.append('preco_venda', document.getElementById('preco_venda').value);
        formData.append('quantidade', document.getElementById('quantidade').value);
        if (imagemInput.files[0]) {
            formData.append('imagem', imagemInput.files[0]);
        }

        try {
            const response = await fetch(url, { method, headers: { 'x-access-token': token }, body: formData });
            const result = await response.json();
            if (response.ok) {
                produtoModal.hide();
                fetchProdutos(id ? currentPage : 1, currentSearch);
            } else {
                alert(`Erro: ${result.erro || result.message}`);
            }
        } catch (error) {
            console.error('Erro ao salvar produto:', error);
        }
    });

    imagemInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            imagePreview.src = URL.createObjectURL(file);
            imagePreview.style.display = 'block';
        }
    });

    produtosTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const id = target.dataset.id;
        if (target.classList.contains('edit-btn')) {
            openEditModal(id);
        }
        if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                await fetch(`${API_URL}/api/produtos/${id}`, { method: 'DELETE', headers: { 'x-access-token': token } });
                fetchProdutos(currentPage, currentSearch);
            }
        }
    });

    generateBarcodeBtn.addEventListener('click', async () => {
        const id = document.getElementById('produtoId').value;
        if (!id) return;
        try {
            const response = await fetch(`${API_URL}/api/produtos/${id}/gerar-barcode`, { method: 'POST', headers: { 'x-access-token': token } });
            const result = await response.json();
            if (response.ok) {
                alert(result.mensagem);
                barcodePreview.src = `${API_URL}/barcodes/${result.url}?t=${new Date().getTime()}`;
                barcodePreviewContainer.style.display = 'block';
                fetchProdutos(currentPage, currentSearch);
            } else {
                alert(`Erro: ${result.erro || 'Ocorreu um problema.'}`);
            }
        } catch (error) {
            console.error('Erro ao gerar código de barras:', error);
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // Carrega a primeira página de produtos ao iniciar.
    fetchProdutos(1, '');
});