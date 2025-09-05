// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = ''; 

// Pega os dados de autenticação do armazenamento local do navegador.
const token = localStorage.getItem('authToken');
const userDataString = localStorage.getItem('userData');
// Verifica se a string de dados do usuário existe antes de tentar convertê-la (parse).
const userData = userDataString ? JSON.parse(userDataString) : null;

// --- BARREIRA DE SEGURANÇA APRIMORADA ---
// Este bloco é executado imediatamente para proteger a página.

// 1. Se não há token ou dados do usuário, significa que ninguém está logado.
// Redireciona imediatamente para a tela de login.
if (!token || !userData) {
    window.location.href = '/login.html';
} 
// 2. Se o usuário está logado, mas seu cargo (role) não é 'admin', ele não tem permissão.
// Redireciona para o painel principal, que é seguro para ele.
else if (userData.role !== 'admin') {
    window.location.href = '/index.html';
} 
// 3. Se o usuário está logado E é um administrador, o script continua a ser executado.
else {
    // O restante do código só é executado se o usuário for um admin autenticado.
    document.addEventListener('DOMContentLoaded', () => {
        const logsTableBody = document.getElementById('logsTableBody');

        /**
         * Busca os dados de log da API e os exibe na tabela.
         */
        async function fetchLogs() {
            // Mostra uma mensagem de carregamento enquanto busca os dados
            logsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando diário de bordo...</td></tr>';

            try {
                const response = await fetch(`${API_URL}/api/logs`, {
                    headers: {
                        'x-access-token': token
                    }
                });

                if (!response.ok) {
                    // Se a resposta não for OK, lança um erro com a mensagem da API
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Falha ao buscar os logs.');
                }
                
                const logs = await response.json();
                renderLogsTable(logs);

            } catch (error) {
                console.error('Erro ao buscar logs:', error);
                // Exibe uma mensagem de erro na tabela em caso de falha
                logsTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
            }
        }

        /**
         * Renderiza a tabela de logs com os dados recebidos da API.
         * @param {Array} logs - A lista de objetos de log.
         */
        function renderLogsTable(logs) {
            // Limpa a tabela antes de preencher
            logsTableBody.innerHTML = '';

            if (!logs || logs.length === 0) {
                logsTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum registro de atividade encontrado.</td></tr>';
                return;
            }

            // Cria uma linha (tr) para cada registro de log
            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${log.timestamp}</td>
                    <td>${log.usuario_nome}</td>
                    <td>${log.acao}</td>
                    <td>${log.detalhes || 'N/A'}</td>
                `;
                logsTableBody.appendChild(tr);
            });
        }

        // Adiciona a funcionalidade de logout ao botão de sair.
        document.getElementById('logoutButton').addEventListener('click', () => {
            localStorage.clear();
            window.location.href = '/login.html';
        });

        // Inicia o processo buscando os logs assim que a página carrega.
        fetchLogs();
    });
}