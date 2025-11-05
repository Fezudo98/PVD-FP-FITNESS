// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = ''; 
const token = localStorage.getItem('authToken');
const userData = JSON.parse(localStorage.getItem('userData'));

// --- BARREIRA DE SEGURANÇA ---
// Garante que apenas usuários logados E que sejam administradores possam ver esta página.
// Se qualquer uma das condições falhar, redireciona para o painel principal.
if (!token || !userData || userData.role !== 'admin') {
    window.location.href = '/index.html';
}

// O código abaixo só é executado se o usuário for um admin autenticado.
document.addEventListener('DOMContentLoaded', () => {
    
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const saldoAtualDisplay = document.getElementById('saldoAtualDisplay');
    const movimentacoesTableBody = document.getElementById('movimentacoesTableBody');
    const ajusteCaixaForm = document.getElementById('ajusteCaixaForm');

    /**
     * Busca e exibe o saldo atual do caixa na API.
     */
    async function fetchSaldo() {
        try {
            const response = await fetch(`${API_URL}/api/caixa/saldo`, {
                headers: { 'x-access-token': token }
            });
            const data = await response.json();
            saldoAtualDisplay.textContent = `R$ ${data.saldo_atual.toFixed(2).replace('.', ',')}`;
        } catch (error) {
            console.error("Erro ao buscar saldo:", error);
            saldoAtualDisplay.textContent = "Erro!";
        }
    }

    /**
     * Busca e renderiza o histórico de movimentações na tabela.
     */
    async function fetchMovimentacoes() {
        movimentacoesTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando histórico...</td></tr>';
        try {
            const response = await fetch(`${API_URL}/api/caixa/movimentacoes`, {
                headers: { 'x-access-token': token }
            });
            const movimentacoes = await response.json();
            
            movimentacoesTableBody.innerHTML = '';
            if (movimentacoes.length === 0) {
                movimentacoesTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma movimentação registrada.</td></tr>';
                return;
            }

            // Itera sobre cada movimentação e cria uma linha na tabela
            movimentacoes.forEach(m => {
                const tr = document.createElement('tr');
                const valorClasse = m.valor > 0 ? 'text-success' : 'text-danger';
                const valorFormatado = `${m.valor > 0 ? '+' : ''} R$ ${m.valor.toFixed(2).replace('.', ',')}`;
                const tipoBadge = m.tipo.toLowerCase().includes('venda') ? 'bg-primary' : (m.tipo.toLowerCase().includes('reembolso') ? 'bg-warning text-dark' : 'bg-info text-dark');

                tr.innerHTML = `
                    <td>${m.timestamp}</td>
                    <td><span class="badge ${tipoBadge}">${m.tipo}</span></td>
                    <td class="${valorClasse}"><strong>${valorFormatado}</strong></td>
                    <td>${m.usuario_nome}</td>
                    <td>${m.observacao || 'N/A'}</td>
                `;
                movimentacoesTableBody.appendChild(tr);
            });

        } catch (error) {
            console.error("Erro ao buscar movimentações:", error);
            movimentacoesTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar histórico.</td></tr>';
        }
    }
    
    /**
     * Lida com o envio do formulário de ajuste manual do caixa.
     */
    ajusteCaixaForm.addEventListener('submit', async (e) => {
        // Impede o recarregamento da página
        e.preventDefault();
        
        const tipoAjuste = document.getElementById('tipoAjuste').value;
        let valorAjuste = parseFloat(document.getElementById('valorAjuste').value);
        const observacao = document.getElementById('observacaoAjuste').value;
        
        // Se a movimentação for uma "Saída", converte o valor para negativo
        if (tipoAjuste === 'AJUSTE_MANUAL_SAIDA' && valorAjuste > 0) {
            valorAjuste = -valorAjuste;
        }

        const body = {
            tipo: tipoAjuste,
            valor: valorAjuste,
            observacao: observacao
        };

        try {
            const response = await fetch(`${API_URL}/api/caixa/ajustar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.erro || 'Ocorreu um erro ao processar a solicitação.');
            }

            alert(result.mensagem);
            ajusteCaixaForm.reset();
            
            // Atualiza os dados na tela para refletir o ajuste imediatamente
            fetchSaldo();
            fetchMovimentacoes();

        } catch (error) {
            alert(`Erro: ${error.message}`);
        }
    });

    // --- Funcionalidade do Botão de Logout ---
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // --- INICIALIZAÇÃO ---
    // Carrega os dados do caixa assim que a página é aberta
    fetchSaldo();
    fetchMovimentacoes();
});