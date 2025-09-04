// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto
const token = localStorage.getItem('authToken');

// CORRIGIDO: Caminho absoluto para a página de login
if (!token) window.location.href = '/login.html';

document.addEventListener('DOMContentLoaded', () => {
    const usersTableBody = document.getElementById('usersTableBody');
    const addUserBtn = document.getElementById('addUserBtn');
    const userModal = new bootstrap.Modal(document.getElementById('userModal'));
    const userForm = document.getElementById('userForm');
    const modalTitle = document.getElementById('modalTitle');

    async function fetchUsers() {
        try {
            const response = await fetch(`${API_URL}/api/usuarios`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) {
                if (response.status === 403) {
                    // CORRIGIDO: Caminho absoluto para a página inicial
                    window.location.href = '/';
                }
                return;
            }
            const users = await response.json();
            renderUsers(users);
        } catch (error) { console.error('Erro ao buscar usuários:', error); }
    }

    function renderUsers(users) {
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.id}</td>
                <td>${user.nome}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>
                    <button class="btn btn-sm btn-info edit-btn" data-id="${user.id}">Editar</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${user.id}">Excluir</button>
                </td>
            `;
            usersTableBody.appendChild(tr);
        });
    }

    addUserBtn.addEventListener('click', () => {
        userForm.reset();
        document.getElementById('userId').value = '';
        document.getElementById('senha').required = true;
        modalTitle.textContent = 'Adicionar Novo Usuário';
        userModal.show();
    });
    
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('userId').value;
        const isNewUser = !id;

        const userData = {
            nome: document.getElementById('nome').value,
            email: document.getElementById('email').value,
            role: document.getElementById('role').value
        };
        const senha = document.getElementById('senha').value;
        if (senha) {
            userData.senha = senha;
        }

        const url = isNewUser ? `${API_URL}/api/auth/register` : `${API_URL}/api/usuarios/${id}`;
        const method = isNewUser ? 'POST' : 'PUT';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(userData)
            });
            if (response.ok) {
                userModal.hide();
                fetchUsers();
            } else {
                const error = await response.json();
                alert(`Erro: ${error.message || error.erro}`);
            }
        } catch (error) { console.error('Erro ao salvar usuário:', error); }
    });

    usersTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (target.classList.contains('edit-btn')) {
            const userResponse = await fetch(`${API_URL}/api/usuarios`, { headers: { 'x-access-token': token } });
            const users = await userResponse.json();
            const user = users.find(u => u.id == id);
            
            document.getElementById('userId').value = user.id;
            document.getElementById('nome').value = user.nome;
            document.getElementById('email').value = user.email;
            document.getElementById('role').value = user.role;
            document.getElementById('senha').required = false;
            
            modalTitle.textContent = 'Editar Usuário';
            userModal.show();
        } else if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este usuário?')) {
                const response = await fetch(`${API_URL}/api/usuarios/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                const result = await response.json();
                if(!response.ok) { alert(`Erro: ${result.erro || result.message}`); }
                fetchUsers();
            }
        }
    });
    
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
    });
    
    fetchUsers();
});