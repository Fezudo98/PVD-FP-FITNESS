const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// --- VARIÁVEIS GLOBAIS ---
let allProducts = []; // Para armazenar a lista de todos os produtos

document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const cuponsTableBody = document.getElementById('cuponsTableBody');
    const addCupomBtn = document.getElementById('addCupomBtn');
    const cupomModal = new bootstrap.Modal(document.getElementById('cupomModal'));
    const cupomForm = document.getElementById('cupomForm');
    const modalTitle = document.getElementById('modalTitle');
    const aplicacaoSelect = document.getElementById('aplicacao');
    const produtosWrapper = document.getElementById('produtos-wrapper');

    /**
     * Inicializa a biblioteca Select2 no campo de seleção de produtos.
     */
    $('#produtos-select').select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#cupomModal'),
        placeholder: 'Busque e selecione um ou mais produtos',
        language: "pt-BR"
    });

    /**
     * Busca todos os produtos da API para preencher o seletor.
     */
    async function fetchAllProducts() {
        try {
            const response = await fetch(`${API_URL}/api/produtos`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Falha ao carregar produtos.');
            allProducts = await response.json();
        } catch (error) {
            console.error(error);
            alert('Não foi possível carregar a lista de produtos para o formulário.');
        }
    }

    /**
     * Busca e renderiza os cupons na tabela principal.
     */
    async function fetchCupons() {
        try {
            const response = await fetch(`${API_URL}/api/cupons`, {
                headers: { 'x-access-token': token }
            });
            if (response.status === 403) {
                window.location.href = '/index.html';
                return;
            }
            const cupons = await response.json();
            renderCupons(cupons);
        } catch (error) {
            console.error('Erro ao buscar cupons:', error);
        }
    }

    /**
     * Exibe os cupons na tabela.
     * @param {Array} cupons - A lista de cupons a ser renderizada.
     */
    function renderCupons(cupons) {
        cuponsTableBody.innerHTML = '';
        if (cupons.length === 0) {
            cuponsTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum cupom cadastrado.</td></tr>';
            return;
        }
        cupons.forEach(cupom => {
            const tr = document.createElement('tr');
            // Mapeia o valor técnico para um texto amigável
            const aplicacaoTexto = cupom.aplicacao === 'total' ? 'Total da Venda' : 'Produtos Específicos';

            tr.innerHTML = `
                <td>${cupom.id}</td>
                <td><strong>${cupom.codigo}</strong></td>
                <td>${cupom.tipo_desconto === 'percentual' ? 'Percentual' : 'Fixo'}</td>
                <td>${cupom.tipo_desconto === 'percentual' ? `${cupom.valor_desconto}%` : `R$ ${cupom.valor_desconto.toFixed(2)}`}</td>
                <td><span class="badge bg-info">${aplicacaoTexto}</span></td>
                <td>
                    <span class="badge ${cupom.ativo ? 'bg-success' : 'bg-danger'}">
                        ${cupom.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-info edit-btn" data-id="${cupom.id}" data-cupom='${JSON.stringify(cupom)}'>Editar</button>
                    <button class="btn btn-sm btn-warning toggle-status-btn" data-id="${cupom.id}" data-ativo="${cupom.ativo}">
                        ${cupom.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${cupom.id}">Excluir</button>
                </td>
            `;
            cuponsTableBody.appendChild(tr);
        });
    }

    /**
     * Preenche o seletor de produtos no modal.
     */
    function populateProductSelect() {
        const select = $('#produtos-select');
        select.empty(); // Limpa opções antigas
        allProducts.forEach(produto => {
            const option = new Option(`${produto.nome} (SKU: ${produto.sku})`, produto.id, false, false);
            select.append(option);
        });
        select.trigger('change'); // Notifica o Select2 sobre as novas opções
    }

    // --- EVENT LISTENERS ---

    // Abre o modal para ADICIONAR um novo cupom
    addCupomBtn.addEventListener('click', () => {
        cupomForm.reset();
        document.getElementById('cupomId').value = '';
        modalTitle.textContent = 'Adicionar Novo Cupom';
        
        // Garante que o seletor de produtos esteja no estado inicial
        aplicacaoSelect.value = 'total';
        produtosWrapper.classList.add('d-none');
        $('#produtos-select').val(null).trigger('change');
        
        populateProductSelect(); // Carrega os produtos no seletor
        cupomModal.show();
    });

    // Mostra ou esconde o seletor de produtos com base na escolha da aplicação
    aplicacaoSelect.addEventListener('change', () => {
        if (aplicacaoSelect.value === 'produto_especifico') {
            produtosWrapper.classList.remove('d-none');
        } else {
            produtosWrapper.classList.add('d-none');
        }
    });

    // Lida com o envio do formulário (CRIAR e EDITAR)
    cupomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('cupomId').value;
        const isNew = !id;
        const url = isNew ? `${API_URL}/api/cupons` : `${API_URL}/api/cupons/${id}`;
        // O método será PUT para edição, mesmo para alterar os campos, o backend precisa ser ajustado para isso.
        const method = isNew ? 'POST' : 'PUT';

        const cupomData = {
            codigo: document.getElementById('codigo').value,
            tipo_desconto: document.getElementById('tipo_desconto').value,
            valor_desconto: document.getElementById('valor_desconto').value,
            aplicacao: document.getElementById('aplicacao').value,
            produtos_ids: $('#produtos-select').val().map(id => parseInt(id)) // Pega os IDs dos produtos selecionados
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(cupomData)
            });
            if (response.ok) {
                cupomModal.hide();
                fetchCupons();
            } else {
                const error = await response.json();
                alert(`Erro: ${error.erro || 'Ocorreu um problema.'}`);
            }
        } catch (error) {
            console.error('Erro ao salvar cupom:', error);
        }
    });
    
    // Lida com cliques nos botões de Ações na tabela
    cuponsTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        if (!target.dataset.id) return; // Sai se o clique não foi em um botão com data-id
        
        const id = target.dataset.id;

        // Lógica para EDITAR
        if (target.classList.contains('edit-btn')) {
            const cupom = JSON.parse(target.dataset.cupom);
            
            modalTitle.textContent = `Editar Cupom: ${cupom.codigo}`;
            document.getElementById('cupomId').value = cupom.id;
            document.getElementById('codigo').value = cupom.codigo;
            document.getElementById('tipo_desconto').value = cupom.tipo_desconto;
            document.getElementById('valor_desconto').value = cupom.valor_desconto;
            document.getElementById('aplicacao').value = cupom.aplicacao;

            populateProductSelect(); // Carrega os produtos
            
            if (cupom.aplicacao === 'produto_especifico') {
                produtosWrapper.classList.remove('d-none');
                // Pré-seleciona os produtos associados a este cupom
                $('#produtos-select').val(cupom.produtos_validos_ids).trigger('change');
            } else {
                produtosWrapper.classList.add('d-none');
                $('#produtos-select').val(null).trigger('change');
            }
            
            cupomModal.show();
        }

        // Lógica para Ativar/Desativar
        if (target.classList.contains('toggle-status-btn')) {
            const currentStatus = target.dataset.ativo === 'true';
            await fetch(`${API_URL}/api/cupons/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify({ ativo: !currentStatus }) // Envia apenas a alteração de status
            });
            fetchCupons();
        }

        // Lógica para Excluir
        if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este cupom permanentemente?')) {
                await fetch(`${API_URL}/api/cupons/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                fetchCupons();
            }
        }
    });

    // Botão de Logout
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // --- INICIALIZAÇÃO ---
    fetchAllProducts(); // Carrega os produtos uma vez ao carregar a página
    fetchCupons(); // Carrega os cupons para exibir na tabela
});