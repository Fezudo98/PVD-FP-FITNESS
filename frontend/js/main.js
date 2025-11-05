// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = ''; 

// Executa o código quando o HTML da página estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('authToken');
    const userDataString = localStorage.getItem('userData');
    
    // 1. Barreira de Segurança: Se não tem token, o usuário não está logado.
    // Redireciona para a tela de login.
    if (!token || !userDataString) {
        window.location.href = '/login.html';
        return; // Interrompe a execução do script
    }

    const userData = JSON.parse(userDataString);

    // 2. Personaliza a página com os dados do usuário
    const userNameSpan = document.getElementById('userName');
    userNameSpan.textContent = userData.nome;

    // 3. Controle de Acesso: Mostra o painel de admin se o cargo do usuário for 'admin'
    if (userData.role === 'admin') {
        const adminPanel = document.getElementById('admin-panel');
        adminPanel.classList.remove('d-none');
    }

    /**
     * Busca o saldo atual do caixa na API e atualiza o display na tela.
     * Esta função é assíncrona, pois depende de uma resposta da rede.
     */
    async function carregarSaldoCaixa() {
        try {
            const response = await fetch(`${API_URL}/api/caixa/saldo`, {
                headers: { 'x-access-token': token }
            });
            // Se a resposta não for bem-sucedida, interrompe a função sem gerar erro no console
            if (!response.ok) return;

            const data = await response.json();
            const saldoCaixaDisplay = document.getElementById('saldoCaixaDisplay');
            // Formata o número para o padrão brasileiro (ex: 1250.75 -> R$ 1.250,75)
            saldoCaixaDisplay.textContent = `R$ ${data.saldo_atual.toFixed(2).replace('.', ',')}`;
        } catch (error) {
            // Em caso de erro de rede, exibe uma mensagem amigável
            console.error("Erro ao carregar saldo do caixa:", error);
            document.getElementById('saldoCaixaDisplay').textContent = "Erro ao carregar";
        }
    }

    // 4. Funcionalidade do Botão de Logout
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', () => {
        // Limpa os dados de login do armazenamento do navegador
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');

        // Envia o usuário de volta para a página de login
        window.location.href = '/login.html';
    });

    // --- INICIALIZAÇÃO ---
    // Chama a função para carregar o saldo do caixa assim que a página é carregada
    carregarSaldoCaixa();
});