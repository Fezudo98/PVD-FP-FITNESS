// CORRIGIDO: Atualizado para o IP da rede local. Substitua pelo IP real.
const API_URL = ''; // Deixe vazio // Exemplo, use o IP correto
const token = localStorage.getItem('authToken');

// CORRIGIDO: Caminho absoluto para a página de login
if (!token) window.location.href = '/login.html';

document.addEventListener('DOMContentLoaded', () => {
    const clientesTableBody = document.getElementById('clientesTableBody');
    const addClienteBtn = document.getElementById('addClienteBtn');
    const clienteModal = new bootstrap.Modal(document.getElementById('clienteModal'));
    const clienteForm = document.getElementById('clienteForm');
    const modalTitle = document.getElementById('modalTitle');
    const searchInput = document.getElementById('searchInput');

    let allClientes = [];

    async function fetchClientes() {
        try {
            const response = await fetch(`${API_URL}/api/clientes`, {
                headers: { 'x-access-token': token }
            });
            allClientes = await response.json();
            renderClientes(allClientes);
        } catch (error) { console.error('Erro ao buscar clientes:', error); }
    }

    function renderClientes(clientes) {
        clientesTableBody.innerHTML = '';
        if (clientes.length === 0) {
            clientesTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Nenhum cliente encontrado.</td></tr>';
            return;
        }
        clientes.forEach(cliente => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cliente.id}</td>
                <td>${escapeHtml(cliente.nome)}</td>
                <td>${escapeHtml(cliente.telefone) || 'N/A'}</td>
                <td>${escapeHtml(cliente.cpf) || 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-info edit-btn" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome)}" data-telefone="${escapeHtml(cliente.telefone) || ''}" data-cpf="${escapeHtml(cliente.cpf) || ''}" data-nascimento="${cliente.data_nascimento || ''}">Editar</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${cliente.id}">Excluir</button>
                </td>
            `;
            clientesTableBody.appendChild(tr);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allClientes.filter(c => 
                c.nome.toLowerCase().includes(term) || 
                (c.cpf && c.cpf.includes(term)) || 
                (c.telefone && c.telefone.includes(term))
            );
            renderClientes(filtered);
        });
    }
    
    addClienteBtn.addEventListener('click', () => {
        clienteForm.reset();
        document.getElementById('clienteId').value = '';
        modalTitle.textContent = 'Adicionar Novo Cliente';
        clienteModal.show();
    });

    clienteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('clienteId').value;
        const url = id ? `${API_URL}/api/clientes/${id}` : `${API_URL}/api/clientes`;
        const method = id ? 'PUT' : 'POST';

        const clienteData = {
            nome: document.getElementById('nome').value,
            telefone: document.getElementById('telefone').value,
            cpf: document.getElementById('cpf').value,
            data_nascimento: document.getElementById('dataNascimento').value
        };

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(clienteData)
            });
            if (response.ok) {
                clienteModal.hide();
                fetchClientes();
            } else {
                const error = await response.json();
                alert(`Erro: ${error.message || error.erro}`);
            }
        } catch (error) { console.error('Erro ao salvar cliente:', error); }
    });
    
    clientesTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (target.classList.contains('edit-btn')) {
            document.getElementById('clienteId').value = id;
            document.getElementById('nome').value = target.dataset.nome;
            document.getElementById('telefone').value = target.dataset.telefone;
            document.getElementById('cpf').value = target.dataset.cpf;
            document.getElementById('dataNascimento').value = target.dataset.nascimento;
            modalTitle.textContent = 'Editar Cliente';
            clienteModal.show();
        } else if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este cliente?')) {
                await fetch(`${API_URL}/api/clientes/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                fetchClientes();
            }
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        // CORRIGIDO: Caminho absoluto para a página de login
        window.location.href = '/login.html';
    });

    fetchClientes();
});