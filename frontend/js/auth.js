// ATENÇÃO: Mude este IP para o IP do computador principal na rede da loja
// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto

const loginForm = document.getElementById('loginForm');
const errorMessageDiv = document.getElementById('errorMessage');

loginForm.addEventListener('submit', async (event) => {
    // Impede que o formulário recarregue a página
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: email, senha: password }),
        });

        const data = await response.json();

        if (response.ok) {
    // Login bem-sucedido!
    console.log('Login realizado com sucesso:', data);
    
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('userData', JSON.stringify(data.user));

    // Redireciona para a página principal
    window.location.href = '/index.html';

        } else {
            // Mostra a mensagem de erro retornada pela API
            showError(data.message || 'Erro desconhecido.');
        }
    } catch (error) {
        // Mostra erro de conexão com o servidor
        console.error('Falha na conexão com a API:', error);
        showError('Não foi possível conectar ao servidor. Verifique se ele está ligado.');
    }
});

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.classList.remove('d-none'); // Torna a div de erro visível
}