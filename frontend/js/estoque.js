// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto
const token = localStorage.getItem('authToken');

// CORRIGIDO: Caminho absoluto para a página de login
if (!token) window.location.href = '/login.html';

let allProducts = []; // Guarda a lista completa de produtos para o filtro

document.addEventListener('DOMContentLoaded', () => {
    const estoqueTableBody = document.getElementById('estoqueTableBody');
    const searchInput = document.getElementById('searchInput');

    // Função para buscar todos os produtos da API
    async function fetchEstoque() {
        try {
            const response = await fetch(`${API_URL}/api/produtos`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Falha ao carregar estoque.');
            
            allProducts = await response.json();
            renderTable(allProducts); // Renderiza a tabela com todos os produtos
        } catch (error) {
            console.error('Erro ao buscar estoque:', error);
        }
    }

    // Função para renderizar (ou re-renderizar) a tabela com os dados
    function renderTable(productsToRender) {
        estoqueTableBody.innerHTML = '';

        // --- CÓDIGO NOVO ADICIONADO AQUI ---
    if (productsToRender.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7" class="text-center text-muted">Nenhum produto encontrado.</td>';
        estoqueTableBody.appendChild(tr);
        return;
    }
    // --- FIM DO CÓDIGO NOVO ---

        productsToRender.forEach(produto => {
            const tr = document.createElement('tr');
            
            // Verifica se o estoque está baixo e aplica uma classe de destaque
            const isLowStock = produto.quantidade <= produto.limite_estoque_baixo;
            if (isLowStock) {
                tr.classList.add('table-danger'); // Classe do Bootstrap para destaque
            }

            // CORRIGIDO: Removida a coluna SKU duplicada
            tr.innerHTML = `
                <td><img src="${API_URL}/uploads/${produto.imagem_url || 'default.png'}" alt="${produto.nome}" width="50" class="rounded"></td>
                <td>${produto.sku}</td>
                <td>${produto.nome}</td>
                <td>${produto.categoria}</td>
                <td>${produto.cor} / ${produto.tamanho}</td>
                <td>R$ ${produto.preco_venda.toFixed(2)}</td>
                <td><strong>${produto.quantidade}</strong></td>
            `;
            estoqueTableBody.appendChild(tr);
        });
    }

    // Função para filtrar a tabela com base na busca
    function filterTable() {
        const query = searchInput.value.toLowerCase();
        const filteredProducts = allProducts.filter(p => 
            p.nome.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
        renderTable(filteredProducts);
    }

    // Event Listeners
    searchInput.addEventListener('input', filterTable);
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
    });

    // Inicia a página buscando o estoque
    fetchEstoque();
});