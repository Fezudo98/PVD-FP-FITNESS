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
    }

    // Inicia verificação de notificações em qualquer página autenticada
    if (localStorage.getItem('authToken')) {
        checkPendingOrders();
        setInterval(checkPendingOrders, 5000); // Polling rápido: 5 segundos

        // Solicita permissão para notificações se suportado
        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") console.log("Notificações permitidas!");
            });
        }
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
let lastPendingCount = null;

// Função para tocar um "Beep" usando AudioContext (Mais confiável que Base64/Arquivos)
function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return; // Navegador antigo

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine'; // Tipo de onda (sine, square, sawtooth, triangle)
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Frequência (880Hz = A5)
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Efeito de queda

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.warn("Erro ao tentar tocar som:", e);
    }
}

async function checkPendingOrders() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/api/vendas/online/pendentes/count`, {
            headers: { 'x-access-token': token }
        });
        if (!response.ok) return;

        const data = await response.json();
        const count = data.count;

        console.log(`[Polling] Pendentes: ${count} (Anterior: ${lastPendingCount})`);

        // Verifica se houve aumento de pedidos pendentes
        if (lastPendingCount !== null && count > lastPendingCount) {
            console.log("NOVO PEDIDO DETECTADO! Tentando notificar...");

            // 1. Toca o som
            playNotificationSound();

            // 2. Auto-Refresh da Tabela
            if (typeof loadOnlineOrders === 'function' && document.getElementById('onlineOrdersTable')) {
                console.log("Atualizando tabela...");
                loadOnlineOrders();
            }

            // 3. Notificação de Desktop
            if (Notification.permission === "granted") {
                try {
                    // Pega o último pedido para exibir info
                    const resOrders = await fetch(`${API_URL}/api/vendas/online?limit=1`, {
                        headers: { 'x-access-token': token }
                    });
                    if (resOrders.ok) {
                        const orders = await resOrders.json();
                        if (orders.length > 0) {
                            const latest = orders[0];
                            // Só notifica se for realmente pendente
                            if (latest.status === 'Pendente') {
                                new Notification("💰 Novo Pedido Online!", {
                                    body: `Cliente: ${latest.cliente}\nTotal: R$ ${latest.total.toFixed(2)}`,
                                    icon: '/logo.jpg',
                                    tag: 'new-order' // Evita spam visual
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error("Erro detalhes notificação:", e);
                }
            } else {
                console.log("Permissão de notificação não concedida ou negada.");
            }
        }

        lastPendingCount = count;

        // Atualiza Badges (UI)
        updateBadges(count);

    } catch (error) {
        console.error("Erro polling:", error);
    }
}

function updateBadges(count) {
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

    const btnBadge = document.getElementById('lojaOnlineBadge');
    if (btnBadge) {
        if (count > 0) {
            btnBadge.textContent = count;
            btnBadge.style.display = 'block';
        } else {
            btnBadge.style.display = 'none';
        }
    }
}

// --- Lógica da Página Loja Online ---
// let allOrdersCache = []; // Removed: Server-side pagination used now

async function loadOnlineOrders(page = 1) {
    const tableBody = document.querySelector('#onlineOrdersTable tbody');
    if (!tableBody) return; // Não estamos na página correta

    const token = localStorage.getItem('authToken');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

    try {
        let url = `${API_URL}/api/vendas/online?page=${page}&per_page=10`;
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }

        const response = await fetch(url, {
            headers: { 'x-access-token': token }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.erro || 'Falha ao buscar pedidos');
        }

        const data = await response.json();
        // data = { items: [], total: N, pages: N, current_page: N, ... }

        renderOrders(data.items);
        renderPagination(data);

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar pedidos: ${error.message}</td></tr>`;
    }
}

function renderPagination(meta) {
    const nav = document.getElementById('paginationControls');
    if (!nav) return;

    nav.innerHTML = '';

    if (meta.pages <= 1) return;

    // Prev
    const prevDisabled = !meta.has_prev ? 'disabled' : '';
    nav.innerHTML += `
        <li class="page-item ${prevDisabled}">
            <a class="page-link bg-dark text-white border-secondary" href="javascript:void(0)" onclick="loadOnlineOrders(${meta.current_page - 1})">Anterior</a>
        </li>
    `;

    // Pages
    for (let i = 1; i <= meta.pages; i++) {
        const active = i === meta.current_page ? 'active' : '';
        const bgClass = i === meta.current_page ? 'bg-warning border-warning text-dark' : 'bg-dark text-white border-secondary';

        nav.innerHTML += `
            <li class="page-item ${active}">
                <a class="page-link ${bgClass}" href="javascript:void(0)" onclick="loadOnlineOrders(${i})">${i}</a>
            </li>
        `;
    }

    // Next
    const nextDisabled = !meta.has_next ? 'disabled' : '';
    nav.innerHTML += `
        <li class="page-item ${nextDisabled}">
            <a class="page-link bg-dark text-white border-secondary" href="javascript:void(0)" onclick="loadOnlineOrders(${meta.current_page + 1})">Próximo</a>
        </li>
    `;
}


function renderOrders(pedidos) {
    const tableBody = document.querySelector('#onlineOrdersTable tbody');
    tableBody.innerHTML = '';

    if (pedidos.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum pedido online encontrado.</td></tr>';
        return;
    }

    pedidos.forEach(p => {
        const statusClass = getStatusClass(p.status);
        const tipoEntrega = p.tipo_entrega || 'Motoboy'; // Backward compatibility
        const actionsHtml = getContextualActions(p.id, p.status, tipoEntrega);

        const row = `
            <tr>
                <td>#${p.id}</td>
                <td>
                    ${p.data_hora}<br>
                    <small class="text-info"><i class="fas fa-shipping-fast me-1"></i>${tipoEntrega}</small>
                </td>
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
                            ${actionsHtml}
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="updateOrderStatus(${p.id}, 'Cancelada')">Cancelar</a></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

function filterOrders() {
    // Agora a busca é feita no servidor via loadOnlineOrders
    // Debounce podia ser bom, mas por enquanto vamos direto
    loadOnlineOrders(1);
}

function getContextualActions(id, status, tipo) {
    let items = [];

    // Common Start
    items.push({ label: 'Pendente', val: 'Pendente' });
    items.push({ label: 'Em separação', val: 'Em separação' });

    // Branching Logic
    if (tipo === 'Retirada') {
        items.push({ label: 'Pronto para retirada', val: 'Pronto para retirada' });
        items.push({ label: 'Entregue (Retirado)', val: 'Entregue' });
    } else if (tipo === 'Correios') {
        items.push({ label: 'Produto Postado', val: 'Produto Postado' });
        items.push({ label: 'Entregue', val: 'Entregue' });
    } else { // Motoboy (Default)
        items.push({ label: 'Saiu para entrega', val: 'Saiu para entrega' });
        items.push({ label: 'Entregue', val: 'Entregue' });
    }

    // Map to HTML
    return items.map(action =>
        `<li><a class="dropdown-item ${status === action.val ? 'active' : ''}" href="javascript:void(0)" onclick="updateOrderStatus(${id}, '${action.val}')">${action.label}</a></li>`
    ).join('');
}

function getStatusClass(status) {
    switch (status) {
        case 'Pendente': return 'bg-warning text-dark';
        case 'Em separação': return 'bg-info text-dark';
        case 'Em preparação': return 'bg-primary'; // Still support old status
        case 'Saiu para entrega': return 'bg-primary';
        case 'Pronto para retirada': return 'bg-primary';
        case 'Produto Postado': return 'bg-primary';
        case 'Entregue': return 'bg-success';
        case 'Concluída': return 'bg-success'; // Legacy
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
        document.getElementById('modalOrderTotal').textContent = `R$ ${venda.total_venda.toFixed(2)} `;

        const deliveryType = venda.tipo_entrega || 'Motoboy';
        document.getElementById('modalOrderDeliveryType').textContent = deliveryType;

        const statusEl = document.getElementById('modalOrderStatus');
        statusEl.textContent = venda.status || 'Desconhecido';
        statusEl.className = `badge ${getStatusClass(venda.status || '')} `;

        // Render Itens
        const itemsList = document.getElementById('modalOrderItems');
        itemsList.innerHTML = '';
        venda.itens.forEach(item => {
            itemsList.innerHTML += `
                <li class="list-group-item bg-transparent text-white d-flex justify-content-between align-items-center border-secondary">
                    <div>
                        <span class="fw-bold">${item.produto_nome}</span>
                        <br><small class="text-white-50">
                            ${item.cor ? `Cor: ${item.cor} | ` : ''} 
                            ${item.tamanho ? `Tam: ${item.tamanho} | ` : ''} 
                            Qtd: ${item.quantidade} x R$ ${item.preco_unitario.toFixed(2)}
                        </small>
                    </div>
                    <span>R$ ${item.subtotal.toFixed(2)}</span>
                </li>
            `;
        });

        // Render Address
        const address = `${venda.entrega_rua}, ${venda.entrega_numero} - ${venda.entrega_bairro}, ${venda.entrega_cidade}/${venda.entrega_estado} - CEP: ${venda.entrega_cep}`;
        document.getElementById('modalOrderAddress').textContent = address;

        // Render Actions (Also Contextual here!)
        const actionsDiv = document.getElementById('statusActions');
        actionsDiv.innerHTML = '';

        const tipoEntrega = venda.tipo_entrega || 'Motoboy';

        if (venda.status !== 'Cancelada' && venda.status !== 'Entregue' && venda.status !== 'Concluída') {
            const nextStatus = getNextStatus(venda.status, tipoEntrega);
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

function getNextStatus(current, tipo) {
    let flow = [];

    if (tipo === 'Retirada') {
        flow = ['Pendente', 'Em separação', 'Pronto para retirada', 'Entregue'];
    } else if (tipo === 'Correios') {
        flow = ['Pendente', 'Em separação', 'Produto Postado', 'Entregue'];
    } else {
        flow = ['Pendente', 'Em separação', 'Saiu para entrega', 'Entregue'];
    }

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