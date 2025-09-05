// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto
const token = localStorage.getItem('authToken');

// --- VERIFICAÇÃO DE SEGURANÇA ---
if (!token) {
    // CORRIGIDO: Caminho absoluto para a página de login.
    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const produtosTableBody = document.getElementById('produtosTableBody');
    const addProdutoBtn = document.getElementById('addProdutoBtn');
    const produtoModal = new bootstrap.Modal(document.getElementById('produtoModal'));
    const produtoForm = document.getElementById('produtoForm');
    const modalTitle = document.getElementById('modalTitle');
    const imagemInput = document.getElementById('imagem');
    const imagePreview = document.getElementById('imagePreview');

    // --- NOVA LÓGICA: Referências aos elementos do código de barras ---
    const generateBarcodeBtn = document.getElementById('generateBarcodeBtn');
    const barcodePreviewContainer = document.getElementById('barcodePreviewContainer');
    const barcodePreview = document.getElementById('barcodePreview');

    // Função para buscar e exibir os produtos na tabela
    async function fetchProdutos() {
        try {
            const response = await fetch(`${API_URL}/api/produtos`, {
                headers: { 'x-access-token': token }
            });
            if (response.status === 401) {
                window.location.href = '/login.html';
            }
            const produtos = await response.json();
            
            produtosTableBody.innerHTML = '';
            produtos.forEach(produto => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><img src="${API_URL}/uploads/${produto.imagem_url || 'default.png'}" alt="${produto.nome}" width="50" class="rounded"></td>
                    <td>${produto.sku}</td>
                    <td>${produto.nome}</td>
                    <td>${produto.categoria}</td>
                    <td>R$ ${produto.preco_venda.toFixed(2)}</td>
                    <td>${produto.quantidade}</td>
                    <td>
                        <button class="btn btn-sm btn-info edit-btn" data-id="${produto.id}">Editar</button>
                        <button class="btn btn-sm btn-danger delete-btn" data-id="${produto.id}">Excluir</button>
                        ${produto.codigo_barras_url ? `<a href="${API_URL}/barcodes/${produto.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light mt-1">Ver Cód.</a>` : ''}
                    </td>
                `;
                produtosTableBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
        }
    }

    // Função para abrir o modal no modo de edição
    async function openEditModal(produtoId) {
        const response = await fetch(`${API_URL}/api/produtos/${produtoId}`, {
            headers: { 'x-access-token': token }
        });
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

        if (produto.imagem_url) {
            imagePreview.src = `${API_URL}/uploads/${produto.imagem_url}`;
            imagePreview.style.display = 'block';
        } else {
            imagePreview.style.display = 'none';
        }

        modalTitle.textContent = 'Editar Produto';
        
        // --- NOVA LÓGICA: Habilita o botão e mostra o preview do código de barras ---
        generateBarcodeBtn.disabled = false;
        if (produto.codigo_barras_url) {
            barcodePreview.src = `${API_URL}/barcodes/${produto.codigo_barras_url}`;
            barcodePreviewContainer.style.display = 'block';
        } else {
            barcodePreviewContainer.style.display = 'none';
        }

        produtoModal.show();
    }


    // Abre o modal para ADICIONAR um novo produto
    addProdutoBtn.addEventListener('click', () => {
        produtoForm.reset();
        document.getElementById('produtoId').value = '';
        imagePreview.style.display = 'none';
        modalTitle.textContent = 'Adicionar Novo Produto';
        
        // --- NOVA LÓGICA: Garante que o botão e o preview estejam escondidos/desabilitados ---
        generateBarcodeBtn.disabled = true;
        barcodePreviewContainer.style.display = 'none';
        
        produtoModal.show();
    });

    // Event listener para o formulário (CRIAR e EDITAR)
    produtoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('produtoId').value;
        const isNewProduct = !id; // Verifica se é um produto novo
        
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
            const response = await fetch(url, {
                method: method,
                headers: { 'x-access-token': token },
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                await fetchProdutos(); // Atualiza a tabela principal
                
                // --- NOVA LÓGICA: Se for um produto novo, reabre no modo de edição ---
                if (isNewProduct) {
                    alert('Produto criado com sucesso! Agora você já pode gerar o código de barras.');
                    openEditModal(result.id); // Reabre o modal com o produto recém-criado
                } else {
                    produtoModal.hide(); // Se for edição, apenas fecha o modal
                }

            } else {
                alert(`Erro: ${result.erro || result.message}`);
            }
        } catch (error) {
            console.error('Erro ao salvar produto:', error);
        }
    });

    imagemInput.addEventListener('change', () => {
        const file = imagemInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });

    // Delegação de eventos para os botões de EDITAR e EXCLUIR
    produtosTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const id = target.dataset.id;

        if (target.classList.contains('edit-btn')) {
            openEditModal(id);
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                await fetch(`${API_URL}/api/produtos/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                fetchProdutos();
            }
        }
    });

    // --- NOVA LÓGICA: Event Listener para o botão de gerar código de barras ---
    generateBarcodeBtn.addEventListener('click', async () => {
        const id = document.getElementById('produtoId').value;
        if (!id) return; // Segurança extra, mas não deve acontecer

        try {
            const response = await fetch(`${API_URL}/api/produtos/${id}/gerar-barcode`, {
                method: 'POST',
                headers: { 'x-access-token': token },
            });

            const result = await response.json();
            if (response.ok) {
                alert(result.mensagem);
                barcodePreview.src = `${API_URL}/barcodes/${result.url}?t=${new Date().getTime()}`;
                barcodePreviewContainer.style.display = 'block';
                fetchProdutos(); 
            } else {
                alert(`Erro: ${result.erro || 'Ocorreu um problema.'}`);
            }
        } catch (error) {
            console.error('Erro ao gerar código de barras:', error);
        }
    });


    // Logout
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // Carrega os produtos assim que a página é aberta
    fetchProdutos();
});