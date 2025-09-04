const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const cuponsTableBody = document.getElementById('cuponsTableBody');
    const addCupomBtn = document.getElementById('addCupomBtn');
    const cupomModal = new bootstrap.Modal(document.getElementById('cupomModal'));
    const cupomForm = document.getElementById('cupomForm');
    const modalTitle = document.getElementById('modalTitle');

    // Função para buscar e renderizar os cupons
    async function fetchCupons() {
        try {
            const response = await fetch(`${API_URL}/api/cupons`, {
                headers: { 'x-access-token': token }
            });
            if (response.status === 403) { // Redireciona se não for admin
                window.location.href = '/index.html';
                return;
            }
            const cupons = await response.json();
            renderCupons(cupons);
        } catch (error) {
            console.error('Erro ao buscar cupons:', error);
        }
    }

    // Função para exibir os cupons na tabela
    function renderCupons(cupons) {
        cuponsTableBody.innerHTML = '';
        if (cupons.length === 0) {
            cuponsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum cupom cadastrado.</td></tr>';
            return;
        }
        cupons.forEach(cupom => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cupom.id}</td>
                <td><strong>${cupom.codigo}</strong></td>
                <td>${cupom.tipo_desconto === 'percentual' ? 'Percentual' : 'Fixo'}</td>
                <td>${cupom.tipo_desconto === 'percentual' ? `${cupom.valor_desconto}%` : `R$ ${cupom.valor_desconto.toFixed(2)}`}</td>
                <td>
                    <span class="badge ${cupom.ativo ? 'bg-success' : 'bg-danger'}">
                        ${cupom.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-info toggle-status-btn" data-id="${cupom.id}" data-ativo="${cupom.ativo}">
                        ${cupom.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${cupom.id}">Excluir</button>
                </td>
            `;
            cuponsTableBody.appendChild(tr);
        });
    }
    
    // Abre o modal para adicionar um novo cupom
    addCupomBtn.addEventListener('click', () => {
        cupomForm.reset();
        document.getElementById('cupomId').value = '';
        modalTitle.textContent = 'Adicionar Novo Cupom';
        cupomModal.show();
    });

    // Lida com o envio do formulário (apenas para CRIAR)
    cupomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const cupomData = {
            codigo: document.getElementById('codigo').value,
            tipo_desconto: document.getElementById('tipo_desconto').value,
            valor_desconto: document.getElementById('valor_desconto').value,
        };

        try {
            const response = await fetch(`${API_URL}/api/cupons`, {
                method: 'POST',
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
    
    // Lida com cliques nos botões de Ações (Ativar/Desativar, Excluir)
    cuponsTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;

        // Lógica para Ativar/Desativar
        if (target.classList.contains('toggle-status-btn')) {
            const currentStatus = target.dataset.ativo === 'true';
            try {
                await fetch(`${API_URL}/api/cupons/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                    body: JSON.stringify({ ativo: !currentStatus })
                });
                fetchCupons();
            } catch (error) {
                console.error('Erro ao alterar status do cupom:', error);
            }
        }

        // Lógica para Excluir
        if (target.classList.contains('delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este cupom permanentemente?')) {
                try {
                    await fetch(`${API_URL}/api/cupons/${id}`, {
                        method: 'DELETE',
                        headers: { 'x-access-token': token }
                    });
                    fetchCupons();
                } catch (error) {
                    console.error('Erro ao excluir cupom:', error);
                }
            }
        }
    });

    // Botão de Logout
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // Carrega os cupons ao iniciar a página
    fetchCupons();
});