// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = '';

// Executa o código quando o HTML da página estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    // Apenas executa se estiver na página de login para evitar conflitos
    if (window.location.pathname.endsWith('login.html')) return;

    checkAuth();

    // Inicializações específicas por página
    if (document.getElementById('saldoCaixaDisplay')) {
        carregarSaldoCaixa();
        checkPendingOrders(); // Inicia verificação de notificações
        setInterval(checkPendingOrders, 30000); // Atualiza a cada 30s
    }

    // Fix para Dropdown cortado na tabela responsiva
    const ordersTable = document.getElementById('onlineOrdersTable');
    if (ordersTable) {
        loadOnlineOrders();
        ordersTable.addEventListener('show.bs.dropdown', function () {
            const responsiveDiv = ordersTable.closest('.table-responsive');
            if (responsiveDiv) responsiveDiv.style.overflow = 'inherit';
        });

        ordersTable.addEventListener('hide.bs.dropdown', function () {
            const responsiveDiv = ordersTable.closest('.table-responsive');
            if (responsiveDiv) responsiveDiv.style.overflow = 'auto';
        });
    }
});

function checkAuth() {
    const token = localStorage.getItem('authToken');
    const userDataString = localStorage.getItem('userData');

    if (!token || !userDataString) {
        window.location.href = '/login.html';
        return;
    }

    const userData = JSON.parse(userDataString);

    // Personaliza a página com os dados do usuário (se o elemento existir)
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan) userNameSpan.textContent = userData.nome;

    // Controle de Acesso: Mostra o painel de admin se o cargo do usuário for 'admin'
    if (userData.role === 'admin') {
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.classList.remove('d-none');
    }

    // Logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            window.location.href = '/login.html';
        });
    }

    // Notificações (Click)
    const notificationIcon = document.getElementById('notificationIcon');
    if (notificationIcon) {
        notificationIcon.addEventListener('click', () => {
            window.location.href = '/loja_online.html';
        });
    }
}

async function carregarSaldoCaixa() {
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/caixa/saldo`, {
            headers: { 'x-access-token': token }
        });
        if (!response.ok) return;

        const data = await response.json();
        const saldoCaixaDisplay = document.getElementById('saldoCaixaDisplay');
        if (saldoCaixaDisplay) {
            saldoCaixaDisplay.textContent = `R$ ${data.saldo_atual.toFixed(2).replace('.', ',')}`;
        }
    } catch (error) {
        console.error("Erro ao carregar saldo do caixa:", error);
    }
}

// --- Lógica de Notificações ---
async function checkPendingOrders() {
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/vendas/online/pendentes/count`, {
            headers: { 'x-access-token': token }
        });
        if (!response.ok) return;

        const data = await response.json();
        const count = data.count;

        // Atualiza Badge do Ícone
        const iconBadge = document.getElementById('notificationBadge');
        const iconContainer = document.getElementById('notificationIcon');

        if (iconContainer) {
            iconContainer.style.display = 'block';
            if (count > 0) {
                iconBadge.textContent = count;
                iconBadge.style.display = 'block';
            } else {
                iconBadge.style.display = 'none';
            }
        }

        // Atualiza Badge do Botão "Loja Online"
        const btnBadge = document.getElementById('lojaOnlineBadge');
        if (btnBadge) {
            if (count > 0) {
                btnBadge.textContent = count;
                btnBadge.style.display = 'block';
            } else {
                btnBadge.style.display = 'none';
            }
        }

    } catch (error) {
        console.error("Erro ao verificar notificações:", error);
    }
}

// --- Lógica da Página Loja Online ---
async function loadOnlineOrders() {
    const tableBody = document.querySelector('#onlineOrdersTable tbody');
    if (!tableBody) return; // Não estamos na página correta

    const token = localStorage.getItem('authToken');
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/api/vendas/online`, {
            headers: { 'x-access-token': token }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.erro || 'Falha ao buscar pedidos');
        }

        const pedidos = await response.json();
        tableBody.innerHTML = '';
        if (pedidos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum pedido online encontrado.</td></tr>';
            return;
        }

        pedidos.forEach(p => {
            const statusClass = getStatusClass(p.status);
            const row = `
                <tr>
                    <td>#${p.id}</td>
                    <td>${p.data_hora}</td>
                    <td class="text-truncate" style="max-width: 150px;" title="${p.cliente}">${p.cliente}</td>
                    <td>${p.itens_count} itens</td>
                    <td class="text-warning fw-bold">R$ ${p.total.toFixed(2)}</td>
                    <td><span class="badge ${statusClass} status-badge">${p.status}</span></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-info me-1" onclick="viewOrderDetails(${p.id})">Detalhes</button>
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-outline-light dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                Ações
                            </button>
                            <ul class="dropdown-menu dropdown-menu-dark">
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Pendente')">Pendente</a></li>
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Em separação')">Em separação</a></li>
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Em preparação')">Em preparação</a></li>
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Produto Postado')">Produto Postado</a></li>
                                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Concluída')">Concluída</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Cancelada')">Cancelar</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar pedidos: ${error.message}</td></tr>`;
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'Pendente': return 'bg-warning text-dark';
        case 'Em separação': return 'bg-info text-dark';
        case 'Em preparação': return 'bg-primary';
        case 'Produto Postado': return 'bg-success';
        case 'Concluída': return 'bg-success';
        case 'Cancelada': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

async function viewOrderDetails(id) {
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/vendas/${id}`, {
            headers: { 'x-access-token': token }
        });
        const venda = await response.json();

        document.getElementById('modalOrderId').textContent = venda.id;
        document.getElementById('modalClientName').textContent = venda.cliente_nome;
        document.getElementById('modalOrderDate').textContent = venda.data_hora;
        document.getElementById('modalOrderTotal').textContent = `R$ ${venda.total_venda.toFixed(2)}`;

        const statusEl = document.getElementById('modalOrderStatus');
        statusEl.textContent = venda.status || 'Desconhecido';
        statusEl.className = `badge ${getStatusClass(venda.status || '')}`;

        // Render Itens
        const itemsList = document.getElementById('modalOrderItems');
        itemsList.innerHTML = '';
        venda.itens.forEach(item => {
            itemsList.innerHTML += `
                <li class="list-group-item bg-transparent text-white d-flex justify-content-between align-items-center border-secondary">
                    <div>
                        <span class="fw-bold">${item.produto_nome}</span>
                        <br><small class="text-muted">Qtd: ${item.quantidade} x R$ ${item.preco_unitario.toFixed(2)}</small>
                    </div>
                    <span>R$ ${item.subtotal.toFixed(2)}</span>
                </li>
                `;
        });

        // Render Address
        const address = `${venda.entrega_rua}, ${venda.entrega_numero} - ${venda.entrega_bairro}, ${venda.entrega_cidade}/${venda.entrega_estado} - CEP: ${venda.entrega_cep}`;
        document.getElementById('modalOrderAddress').textContent = address;

        // Render Actions
        const actionsDiv = document.getElementById('statusActions');
        actionsDiv.innerHTML = '';

        if (venda.status !== 'Cancelada' && venda.status !== 'Concluída') {
            const nextStatus = getNextStatus(venda.status);
            if (nextStatus) {
                actionsDiv.innerHTML += `<button class="btn btn-success flex-grow-1" onclick="updateOrderStatus(${venda.id}, '${nextStatus}')">Avançar para: ${nextStatus}</button>`;
            }
            actionsDiv.innerHTML += `<button class="btn btn-danger" onclick="updateOrderStatus(${venda.id}, 'Cancelada')">Cancelar Pedido</button>`;
        } else {
            actionsDiv.innerHTML = '<span class="text-muted small">Nenhuma ação disponível para este status.</span>';
        }

        const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
        modal.show();

    } catch (error) {
        console.error(error);
        Swal.fire('Erro', 'Não foi possível carregar os detalhes.', 'error');
    }
}

function getNextStatus(current) {
    const flow = ['Pendente', 'Em separação', 'Em preparação', 'Produto Postado', 'Concluída'];
    const idx = flow.indexOf(current);
    if (idx >= 0 && idx < flow.length - 1) {
        return flow[idx + 1];
    }
    return null;
}

async function updateOrderStatus(id, newStatus) {
    const token = localStorage.getItem('authToken');

    if (newStatus === 'Cancelada') {
        const confirm = await Swal.fire({
            title: 'Tem certeza?',
            text: "O estoque será estornado automaticamente.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, cancelar!'
        });
        if (!confirm.isConfirmed) return;
    }

    try {
        const response = await fetch(`${API_URL}/api/vendas/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.erro || 'Erro ao atualizar');
        }

        Swal.fire('Sucesso!', `Status atualizado para ${newStatus}.`, 'success');

        // Close modal and refresh list
        const modalEl = document.getElementById('orderDetailsModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        loadOnlineOrders();
        checkPendingOrders(); // Update badges

    } catch (error) {
        Swal.fire('Erro', error.message, 'error');
    }
}