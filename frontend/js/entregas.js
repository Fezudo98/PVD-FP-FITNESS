// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = ''; 

// Pega os dados de autenticação do armazenamento local.
const token = localStorage.getItem('authToken');
const userDataString = localStorage.getItem('userData');
const userData = userDataString ? JSON.parse(userDataString) : null;

// --- BARREIRA DE SEGURANÇA ---
// Garante que apenas administradores logados possam ver esta página.
if (!token || !userData) {
    window.location.href = '/login.html'; // Redireciona se não estiver logado
} else if (userData.role !== 'admin') {
    window.location.href = '/index.html'; // Redireciona se não for admin
} else {
    // O código principal só é executado se o usuário for um admin autenticado.
    document.addEventListener('DOMContentLoaded', () => {
        
        // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
        const dataInicioInput = document.getElementById('dataInicio');
        const dataFimInput = document.getElementById('dataFim');
        const filtrarBtn = document.getElementById('filtrarBtn');
        const kpiTotalEntregas = document.getElementById('kpiTotalEntregas');
        const kpiValorTaxas = document.getElementById('kpiValorTaxas');
        const entregasTableBody = document.getElementById('entregasTableBody');

        /**
         * Busca os dados do relatório na API e atualiza a página.
         */
        async function fetchAndRenderReport() {
            const dataInicio = dataInicioInput.value;
            const dataFim = dataFimInput.value;

            if (!dataInicio || !dataFim) {
                alert('Por favor, selecione as datas de início e fim.');
                return;
            }

            // Mostra uma mensagem de carregamento na tabela
            entregasTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando relatório...</td></tr>';
            
            const url = `${API_URL}/api/relatorios/entregas?data_inicio=${dataInicio}&data_fim=${dataFim}`;

            try {
                const response = await fetch(url, {
                    headers: { 'x-access-token': token }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Falha ao buscar o relatório.');
                }
                
                const data = await response.json();
                renderKPIs(data.kpis);
                renderEntregasTable(data.lista_entregas);

            } catch (error) {
                console.error('Erro ao gerar relatório de entregas:', error);
                entregasTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
            }
        }

        /**
         * Renderiza os cards de indicadores (KPIs).
         * @param {object} kpis - O objeto com os totais.
         */
        function renderKPIs(kpis) {
            kpiTotalEntregas.textContent = kpis.quantidade_entregas;
            kpiValorTaxas.textContent = `R$ ${kpis.valor_total_taxas.toFixed(2).replace('.', ',')}`;
        }

        /**
         * Renderiza a tabela com a lista de entregas.
         * @param {Array} entregas - A lista de objetos de entrega.
         */
        function renderEntregasTable(entregas) {
            entregasTableBody.innerHTML = '';

            if (!entregas || entregas.length === 0) {
                entregasTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhuma entrega encontrada no período selecionado.</td></tr>';
                return;
            }

            entregas.forEach(entrega => {
                const tr = document.createElement('tr');
                
                // Define uma cor de badge para o status da entrega
                const statusBadge = entrega.status_entrega === 'Grátis' 
                    ? `<span class="badge bg-info">${entrega.status_entrega}</span>`
                    : `<span class="badge bg-success">${entrega.status_entrega}</span>`;

                tr.innerHTML = `
                    <td>${entrega.data_hora}</td>
                    <td>${entrega.cliente}</td>
                    <td>${entrega.endereco}</td>
                    <td>${entrega.cidade}</td>
                    <td>R$ ${entrega.taxa_entrega.toFixed(2).replace('.', ',')}</td>
                    <td>${statusBadge}</td>
                `;
                entregasTableBody.appendChild(tr);
            });
        }

        /**
         * Define as datas padrão nos filtros e carrega o relatório inicial.
         */
        function initializePage() {
            const hoje = new Date();
            const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

            // Formata as datas para o formato AAAA-MM-DD
            dataFimInput.value = hoje.toISOString().split('T')[0];
            dataInicioInput.value = primeiroDiaDoMes.toISOString().split('T')[0];

            // Carrega os dados do mês atual ao abrir a página
            fetchAndRenderReport();
        }

        // --- EVENT LISTENERS ---

        // Ação do botão de filtrar
        filtrarBtn.addEventListener('click', fetchAndRenderReport);

        // Ação do botão de sair (logout)
        document.getElementById('logoutButton').addEventListener('click', () => {
            localStorage.clear();
            window.location.href = '/login.html';
        });

        // --- INICIALIZAÇÃO ---
        initializePage();
    });
}