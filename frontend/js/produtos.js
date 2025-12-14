const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// Variáveis globais para controlar o estado da página
let currentPage = 1;
let totalPages = 1; // Nova variável global para o total de páginas
let currentSearch = '';
let selectedFiles = []; // Array to store selected files

document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const produtosTableBody = document.getElementById('produtosTableBody');
    const addProdutoBtn = document.getElementById('addProdutoBtn');
    const productSearchInput = document.getElementById('productSearchInput'); // Campo de busca
    const categoryFilterSelect = document.getElementById('categoryFilterSelect'); // Filtro de categoria
    const produtoModal = new bootstrap.Modal(document.getElementById('produtoModal'));
    const produtoForm = document.getElementById('produtoForm');
    const modalTitle = document.getElementById('modalTitle');
    const imagemInput = document.getElementById('imagem');
    const imagePreview = document.getElementById('imagePreview'); // Mantido para compatibilidade, mas usaremos container
    const generateBarcodeBtn = document.getElementById('generateBarcodeBtn');
    const barcodePreviewContainer = document.getElementById('barcodePreviewContainer');
    const barcodePreview = document.getElementById('barcodePreview');

    // Referências para Gerenciamento de Categorias
    const categoriaSelect = document.getElementById('categoriaSelect');
    const categoriaInput = document.getElementById('categoriaInput');
    const toggleCategoriaInputBtn = document.getElementById('toggleCategoriaInput');
    const manageCategoriesBtn = document.getElementById('manageCategoriesBtn');
    const categoriasModal = new bootstrap.Modal(document.getElementById('categoriasModal'));
    const categoriasList = document.getElementById('categoriasList');
    const acaoCategoriaModal = new bootstrap.Modal(document.getElementById('acaoCategoriaModal'));
    const categoriaActionSelect = document.getElementById('categoriaActionSelect');
    const renameContainer = document.getElementById('renameContainer');
    const deleteContainer = document.getElementById('deleteContainer');
    const confirmCategoryActionBtn = document.getElementById('confirmCategoryActionBtn');
    const targetCategorySelect = document.getElementById('targetCategorySelect');

    let isNewCategory = false;

    const colorMap = {
        'preto': '#000000', 'branco': '#FFFFFF', 'cinza': '#808080', 'azul': '#0000FF',
        'vermelho': '#FF0000', 'verde': '#008000', 'amarelo': '#FFFF00', 'rosa': '#FFC0CB',
        'roxo': '#800080', 'laranja': '#FFA500', 'bege': '#F5F5DC', 'marrom': '#A52A2A',
        'vinho': '#800000', 'marinho': '#000080', 'ciano': '#00FFFF', 'magenta': '#FF00FF',
        'lilas': '#C8A2C8', 'coral': '#FF7F50', 'turquesa': '#40E0D0', 'dourado': '#FFD700',
        'prata': '#C0C0C0', 'goiaba': '#E0555D'
    };

    const corInput = document.getElementById('cor');
    const corHexInput = document.getElementById('cor_hex');

    corInput.addEventListener('input', () => {
        const cor = corInput.value.toLowerCase().trim();
        if (colorMap[cor]) {
            corHexInput.value = colorMap[cor];
        }
    });

    /**
     * Busca os produtos da API, aplicando paginação e filtro de busca.
     * @param {number} page - O número da página a ser buscada.
     * @param {string} searchQuery - O termo de busca a ser enviado para a API.
     */
    async function fetchProdutos(page = 1, searchQuery = '') {
        try {
            const category = categoryFilterSelect.value;
            const url = `${API_URL}/api/produtos?page=${page}&q=${searchQuery}&categoria=${category}&t=${Date.now()}`;
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
            totalPages = data.total_paginas; // Atualiza o total de páginas globalmente
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

    // Listener para o filtro de categoria
    categoryFilterSelect.addEventListener('change', () => {
        fetchProdutos(1, currentSearch);
    });

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
            // Correção: Valida contra o totalPages real, não contra o número de botões visíveis
            if (pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
                fetchProdutos(pageNumber, currentSearch);
            }
        }
    });

    // --- Gerenciamento de Categorias ---

    async function loadCategories() {
        try {
            const response = await fetch(`${API_URL}/api/categorias`, { headers: { 'x-access-token': token } });
            const categories = await response.json();

            // Popula select do modal de produto
            categoriaSelect.innerHTML = '<option value="">Selecione...</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categoriaSelect.appendChild(option);
            });

            // Popula filtro de categorias
            const currentFilter = categoryFilterSelect.value;
            categoryFilterSelect.innerHTML = '<option value="">Todas as Categorias</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categoryFilterSelect.appendChild(option);
            });
            categoryFilterSelect.value = currentFilter;

            // Popula lista do modal de gerenciamento
            categoriasList.innerHTML = '';
            categories.forEach(cat => {
                const li = document.createElement('li');
                li.className = 'list-group-item bg-dark text-white d-flex justify-content-between align-items-center border-secondary';
                li.innerHTML = `
                    ${cat}
                    <button class="btn btn-sm btn-outline-info edit-category-btn" data-category="${cat}">Editar</button>
                `;
                categoriasList.appendChild(li);
            });

            // Popula select de destino na exclusão
            targetCategorySelect.innerHTML = '<option value="">Selecione...</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                targetCategorySelect.appendChild(option);
            });

        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    toggleCategoriaInputBtn.addEventListener('click', () => {
        isNewCategory = !isNewCategory;
        if (isNewCategory) {
            categoriaSelect.style.display = 'none';
            categoriaInput.style.display = 'block';
            toggleCategoriaInputBtn.textContent = 'x';
            toggleCategoriaInputBtn.title = 'Cancelar Nova Categoria';
            categoriaInput.focus();
        } else {
            categoriaSelect.style.display = 'block';
            categoriaInput.style.display = 'none';
            toggleCategoriaInputBtn.textContent = '+';
            toggleCategoriaInputBtn.title = 'Nova Categoria';
            categoriaInput.value = '';
        }
    });

    manageCategoriesBtn.addEventListener('click', () => {
        loadCategories();
        categoriasModal.show();
    });

    categoriasList.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-category-btn')) {
            const category = e.target.dataset.category;
            document.getElementById('oldCategoryName').value = category;
            document.getElementById('newCategoryName').value = category;
            document.getElementById('acaoCategoriaTitle').textContent = `Editar Categoria: ${category}`;

            // Reset modal state
            categoriaActionSelect.value = 'rename';
            renameContainer.style.display = 'block';
            deleteContainer.style.display = 'none';

            categoriasModal.hide();
            acaoCategoriaModal.show();
        }
    });

    categoriaActionSelect.addEventListener('change', () => {
        if (categoriaActionSelect.value === 'rename') {
            renameContainer.style.display = 'block';
            deleteContainer.style.display = 'none';
        } else {
            renameContainer.style.display = 'none';
            deleteContainer.style.display = 'block';
        }
    });

    confirmCategoryActionBtn.addEventListener('click', async () => {
        const action = categoriaActionSelect.value;
        const oldName = document.getElementById('oldCategoryName').value;
        const body = { action, old_name: oldName };

        if (action === 'rename') {
            body.new_name = document.getElementById('newCategoryName').value;
        } else {
            const deleteAction = document.getElementById('deleteActionSelect').value;
            if (deleteAction === 'transfer') {
                body.target_category = targetCategorySelect.value;
                if (!body.target_category) return alert('Selecione uma categoria de destino.');
            }
        }

        try {
            const response = await fetch(`${API_URL}/api/categorias/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(body)
            });
            const result = await response.json();

            if (response.ok) {
                alert(result.mensagem);
                acaoCategoriaModal.hide();
                loadCategories(); // Recarrega categorias
                fetchProdutos(currentPage, currentSearch); // Atualiza lista de produtos
            } else {
                alert(`Erro: ${result.erro}`);
            }
        } catch (error) {
            console.error('Erro na ação de categoria:', error);
        }
    });

    // --- Fim Gerenciamento de Categorias ---

    // Carrega nomes para autocomplete
    async function loadProductNames() {
        try {
            const response = await fetch(`${API_URL}/api/produtos/nomes`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Erro ao carregar nomes');
            const nomes = await response.json();
            const datalist = document.getElementById('nomesProdutos');
            datalist.innerHTML = '';
            nomes.forEach(nome => {
                const option = document.createElement('option');
                option.value = nome;
                datalist.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar nomes para autocomplete:', error);
        }
    }

    async function openEditModal(produtoId) {
        await loadCategories(); // Garante que as categorias estejam carregadas
        const response = await fetch(`${API_URL}/api/produtos/${produtoId}?t=${Date.now()}`, { headers: { 'x-access-token': token } });
        const produto = await response.json();
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('sku').value = produto.sku;
        document.getElementById('nome').value = produto.nome;

        // Lógica para selecionar a categoria correta ou mostrar input se não existir na lista (caso raro)
        if (produto.categoria && Array.from(categoriaSelect.options).some(opt => opt.value === produto.categoria)) {
            categoriaSelect.value = produto.categoria;
            isNewCategory = false;
            categoriaSelect.style.display = 'block';
            categoriaInput.style.display = 'none';
            toggleCategoriaInputBtn.textContent = '+';
        } else {
            // Se a categoria do produto não estiver na lista (ou for nova), mostra no input
            categoriaSelect.value = "";
            categoriaInput.value = produto.categoria || "";
            isNewCategory = true;
            categoriaSelect.style.display = 'none';
            categoriaInput.style.display = 'block';
            toggleCategoriaInputBtn.textContent = 'x';
        }

        document.getElementById('cor').value = produto.cor;
        document.getElementById('cor_hex').value = produto.cor_hex || '#000000';
        document.getElementById('tamanho').value = produto.tamanho;
        document.getElementById('preco_custo').value = produto.preco_custo;
        document.getElementById('preco_venda').value = produto.preco_venda;
        document.getElementById('quantidade').value = produto.quantidade;
        document.getElementById('descricao').value = produto.descricao || '';

        // Limpa e reseta arquivos selecionados
        selectedFiles = [];
        const previewContainer = document.getElementById('imagePreviewContainer');
        previewContainer.innerHTML = '';

        // Função auxiliar para criar elemento de imagem
        const createImageElement = (url, id = null) => {
            const div = document.createElement('div');
            div.className = 'position-relative d-inline-block me-2 mb-2';
            div.style.width = '100px';
            div.style.height = '100px';

            const img = document.createElement('img');
            img.src = `${API_URL}/uploads/${url}`;
            img.className = 'img-thumbnail w-100 h-100';
            img.style.objectFit = 'cover';

            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center';
            btn.style.width = '20px';
            btn.style.height = '20px';
            btn.innerHTML = '&times;';
            btn.onclick = async (e) => {
                e.preventDefault();
                if (confirm('Remover esta imagem?')) {
                    if (id) {
                        // Deletar via API se tiver ID (imagem extra)
                        try {
                            const res = await fetch(`${API_URL}/api/produtos/imagem/${id}`, {
                                method: 'DELETE',
                                headers: { 'x-access-token': token }
                            });
                            if (res.ok) {
                                div.remove();
                            } else {
                                alert('Erro ao remover imagem.');
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    } else {
                        // Se for a imagem principal (url no produto), precisamos tratar diferente ou apenas remover visualmente se for upload novo (mas aqui é edit)
                        // Para imagem principal antiga, a API de delete imagem não funciona pois ela deleta da tabela ProdutoImagem.
                        // Mas agora todas as imagens estão em ProdutoImagem também?
                        // O backend salva a primeira em ProdutoImagem também.
                        // Então podemos deletar pelo ID da imagem se tivermos.
                        // O objeto produto retornado deve ter a lista de imagens com IDs.
                        alert('Para remover a imagem de capa, delete-a da lista de imagens adicionais ou substitua enviando uma nova.');
                    }
                }
            };

            div.appendChild(img);
            div.appendChild(btn);
            previewContainer.appendChild(div);
        };

        // Renderiza imagens da lista 'imagens' retornada pela API
        if (produto.imagens && produto.imagens.length > 0) {
            produto.imagens.forEach(img => {
                createImageElement(img.imagem_url, img.id);
            });
        } else if (produto.imagem_url) {
            // Fallback para produtos antigos que só têm imagem_url na tabela produto
            const div = document.createElement('div');
            div.className = 'position-relative d-inline-block me-2 mb-2';
            div.style.width = '100px';
            div.style.height = '100px';

            const img = document.createElement('img');
            img.src = `${API_URL}/uploads/${produto.imagem_url}`;
            img.className = 'img-thumbnail w-100 h-100';
            img.style.objectFit = 'cover';

            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center';
            btn.style.width = '20px';
            btn.style.height = '20px';
            btn.innerHTML = '&times;';
            btn.onclick = async (e) => {
                e.preventDefault();
                if (confirm('Remover esta imagem antiga?')) {
                    try {
                        const res = await fetch(`${API_URL}/api/produtos/${produto.id}/imagem_legacy`, {
                            method: 'DELETE',
                            headers: { 'x-access-token': token }
                        });
                        if (res.ok) {
                            div.remove();
                        } else {
                            alert('Erro ao remover imagem antiga.');
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
            };

            div.appendChild(img);
            div.appendChild(btn);
            previewContainer.appendChild(div);
        }

        modalTitle.textContent = 'Editar Produto';
        generateBarcodeBtn.disabled = false;
        barcodePreview.src = produto.codigo_barras_url ? `${API_URL}/barcodes/${produto.codigo_barras_url}` : '';
        barcodePreviewContainer.style.display = produto.codigo_barras_url ? 'block' : 'none';

        loadProductNames(); // Carrega sugestões de nomes

        produtoModal.show();
    }

    addProdutoBtn.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Adicionar Produto';
        produtoForm.reset();
        document.getElementById('produtoId').value = '';
        document.getElementById('cor_hex').value = '#000000';
        document.getElementById('barcodePreviewContainer').style.display = 'none';
        document.getElementById('imagePreviewContainer').innerHTML = ''; // Limpa previews
        selectedFiles = []; // Clear selected files
        toggleCategoriaInputBtn.textContent = '+';
        toggleCategoriaInputBtn.title = 'Nova Categoria';
        categoriaSelect.style.display = 'block';
        categoriaInput.style.display = 'none';
        categoriaInput.required = false;
        categoriaSelect.required = true;

        loadProductNames(); // Carrega sugestões de nomes

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

        // Envia a categoria correta (Select ou Input)
        const categoriaValue = isNewCategory ? categoriaInput.value : categoriaSelect.value;
        formData.append('categoria', categoriaValue);

        formData.append('cor', document.getElementById('cor').value);
        formData.append('cor_hex', document.getElementById('cor_hex').value);
        formData.append('tamanho', document.getElementById('tamanho').value);
        formData.append('preco_custo', document.getElementById('preco_custo').value);
        formData.append('preco_venda', document.getElementById('preco_venda').value);
        formData.append('quantidade', document.getElementById('quantidade').value);
        formData.append('descricao', document.getElementById('descricao').value);

        // Envia múltiplos arquivos do array acumulado
        for (let i = 0; i < selectedFiles.length; i++) {
            formData.append('imagem', selectedFiles[i]);
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
        const files = event.target.files;
        const previewContainer = document.getElementById('imagePreviewContainer');

        if (files && files.length > 0) {
            Array.from(files).forEach(file => {
                // Add to global array
                selectedFiles.push(file);

                const div = document.createElement('div');
                div.className = 'position-relative d-inline-block local-preview me-2 mb-2';
                div.style.width = '100px';
                div.style.height = '100px';

                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.className = 'img-thumbnail w-100 h-100';
                img.style.objectFit = 'cover';

                const btn = document.createElement('button');
                btn.className = 'btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center';
                btn.style.width = '20px';
                btn.style.height = '20px';
                btn.innerHTML = '&times;';
                btn.onclick = (e) => {
                    e.preventDefault();
                    // Remove from array
                    const index = selectedFiles.indexOf(file);
                    if (index > -1) {
                        selectedFiles.splice(index, 1);
                    }
                    div.remove();
                };

                div.appendChild(img);
                div.appendChild(btn);
                previewContainer.appendChild(div);
            });
        }
        // Reset input value to allow selecting the same file again if needed
        imagemInput.value = '';
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
            const response = await fetch(`${API_URL}/api/produtos/${id}/gerar-barcode`, {
                method: 'POST', headers: { 'x-access-token': token }
            });
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
    loadCategories(); // Carrega categorias para o filtro
});