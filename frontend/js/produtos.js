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

    // Função para buscar e exibir os produtos na tabela
    async function fetchProdutos() {
        try {
            const response = await fetch(`${API_URL}/api/produtos`, {
                headers: { 'x-access-token': token }
            });
            if (response.status === 401) {
                // CORRIGIDO: Caminho absoluto para a página de login.
                window.location.href = '/login.html';
            }
            const produtos = await response.json();
            
            produtosTableBody.innerHTML = '';
            produtos.forEach(produto => {
                const tr = document.createElement('tr');
                // CORRIGIDO: Removida a coluna SKU duplicada
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
                    </td>
                `;
                produtosTableBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
        }
    }

    // Abre o modal para ADICIONAR um novo produto
    addProdutoBtn.addEventListener('click', () => {
        produtoForm.reset();
        document.getElementById('produtoId').value = '';
        imagePreview.style.display = 'none'; // Esconde a preview da imagem
        modalTitle.textContent = 'Adicionar Novo Produto';
        produtoModal.show();
    });

    // Event listener para o formulário (tanto para criar quanto para editar)
    produtoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('produtoId').value;
        const url = id ? `${API_URL}/api/produtos/${id}` : `${API_URL}/api/produtos`;
        const method = id ? 'PUT' : 'POST';

        const formData = new FormData(produtoForm);
        // Os campos já são adicionados automaticamente pelo FormData se tiverem o atributo 'name'
        // Mas para garantir, podemos adicionar manualmente.
        formData.append('sku', document.getElementById('sku').value);
        formData.append('nome', document.getElementById('nome').value);
        formData.append('categoria', document.getElementById('categoria').value);
        formData.append('cor', document.getElementById('cor').value);
        formData.append('tamanho', document.getElementById('tamanho').value);
        formData.append('preco_custo', document.getElementById('preco_custo').value);
        formData.append('preco_venda', document.getElementById('preco_venda').value);
        formData.append('quantidade', document.getElementById('quantidade').value);
        // Opcional: Adicione outros campos se necessário
        // formData.append('limite_estoque_baixo', document.getElementById('limite_estoque_baixo').value);


        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'x-access-token': token },
                body: formData
            });

            if (response.ok) {
                produtoModal.hide();
                fetchProdutos();
            } else {
                const errorData = await response.json();
                alert(`Erro: ${errorData.erro || errorData.message}`);
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
            const response = await fetch(`${API_URL}/api/produtos/${id}`, {
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

            // Lógica da preview da imagem ao editar
            if (produto.imagem_url) {
                imagePreview.src = `${API_URL}/uploads/${produto.imagem_url}`;
                imagePreview.style.display = 'block';
            } else {
                imagePreview.style.display = 'none';
            }

            modalTitle.textContent = 'Editar Produto';
            produtoModal.show();
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

    // Logout (reutilizando a lógica)
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
    });

    // Carrega os produtos assim que a página é aberta
    fetchProdutos();
});