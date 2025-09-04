const API_URL = ''; // Deixe vazio

document.getElementById('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button');
    const messageDiv = document.getElementById('messageDiv');

    const userData = {
        nome: document.getElementById('nome').value,
        email: document.getElementById('email').value,
        senha: document.getElementById('password').value
    };

    button.disabled = true;
    button.textContent = 'Criando...';
    messageDiv.classList.add('d-none');

    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        if (response.ok) {
            messageDiv.className = 'alert alert-success mt-3';
            messageDiv.textContent = result.mensagem;
            form.reset();
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 3000); // Redireciona para o login após 3 segundos
        } else {
            throw new Error(result.erro || 'Ocorreu um erro desconhecido.');
        }

    } catch (error) {
        messageDiv.className = 'alert alert-danger mt-3';
        messageDiv.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Criar Administrador';
    }
});