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
    
    const tamanhoSelect = document.getElementById('tamanhoSelect');
    const tamanhoInput = document.getElementById('tamanhoInput');

    tamanhoSelect.addEventListener('change', () => {
        if (tamanhoSelect.value === 'Outro') {
            tamanhoInput.style.display = 'block';
            tamanhoInput.required = true;
            tamanhoInput.focus();
        } else {
            tamanhoInput.style.display = 'none';
            tamanhoInput.required = false;
        }
    });

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
                produtosTableBody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum produto encontrado.</td></tr>';
            } else {
                data.produtos.forEach(produto => {
                    const tr = document.createElement('tr');
                    tr.dataset.id = produto.id;
                    tr.innerHTML = `
                        <td><input class="form-check-input row-checkbox" type="checkbox" value="${produto.id}"></td>
                        <td><img src="${produto.imagem_url ? API_URL + '/uploads/' + produto.imagem_url : '/static/img/no-image.png'}" alt="${produto.nome}" width="50" class="rounded"></td>
                        <td>${produto.sku}</td>
                        <td class="text-truncate" style="max-width: 150px;" title="${produto.nome}">${produto.nome}</td>
                        <td>${produto.categoria || 'N/A'}</td>
                        <td>
                            <div class="input-group input-group-sm" style="width: 110px;">
                                <span class="input-group-text bg-dark text-white border-secondary">R$</span>
                                <input type="number" step="0.01" class="form-control bg-dark text-white border-secondary inline-edit-price" value="${produto.preco_venda.toFixed(2)}" data-id="${produto.id}" data-original="${produto.preco_venda}">
                            </div>
                        </td>
                        <td>
                            <input type="number" class="form-control form-control-sm bg-dark text-white border-secondary inline-edit-qty" style="width: 70px;" value="${produto.quantidade}" data-id="${produto.id}" data-original="${produto.quantidade}">
                        </td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-info rounded-circle me-1 edit-btn" title="Editar Completo" data-id="${produto.id}" style="width: 32px; height: 32px; padding: 0;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger rounded-circle me-1 delete-btn" title="Excluir" data-id="${produto.id}" style="width: 32px; height: 32px; padding: 0;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            ${produto.codigo_barras_url ? `<a href="/barcodes/${produto.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light rounded-circle" title="Ver Cód. Barras" style="width: 32px; height: 32px; padding: 0; line-height: 30px;"><i class="fas fa-barcode"></i></a>` : ''}
                        </td>
                    `;
                    produtosTableBody.appendChild(tr);
                });
            }
            updateBulkActionBar();

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
    
    // --- LÓGICA DE BULK ACTIONS & INLINE EDIT & UNDO ---
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCountSpan = document.getElementById('selectedCount');
    let pendingDeletes = {}; // Armazena timeouts de exclusão pendentes

    function showToast(message, undoCallback = null, duration = 5000) {
        const toastContainer = document.querySelector('.toast-container');
        const toastId = 'toast-' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-dark border-secondary" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="${duration}">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    ${undoCallback ? `<button type="button" class="btn btn-sm btn-outline-warning ms-auto me-2 my-auto undo-btn" style="height: 30px;">Desfazer</button>` : ''}
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                ${undoCallback ? `<div class="progress" style="height: 3px;"><div class="progress-bar bg-warning toast-progress" style="width: 100%; transition: width ${duration}ms linear;"></div></div>` : ''}
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl);
        
        if (undoCallback) {
            // Animação da barra de progresso
            setTimeout(() => {
                const bar = toastEl.querySelector('.progress-bar');
                if(bar) bar.style.width = '0%';
            }, 50);

            const undoBtn = toastEl.querySelector('.undo-btn');
            undoBtn.addEventListener('click', () => {
                undoCallback();
                toast.hide();
            });
        }
        
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    }

    function getSelectedIds() {
        const checkboxes = document.querySelectorAll('.row-checkbox:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    }

    window.updateBulkActionBar = function() {
        const selected = getSelectedIds();
        if (selected.length > 0) {
            selectedCountSpan.textContent = selected.length;
            bulkActionsBar.classList.remove('d-none');
        } else {
            bulkActionsBar.classList.add('d-none');
        }
        
        if(selectAllCheckbox) {
            const allBoxes = document.querySelectorAll('.row-checkbox');
            selectAllCheckbox.checked = allBoxes.length > 0 && selected.length === allBoxes.length;
        }
    };

    if(selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateBulkActionBar();
        });
    }

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            updateBulkActionBar();
        }
    });

    const closeBulk = () => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        updateBulkActionBar();
    };
    document.getElementById('closeBulkBtn').addEventListener('click', closeBulk);
    if(document.getElementById('closeBulkBtnMobile')) {
        document.getElementById('closeBulkBtnMobile').addEventListener('click', closeBulk);
    }

    // Inline Edit Logic
    async function quickUpdate(id, field, value, originalValue, inputEl) {
        try {
            const body = {};
            body[field] = value;
            const res = await fetch(`${API_URL}/api/produtos/${id}/quick`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(body)
            });
            if(!res.ok) throw new Error("Erro ao salvar");
            
            inputEl.dataset.original = value;
            inputEl.classList.add('border-success');
            setTimeout(() => inputEl.classList.remove('border-success'), 1000);

            showToast(`${field === 'quantidade' ? 'Estoque' : 'Preço'} atualizado.`, async () => {
                // Undo Logic
                const undoBody = {};
                undoBody[field] = originalValue;
                await fetch(`${API_URL}/api/produtos/${id}/quick`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                    body: JSON.stringify(undoBody)
                });
                inputEl.value = originalValue;
                inputEl.dataset.original = originalValue;
            });
        } catch(e) {
            showToast(`Erro ao atualizar: ${e.message}`);
            inputEl.value = originalValue; // Revert visually
        }
    }

    produtosTableBody.addEventListener('change', (e) => {
        if(e.target.classList.contains('inline-edit-qty')) {
            const id = e.target.dataset.id;
            const original = e.target.dataset.original;
            quickUpdate(id, 'quantidade', e.target.value, original, e.target);
        } else if(e.target.classList.contains('inline-edit-price')) {
            const id = e.target.dataset.id;
            const original = e.target.dataset.original;
            quickUpdate(id, 'preco_venda', e.target.value, original, e.target);
        }
    });

    // Bulk Delete Logic (Delay Delete)
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
        const ids = getSelectedIds();
        if(ids.length === 0) return;
        
        // Hide rows instantly
        ids.forEach(id => {
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if(row) row.style.display = 'none';
        });
        
        // Uncheck all so bar hides
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
        updateBulkActionBar();

        const timeoutId = setTimeout(async () => {
            // Actual delete
            try {
                await fetch(`${API_URL}/api/produtos/bulk`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                    body: JSON.stringify({ ids: ids })
                });
                delete pendingDeletes[timeoutId];
            } catch(e) { console.error("Falha ao excluir bulk:", e); }
        }, 5000);
        
        pendingDeletes[timeoutId] = ids;
        
        showToast(`${ids.length} produto(s) excluído(s).`, () => {
            // Undo
            clearTimeout(timeoutId);
            delete pendingDeletes[timeoutId];
            ids.forEach(id => {
                const row = document.querySelector(`tr[data-id="${id}"]`);
                if(row) row.style.display = '';
            });
        }, 5000);
    });

    document.getElementById('bulkZeroStockBtn').addEventListener('click', async () => {
        const ids = getSelectedIds();
        if(ids.length === 0) return;

        let errorCount = 0;
        
        for (const id of ids) {
            try {
                const inputEl = document.querySelector(`tr[data-id="${id}"] .inline-edit-qty`);
                const originalValue = inputEl.dataset.original;
                
                await fetch(`${API_URL}/api/produtos/${id}/quick`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                    body: JSON.stringify({ quantidade: 0 })
                });
                
                if (inputEl) {
                    inputEl.value = 0;
                    inputEl.dataset.original = 0;
                    inputEl.classList.add('border-success');
                    setTimeout(() => inputEl.classList.remove('border-success'), 1000);
                }
            } catch(e) {
                errorCount++;
            }
        }
        
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
        updateBulkActionBar();
        
        if (errorCount === 0) {
            showToast(`${ids.length} produto(s) zerados com sucesso.`);
        } else {
            showToast(`Concluído, porém ${errorCount} erro(s) ao zerar.`);
        }
    });

    // Single Delete Override (Delay Delete)
    produtosTableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(deleteBtn.dataset.id);
            const row = deleteBtn.closest('tr');
            row.style.display = 'none';
            
            const timeoutId = setTimeout(async () => {
                try {
                    await fetch(`${API_URL}/api/produtos/${id}`, {
                        method: 'DELETE',
                        headers: { 'x-access-token': token }
                    });
                } catch(err) { console.error(err); }
            }, 5000);
            
            showToast(`Produto excluído.`, () => {
                clearTimeout(timeoutId);
                row.style.display = '';
            }, 5000);
        }
    });

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
        
        const optionsTamanho = Array.from(tamanhoSelect.options).map(opt => opt.value);
        if (produto.tamanho && optionsTamanho.includes(produto.tamanho) && produto.tamanho !== 'Outro') {
            tamanhoSelect.value = produto.tamanho;
            tamanhoInput.style.display = 'none';
            tamanhoInput.value = '';
            tamanhoInput.required = false;
        } else if (produto.tamanho) {
            tamanhoSelect.value = 'Outro';
            tamanhoInput.style.display = 'block';
            tamanhoInput.value = produto.tamanho;
            tamanhoInput.required = true;
        } else {
            tamanhoSelect.value = '';
            tamanhoInput.style.display = 'none';
            tamanhoInput.value = '';
            tamanhoInput.required = false;
        }
        
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
            btn.style.zIndex = '100';
            btn.type = 'button';
            btn.innerHTML = '&times;';
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Remove from array
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

            const starBtn = document.createElement('button');
            const isCover = (url === produto.imagem_url);
            starBtn.className = 'btn bg-white btn-sm position-absolute top-0 start-0 p-0 d-flex align-items-center justify-content-center rounded-circle shadow-sm m-1';
            starBtn.style.width = '30px';
            starBtn.style.height = '30px';
            starBtn.style.zIndex = '100';
            starBtn.type = 'button';
            starBtn.innerHTML = isCover ? '<i class="fas fa-star text-warning" style="font-size: 16px;"></i>' : '<i class="fas fa-star text-secondary" style="font-size: 16px;"></i>';
            starBtn.style.opacity = isCover ? '1' : '0.8';
            starBtn.title = isCover ? 'Imagem de Capa' : 'Definir como Capa';

            starBtn.onmouseover = () => { starBtn.style.opacity = '1'; };
            starBtn.onmouseout = () => { starBtn.style.opacity = isCover ? '1' : '0.8'; };

            starBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (confirm('Definir esta imagem como capa e mover para primeira posição?')) {
                    try {
                        // 1. Mover visualmente para o topo
                        div.parentElement.prepend(div);

                        // 2. Chamar API de Capa
                        await fetch(`${API_URL}/api/produtos/${produto.id}/imagem_capa`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-access-token': token
                            },
                            body: JSON.stringify({ imagem_url: url })
                        });

                        // 3. Salvar ordem
                        await saveImageOrder(produto.id);

                        if (true) { // Sempre recarrega para garantir
                            openEditModal(produto.id);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('Erro ao atualizar imagem de capa.');
                    }
                }
            };

            div.appendChild(img);
            div.appendChild(btn);
            div.appendChild(starBtn);
            div.dataset.id = id;
            div.dataset.filename = url; // Store filename for cover update
            previewContainer.appendChild(div);
        };

        // Init Sortable
        if (!previewContainer.classList.contains('sortable-initialized')) {
            new Sortable(previewContainer, {
                animation: 150,
                ghostClass: 'bg-light',
                onEnd: async function (evt) {
                    // 1. Salvar nova ordem primeiro
                    await saveImageOrder(produto.id);

                    // 2. Se o item foi movido para a primeira posição (index 0), torna-se Capa
                    if (evt.newIndex === 0) {
                        const firstDiv = previewContainer.children[0];
                        const filename = firstDiv.dataset.filename;

                        if (filename) {
                            try {
                                await fetch(`${API_URL}/api/produtos/${produto.id}/imagem_capa`, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-access-token': token
                                    },
                                    body: JSON.stringify({ imagem_url: filename })
                                });
                                // Recarrega para atualizar estrelas
                                openEditModal(produto.id);
                            } catch (err) {
                                console.error('Erro ao definir capa após reordenar:', err);
                            }
                        }
                    }
                }
            });
            previewContainer.classList.add('sortable-initialized');
        }

        const saveImageOrder = async (produtoId) => {
            const container = document.getElementById('imagePreviewContainer');
            const divs = container.querySelectorAll('div[data-id]');
            const ids = Array.from(divs).map(div => parseInt(div.dataset.id)).filter(id => !isNaN(id));

            if (ids.length > 0) {
                try {
                    await fetch(`${API_URL}/api/produtos/${produtoId}/reordenar_imagens`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                        body: JSON.stringify({ ids: ids })
                    });
                } catch (err) {
                    console.error('Erro ao salvar ordem:', err);
                }
            }
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
            btn.style.zIndex = '100';
            btn.type = 'button';
            btn.innerHTML = '&times;';
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
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

            const starBtn = document.createElement('button');
            const isCover = true;
            starBtn.className = 'btn bg-white btn-sm position-absolute top-0 start-0 p-0 d-flex align-items-center justify-content-center rounded-circle shadow-sm m-1';
            starBtn.style.width = '30px';
            starBtn.style.height = '30px';
            starBtn.style.zIndex = '100';
            starBtn.type = 'button';
            starBtn.innerHTML = '<i class="fas fa-star text-warning" style="font-size: 16px;"></i>';
            starBtn.title = 'Imagem de Capa';

            div.appendChild(img);
            div.appendChild(btn);
            div.appendChild(starBtn);
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
        
        tamanhoSelect.value = '';
        tamanhoInput.value = '';
        tamanhoInput.style.display = 'none';
        tamanhoInput.required = false;
        
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
        
        const tamanhoValue = tamanhoSelect.value === 'Outro' ? tamanhoInput.value : tamanhoSelect.value;
        formData.append('tamanho', tamanhoValue);
        
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

    // Novo Renderizador de Previews Locais
    const renderSelectedPreviews = () => {
        // Remover previews locais existentes
        const existingPreviews = document.querySelectorAll('.local-preview');
        existingPreviews.forEach(el => el.remove());

        const previewContainer = document.getElementById('imagePreviewContainer');

        selectedFiles.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'position-relative d-inline-block local-preview me-2 mb-2';
            div.style.width = '100px';
            div.style.height = '100px';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.className = 'img-thumbnail w-100 h-100';
            img.style.objectFit = 'cover';

            // Botão Remover
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center';
            btn.style.width = '20px';
            btn.style.height = '20px';
            btn.style.zIndex = '100';
            btn.type = 'button';
            btn.innerHTML = '&times;';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Remove from array and redraw
                selectedFiles.splice(index, 1);
                renderSelectedPreviews();
            };

            // Botão Star (Capa) - Para uploads pendentes, mostrar apenas estrela vazia indicando que será adicionado.
            // O backend define a primeira imagem como capa SE não houver capa.
            // Para evitar confusão visual (duas estrelas douradas), vamos mostrar sempre vazia ou um ícone diferente.
            // Se o usuário clicar, movemos para o topo (index 0), garantindo que SE for a primeira imagem do produto, será capa.

            const starBtn = document.createElement('button');
            const isCover = false; // Pending uploads never show as "Current Cover" visually to avoid conflict with existing cover.

            starBtn.className = 'btn bg-white btn-sm position-absolute top-0 start-0 p-0 d-flex align-items-center justify-content-center rounded-circle shadow-sm m-1 opacity-75';
            starBtn.style.width = '30px';
            starBtn.style.height = '30px';
            starBtn.style.zIndex = '100';
            starBtn.type = 'button';
            starBtn.innerHTML = '<i class="fas fa-star text-secondary" style="font-size: 16px;"></i>';

            starBtn.onmouseover = () => { starBtn.style.opacity = '1'; };
            starBtn.onmouseout = () => { starBtn.style.opacity = '0.75'; };
            starBtn.title = 'Mover para primeira posição (Será capa se não houver outra)';

            starBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (index === 0) return;

                // Mover para o início do array
                const item = selectedFiles.splice(index, 1)[0];
                selectedFiles.unshift(item);
                renderSelectedPreviews();
            };

            div.appendChild(img);
            div.appendChild(btn);
            div.appendChild(starBtn);
            previewContainer.appendChild(div);
        });
    };

    imagemInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            for (const file of Array.from(files)) {
                if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                    try {
                        const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
                        const finalBlob = Array.isArray(blob) ? blob[0] : blob;
                        const newFile = new File([finalBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
                            type: "image/jpeg"
                        });
                        selectedFiles.push(newFile);
                    } catch (err) {
                        console.error('Erro na conversão HEIC:', err);
                        alert(`Erro ao converter ${file.name}. Tente usar JPG/PNG.`);
                    }
                } else {
                    selectedFiles.push(file);
                }
            }
            renderSelectedPreviews();
        }
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