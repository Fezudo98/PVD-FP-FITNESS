const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// --- VARIÁVEIS GLOBAIS ---
let allProducts = []; // Para armazenar a lista de todos os produtos
// CORREÇÃO 1: Adicionar uma variável para guardar os dados dos cupons
let allCupons = [];

document.addEventListener('DOMContentLoaded', async () => {
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
            const response = await fetch(`${API_URL}/api/produtos?per_page=1000`, { // Busca todos para o select
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Falha ao carregar produtos.');
            const data = await response.json();
            allProducts = data.produtos;
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
            // CORREÇÃO 2: Armazenar os cupons buscados na variável global
            allCupons = cupons;
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
            const aplicacaoTexto = cupom.aplicacao === 'total' ? 'Total da Venda' : 'Produtos Específicos';

            // CORREÇÃO 3: Remover o atributo data-cupom que estava causando o erro
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
                    <button class="btn btn-sm btn-info edit-btn" data-id="${cupom.id}">Editar</button>
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
        select.empty();
        allProducts.forEach(produto => {
            const option = new Option(`${produto.nome} (SKU: ${produto.sku})`, produto.id, false, false);
            select.append(option);
        });
        select.trigger('change');
    }

    // --- EVENT LISTENERS ---

    // Abre o modal para ADICIONAR um novo cupom
    addCupomBtn.addEventListener('click', () => {
        cupomForm.reset();
        document.getElementById('cupomId').value = '';
        modalTitle.textContent = 'Adicionar Novo Cupom';
        aplicacaoSelect.value = 'total';
        produtosWrapper.classList.add('d-none');
        $('#produtos-select').val(null).trigger('change');
        populateProductSelect();
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
        const url = id ? `${API_URL}/api/cupons/${id}` : `${API_URL}/api/cupons`;
        const method = id ? 'PUT' : 'POST';
        const cupomData = {
            codigo: document.getElementById('codigo').value.toUpperCase(),
            tipo_desconto: document.getElementById('tipo_desconto').value,
            valor_desconto: document.getElementById('valor_desconto').value,
            aplicacao: document.getElementById('aplicacao').value,
            produtos_ids: $('#produtos-select').val().map(id => parseInt(id))
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
        if (!target.dataset.id) return;

        const id = parseInt(target.dataset.id);

        // CORREÇÃO 4: Lógica para EDITAR refeita para ser mais segura
        if (target.classList.contains('edit-btn')) {
            // Encontra o cupom na variável global 'allCupons' usando o ID do botão
            const cupom = allCupons.find(c => c.id === id);
            if (!cupom) {
                console.error("Cupom não encontrado para o ID:", id);
                return;
            }

            modalTitle.textContent = `Editar Cupom: ${cupom.codigo}`;
            document.getElementById('cupomId').value = cupom.id;
            document.getElementById('codigo').value = cupom.codigo;
            document.getElementById('tipo_desconto').value = cupom.tipo_desconto;
            document.getElementById('valor_desconto').value = cupom.valor_desconto;
            document.getElementById('aplicacao').value = cupom.aplicacao;

            populateProductSelect();

            if (cupom.aplicacao === 'produto_especifico') {
                produtosWrapper.classList.remove('d-none');
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
                body: JSON.stringify({ ativo: !currentStatus })
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

    // --- LÓGICA DE PROMOÇÕES AUTOMÁTICAS (genérico, N gatilhos) ---

    let allPromocoes = [];
    const promocaoModal = new bootstrap.Modal(document.getElementById('promocaoModal'));
    const promocaoForm = document.getElementById('promocaoForm');
    const promocaoGatilhoSelect = document.getElementById('promocaoGatilho');
    const promocaoCodigoWrapper = document.getElementById('promocaoCodigoWrapper');
    const promocaoPrefixoWrapper = document.getElementById('promocaoPrefixoWrapper');
    const promocaoAniversarioInfo = document.getElementById('promocaoAniversarioInfo');

    const GATILHO_LABELS = {
        primeira_compra: 'Primeira Compra',
        primeira_avaliacao: 'Primeira Avaliação',
        aniversario: 'Aniversário'
    };

    function atualizarCamposPorGatilho() {
        promocaoCodigoWrapper.classList.add('d-none');
        promocaoPrefixoWrapper.classList.add('d-none');
        promocaoAniversarioInfo.classList.add('d-none');

        if (promocaoGatilhoSelect.value === 'primeira_avaliacao') {
            promocaoPrefixoWrapper.classList.remove('d-none');
        } else if (promocaoGatilhoSelect.value === 'aniversario') {
            promocaoAniversarioInfo.classList.remove('d-none');
        } else {
            promocaoCodigoWrapper.classList.remove('d-none');
        }
    }
    promocaoGatilhoSelect.addEventListener('change', atualizarCamposPorGatilho);

    async function fetchPromocoes() {
        try {
            const response = await fetch(`${API_URL}/api/promocoes-automaticas`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Falha ao carregar promoções automáticas.');
            allPromocoes = await response.json();
            renderPromocoes(allPromocoes);
        } catch (error) {
            console.error('Erro ao buscar promoções automáticas:', error);
        }
    }

    function renderPromocoes(promocoes) {
        const tbody = document.getElementById('promocoesTableBody');
        tbody.innerHTML = '';
        if (promocoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma promoção automática cadastrada.</td></tr>';
            return;
        }
        promocoes.forEach(p => {
            const tr = document.createElement('tr');
            const valorTexto = p.tipo_desconto === 'percentual' ? `${p.valor_desconto}%` : `R$ ${Number(p.valor_desconto).toFixed(2)}`;
            const codigoTexto = p.gatilho === 'primeira_avaliacao' ? (p.prefixo_codigo || '-') : (p.gatilho === 'aniversario' ? 'Automático' : (p.codigo_cupom || '-'));
            tr.innerHTML = `
                <td>${p.nome}</td>
                <td>${GATILHO_LABELS[p.gatilho] || p.gatilho}</td>
                <td><strong>${codigoTexto}</strong></td>
                <td>${valorTexto}</td>
                <td>
                    <span class="badge ${p.ativo ? 'bg-success' : 'bg-danger'}">${p.ativo ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-info promocao-edit-btn" data-id="${p.id}">Editar</button>
                    <button class="btn btn-sm btn-warning promocao-toggle-btn" data-id="${p.id}" data-ativo="${p.ativo}">
                        ${p.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger promocao-delete-btn" data-id="${p.id}">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('addPromocaoBtn').addEventListener('click', () => {
        promocaoForm.reset();
        document.getElementById('promocaoId').value = '';
        document.getElementById('promocaoModalTitle').textContent = 'Nova Promoção Automática';
        document.getElementById('promocaoAtivo').checked = true;
        atualizarCamposPorGatilho();
        promocaoModal.show();
    });

    promocaoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('promocaoId').value;
        const url = id ? `${API_URL}/api/promocoes-automaticas/${id}` : `${API_URL}/api/promocoes-automaticas`;
        const method = id ? 'PUT' : 'POST';
        const data = {
            nome: document.getElementById('promocaoNome').value,
            gatilho: promocaoGatilhoSelect.value,
            codigo_cupom: document.getElementById('promocaoCodigoCupom').value,
            prefixo_codigo: document.getElementById('promocaoPrefixoCodigo').value,
            tipo_desconto: document.getElementById('promocaoTipoDesconto').value,
            valor_desconto: document.getElementById('promocaoValorDesconto').value,
            ativo: document.getElementById('promocaoAtivo').checked
        };
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                promocaoModal.hide();
                fetchPromocoes();
            } else {
                const error = await response.json();
                alert(`Erro: ${error.erro || 'Ocorreu um problema.'}`);
            }
        } catch (error) {
            console.error('Erro ao salvar promoção automática:', error);
            alert('Erro de conexão.');
        }
    });

    document.getElementById('promocoesTableBody').addEventListener('click', async (e) => {
        const target = e.target;
        if (!target.dataset.id) return;
        const id = parseInt(target.dataset.id);

        if (target.classList.contains('promocao-edit-btn')) {
            const p = allPromocoes.find(x => x.id === id);
            if (!p) return;
            document.getElementById('promocaoModalTitle').textContent = `Editar: ${p.nome}`;
            document.getElementById('promocaoId').value = p.id;
            document.getElementById('promocaoNome').value = p.nome;
            promocaoGatilhoSelect.value = p.gatilho;
            document.getElementById('promocaoCodigoCupom').value = p.codigo_cupom || '';
            document.getElementById('promocaoPrefixoCodigo').value = p.prefixo_codigo || '';
            document.getElementById('promocaoTipoDesconto').value = p.tipo_desconto;
            document.getElementById('promocaoValorDesconto').value = p.valor_desconto;
            document.getElementById('promocaoAtivo').checked = p.ativo;
            atualizarCamposPorGatilho();
            promocaoModal.show();
        }

        if (target.classList.contains('promocao-toggle-btn')) {
            const currentStatus = target.dataset.ativo === 'true';
            await fetch(`${API_URL}/api/promocoes-automaticas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify({ ativo: !currentStatus })
            });
            fetchPromocoes();
        }

        if (target.classList.contains('promocao-delete-btn')) {
            if (confirm('Tem certeza que deseja excluir esta promoção automática permanentemente?')) {
                await fetch(`${API_URL}/api/promocoes-automaticas/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                fetchPromocoes();
            }
        }
    });

    // --- INICIALIZAÇÃO ---
    // Espera os produtos carregarem primeiro, pois são necessários para o modal
    await fetchAllProducts();
    // Depois carrega os cupons
    fetchCupons();
    // Carrega promoções automáticas
    fetchPromocoes();
});