// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto

// Executa o código quando o HTML da página estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('authToken');
    const userDataString = localStorage.getItem('userData');
    
    // 1. Barreira de Segurança: Se não tem token, chuta para fora.
    if (!token || !userDataString) {
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
        return;
    }

    const userData = JSON.parse(userDataString);

    // 2. Personaliza a página com os dados do usuário
    const userNameSpan = document.getElementById('userName');
    userNameSpan.textContent = userData.nome;

    // 3. Controle de Acesso: Mostra painel de admin se o usuário for 'admin'
    if (userData.role === 'admin') {
        const adminPanel = document.getElementById('admin-panel');
        adminPanel.classList.remove('d-none');
    }

    // 4. Funcionalidade do Botão de Logout
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', () => {
        // Limpa os dados de login do navegador
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');

        // Envia de volta para a página de login
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
    });

});