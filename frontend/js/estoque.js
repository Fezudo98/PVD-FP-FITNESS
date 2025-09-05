// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = '';
const token = localStorage.getItem('authToken');

// Se não houver token, o usuário não está logado. Redireciona para a tela de login.
if (!token) {
    window.location.href = '/login.html';
}

// Variável global para armazenar a lista completa de produtos, facilitando a busca.
let allProducts = [];

// Garante que o script só será executado após a página HTML ser totalmente carregada.
document.addEventListener('DOMContentLoaded', () => {
    const estoqueTableBody = document.getElementById('estoqueTableBody');
    const searchInput = document.getElementById('searchInput');

    /**
     * Busca todos os produtos da API e inicia a renderização da tabela.
     */
    async function fetchEstoque() {
        try {
            const response = await fetch(`${API_URL}/api/produtos`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) {
                throw new Error('Falha ao carregar o estoque. Verifique sua conexão e login.');
            }
            
            allProducts = await response.json();
            renderTable(allProducts); // Renderiza a tabela inicial com todos os produtos.
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
        estoqueTableBody.innerHTML = ''; // Limpa a tabela antes de adicionar novas linhas.

        // Se a lista de produtos estiver vazia, exibe uma mensagem amigável.
        if (productsToRender.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="8" class="text-center text-muted">Nenhum produto encontrado.</td>';
            estoqueTableBody.appendChild(tr);
            return;
        }

        // Itera sobre cada produto para criar uma linha na tabela.
        productsToRender.forEach(produto => {
            const tr = document.createElement('tr');
            
            // Verifica se o estoque está baixo para destacar a linha.
            const isLowStock = produto.quantidade <= produto.limite_estoque_baixo;
            if (isLowStock) {
                tr.classList.add('table-danger'); // Classe do Bootstrap para linhas vermelhas.
            }

            // Gera o botão para ver o código de barras, se ele existir.
            const barcodeButton = produto.codigo_barras_url 
                ? `<a href="${API_URL}/barcodes/${produto.codigo_barras_url}" target="_blank" class="btn btn-sm btn-outline-light">Ver</a>` 
                : 'N/A'; // Se não houver código de barras, exibe 'N/A'.

            // Define o conteúdo HTML da linha da tabela com todos os dados do produto.
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
            estoqueTableBody.appendChild(tr); // Adiciona a linha pronta à tabela.
        });
    }

    /**
     * Filtra a lista de produtos com base no texto digitado no campo de busca.
     */
    function filterTable() {
        const query = searchInput.value.toLowerCase();
        const filteredProducts = allProducts.filter(p => 
            p.nome.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
        renderTable(filteredProducts); // Re-renderiza a tabela com os produtos filtrados.
    }

    // Adiciona o "escutador" de eventos ao campo de busca.
    searchInput.addEventListener('input', filterTable);

    // Adiciona a funcionalidade de logout ao botão de sair.
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear(); // Limpa os dados de login.
        window.location.href = '/login.html'; // Redireciona para a tela de login.
    });

    // Inicia o processo buscando o estoque assim que a página carrega.
    fetchEstoque();
});