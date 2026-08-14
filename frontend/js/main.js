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
        checkPaidOrders();
        setInterval(checkPendingOrders, 5000); // Polling rápido: 5 segundos
        setInterval(checkPaidOrders, 5000); // Polling de pagamentos

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

    // Start Clock
    updateClock();
    setInterval(updateClock, 1000);
});

function updateClock() {
    const clockEl = document.getElementById('clockDisplay');
    if (!clockEl) return;

    const now = new Date();

    // Format: "Sáb, 27 de Dez"
    const dateOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    const dateStr = now.toLocaleDateString('pt-BR', dateOptions).replace('.', ''); // Remove dot from abbr if present

    // Format: "14:30"
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Combine nicely
    // Capitalize first letter of dateStr for elegance
    const dateFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    clockEl.innerHTML = `<span>${dateFormatted}</span> <span class="mx-1">|</span> <strong>${timeStr}</strong>`;
}

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

// Evita que o auto-refresh da tabela de pedidos atropele o admin no meio de uma ação
// (ex: menu "Ações" aberto some/perde a posição se a tabela for redesenhada por baixo dele).
function existeMenuAcaoAberto() {
    return document.querySelector('#onlineOrdersTable .dropdown-menu.show') !== null;
}

async function marcarPagamentoManual() {
    const venda = window.currentOrderDetails;
    if (!venda) return;

    const forma = document.getElementById('marcarPagoForma').value;
    const token = localStorage.getItem('authToken');

    try {
        const response = await fetch(`${API_URL}/api/vendas/${venda.id}/marcar_pago`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-access-token': token },
            body: JSON.stringify({ forma_pagamento: forma })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.erro || 'Erro ao registrar pagamento.');

        Swal.fire('Sucesso!', 'Pagamento registrado.', 'success');
        viewOrderDetails(venda.id);
        loadOnlineOrders();
    } catch (error) {
        Swal.fire('Erro', error.message, 'error');
    }
}

async function verComprovanteAdmin(vendaId) {
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/vendas/${vendaId}/comprovante`, {
            headers: { 'x-access-token': token }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.erro || 'Não foi possível carregar o comprovante.');
        }
        const html = await response.text();
        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
    } catch (error) {
        Swal.fire('Erro', error.message, 'error');
    }
}

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

            // 2. Auto-Refresh da Tabela (pulado se o admin estiver com o menu "Ações" aberto)
            if (typeof loadOnlineOrders === 'function' && document.getElementById('onlineOrdersTable') && !existeMenuAcaoAberto()) {
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
        console.error("Erro polling pendentes:", error);
    }
}

async function checkPaidOrders() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    let lastId = localStorage.getItem('lastPaidOrderId') || 0;

    try {
        const response = await fetch(`${API_URL}/api/vendas/novas_notificacoes?last_id=${lastId}`, {
            headers: { 'x-access-token': token }
        });
        if (!response.ok) return;

        const data = await response.json();
        
        if (data.tem_novas) {
            // Se for o primeiro carregamento (lastId == 0), apenas salva o max_id sem notificar retroativamente
            if (lastId == 0) {
                localStorage.setItem('lastPaidOrderId', data.max_id);
                return;
            }

            console.log("NOVO PAGAMENTO APROVADO! Tocando o sino...");
            playNotificationSound(); // Ka-ching!

            // Auto-Refresh da Tabela se estiver na página de vendas online (pulado se o
            // admin estiver com o menu "Ações" aberto)
            if (typeof loadOnlineOrders === 'function' && document.getElementById('onlineOrdersTable') && !existeMenuAcaoAberto()) {
                loadOnlineOrders();
            }

            if (Notification.permission === "granted") {
                data.vendas.forEach(v => {
                    new Notification("💰 Pagamento Aprovado!", {
                        body: `Cliente: ${v.cliente}\nTotal: R$ ${v.total.toFixed(2)}`,
                        icon: '/logo.jpg',
                        tag: `paid-${v.id}`
                    });
                });
            }

            // Exibir Toast Premium no sistema
            if (data.vendas.length > 0) {
                const toastContainer = document.getElementById('toast-container');
                if (toastContainer) {
                    const toastHTML = `
                        <div class="toast align-items-center text-white bg-success border-0 mb-2 show" role="alert" aria-live="assertive" aria-atomic="true" style="animation: slideInRight 0.3s ease-out;">
                            <div class="d-flex">
                                <div class="toast-body fw-bold">
                                    <i class="fa-solid fa-money-bill-wave me-2"></i> Nova Venda de R$ ${data.vendas[0].total.toFixed(2)} aprovada!
                                </div>
                                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                            </div>
                        </div>`;
                    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
                    setTimeout(() => {
                        const toasts = toastContainer.querySelectorAll('.toast');
                        if (toasts.length > 0) toasts[toasts.length - 1].remove();
                    }, 5000);
                }
            }

            localStorage.setItem('lastPaidOrderId', data.max_id);
        }
    } catch (error) {
        console.error("Erro polling pagos:", error);
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

async function loadOnlineDashboard() {
    // Only run if elements exist
    if (!document.getElementById('dashHojeTotal')) return;

    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/relatorios/online-dashboard`, {
            headers: { 'x-access-token': token }
        });

        if (!response.ok) return; // Silent fail

        const data = await response.json();

        // Populate Today
        document.getElementById('dashHojeTotal').textContent = `R$ ${parseFloat(data.hoje.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('dashHojeQtd').textContent = data.hoje.quantidade;

        // Populate Month
        document.getElementById('dashMesTotal').textContent = `R$ ${parseFloat(data.mes.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('dashMesQtd').textContent = data.mes.quantidade;

        // Populate Status Counts
        document.getElementById('dashPendentes').textContent = data.status.pendentes;
        document.getElementById('dashSeparacao').textContent = data.status.separacao;
        document.getElementById('dashEnviados').textContent = data.status.enviados;

        // Populate Visits (se os elementos existirem na página)
        if (data.visitas && document.getElementById('dashVisitasHoje')) {
            document.getElementById('dashVisitasHoje').textContent = data.visitas.hoje.unicos;
            document.getElementById('dashVisitasSemana').textContent = data.visitas.semana.unicos;
            document.getElementById('dashVisitasMes').textContent = data.visitas.mes.unicos;
        }

    } catch (e) {
        console.error("Dashboard Load Error:", e);
    }
}

async function loadOnlineOrders(page = 1) {
    const tableBody = document.querySelector('#onlineOrdersTable tbody');
    if (!tableBody) return; // Não estamos na página correta

    const token = localStorage.getItem('authToken');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const statusFilter = document.getElementById('statusFilter');
    const statusVal = statusFilter ? statusFilter.value : '';

    tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-white py-4">Carregando...</td></tr>';

    try {
        let url = `${API_URL}/api/vendas/online?page=${page}&per_page=10`;
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        if (statusVal) {
            url += `&status=${encodeURIComponent(statusVal)}`;
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
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro ao carregar pedidos: ${error.message}</td></tr>`;
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
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-white py-4">Nenhum pedido online encontrado.</td></tr>';
        return;
    }

    pedidos.forEach(p => {
        const statusClass = getStatusClass(p.status);
        const tipoEntrega = p.tipo_entrega || 'Motoboy'; // Backward compatibility
        const actionsHtml = getContextualActions(p.id, p.status, tipoEntrega);

        const podeImprimirLote = p.usa_melhor_envio && p.status !== 'Cancelada' && p.status !== 'Entregue';
        const checkboxHtml = podeImprimirLote
            ? `<input type="checkbox" class="form-check-input lote-checkbox" data-venda-id="${p.id}" onchange="atualizarSelecaoLote()">`
            : '';

        const row = `
            <tr>
                <td>${checkboxHtml}</td>
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
                    <button class="btn btn-sm btn-outline-info rounded-circle me-1" title="Ver Detalhes" style="width: 32px; height: 32px; padding: 0;" onclick="viewOrderDetails(${p.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-outline-light dropdown-toggle rounded-pill px-3" data-bs-toggle="dropdown" aria-expanded="false">
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
    const baseClasses = "rounded-pill";
    switch (status) {
        case 'Pendente': return `bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 ${baseClasses}`;
        case 'Em separação': return `bg-info bg-opacity-25 text-info border border-info border-opacity-50 ${baseClasses}`;
        case 'Em preparação': return `bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50 ${baseClasses}`; 
        case 'Saiu para entrega': return `bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50 ${baseClasses}`;
        case 'Pronto para retirada': return `bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50 ${baseClasses}`;
        case 'Produto Postado': return `bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50 ${baseClasses}`;
        case 'Entregue': return `bg-success bg-opacity-25 text-success border border-success border-opacity-50 ${baseClasses}`;
        case 'Concluída': return `bg-success bg-opacity-25 text-success border border-success border-opacity-50 ${baseClasses}`; 
        case 'Cancelada': return `bg-danger bg-opacity-25 text-danger border border-danger border-opacity-50 ${baseClasses}`;
        default: return `bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-50 ${baseClasses}`;
    }
}

async function viewOrderDetails(id) {
    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(`${API_URL}/api/vendas/${id}`, {
            headers: { 'x-access-token': token }
        });
        const venda = await response.json();

        // Store current order for actions
        window.currentOrderDetails = venda;

        // Populate ID (Header and Body)
        document.getElementById('modalOrderId').textContent = venda.id;
        document.getElementById('modalOrderIdBody').textContent = venda.id;

        // Client Name & Whatsapp
        // NEW STRUCTURE
        const clientInfoDiv = document.getElementById('modalClientInfo');

        let waBtn = '';
        let emailBtn = '';
        if (venda.cliente_telefone || venda.cliente_email) {
            const cleanPhone = venda.cliente_telefone ? venda.cliente_telefone.replace(/\D/g, '') : '';
            const firstName = (venda.cliente_nome || '').split(' ')[0];

            // Items List
            let itemsMsg = '';
            venda.itens.forEach(item => {
                itemsMsg += `- ${item.quantidade}x ${item.produto_nome} (${item.tamanho || 'U'}/${item.cor || '-'}) \n`;
            });

            // Address
            const addressMsg = venda.entrega_rua
                ? `${venda.entrega_rua}, ${venda.entrega_numero} - ${venda.entrega_bairro}, ${venda.entrega_cidade}/${venda.entrega_estado}`
                : 'Retirada na Loja / Não informado';

            // Financials
            let subTotalForMsg = 0;
            venda.itens.forEach(i => subTotalForMsg += (i.quantidade * i.preco_unitario));

            const totalMsg = parseFloat(venda.total_venda).toFixed(2);
            const freteMsg = parseFloat(venda.taxa_entrega).toFixed(2);
            const descMsg = parseFloat(venda.desconto_total).toFixed(2);

            let maskedCpf = 'Não informado';
            if (venda.cliente_cpf) {
                maskedCpf = venda.cliente_cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, '$1.XXX.XXX-$4');
                if (maskedCpf === venda.cliente_cpf && venda.cliente_cpf.length > 5) {
                    maskedCpf = venda.cliente_cpf.substring(0, 3) + '.XXX.XXX-XX';
                }
            }

            let statusMsg = "Seu pedido foi recebido!";
            if (venda.status === 'Concluída') statusMsg = "Oba! Seu pagamento foi aprovado! Estamos preparando seu pedido.";
            else if (venda.status === 'Em separação' || venda.status === 'Em preparação') statusMsg = "Seu pedido já está separado e pronto para envio.";
            else if (venda.status === 'Saiu para entrega') statusMsg = "Seu pedido saiu para entrega! Fique de olho, ele chegará em breve.";
            else if (venda.status === 'Produto Postado') statusMsg = `Seu pedido foi postado! Acompanhe pelo rastreio: ${venda.codigo_rastreio || 'Em breve'}`;
            else if (venda.status === 'Pronto para retirada') statusMsg = "Seu pedido está pronto para ser retirado na nossa loja!";
            else if (venda.status === 'Entregue') statusMsg = "Seu pedido consta como entregue! Esperamos que aproveite sua compra.";

            const rawMessage = `Olá ${firstName}, agradecemos pela preferência!\n` +
                `${statusMsg}\n\n` +
                `*Detalhes do Pedido #${venda.id}*\n` +
                `--------------------------------\n` +
                `*Dados do Cliente:*\n` +
                `Nome: ${venda.cliente_nome}\n` +
                `CPF: ${maskedCpf}\n` +
                `--------------------------------\n` +
                `*Itens:*\n${itemsMsg}\n` +
                `*Endereço de Entrega:*\n${addressMsg}\n\n` +
                `*Resumo:*\n` +
                `Subtotal: R$ ${subTotalForMsg.toFixed(2)}\n` +
                `Descontos: - R$ ${descMsg}\n` +
                `Frete: R$ ${freteMsg}\n` +
                `Prazo de entrega (após postagem): Consultar Rastreio\n` +
                `*Total: R$ ${totalMsg}*\n` +
                `--------------------------------\n` +
                `_Essa é uma mensagem automática, se precisar, chame a gente!_`;

            if (cleanPhone) {
                waBtn = `<a href="https://wa.me/55${cleanPhone}?text=${encodeURIComponent(rawMessage)}" target="_blank" class="ms-2 text-success text-decoration-none" title="Enviar Detalhes no WhatsApp"><i class="fab fa-whatsapp fs-5"></i></a>`;
            }
            if (venda.cliente_email) {
                emailBtn = `<a href="mailto:${encodeURIComponent(venda.cliente_email)}?subject=Atualização do Pedido #${venda.id}&body=${encodeURIComponent(rawMessage)}" target="_blank" class="ms-2 text-primary text-decoration-none" title="Enviar E-mail"><i class="fas fa-envelope fs-5"></i></a>`;
            }
        }

        clientInfoDiv.innerHTML = `
            <div class="col-md-6">
                <small class="text-white-50 d-block">Nome</small>
                <span class="fw-bold text-white">${escapeHtml(venda.cliente_nome)}</span>
            </div>
             <div class="col-md-6">
                <small class="text-white-50 d-block">Telefone</small>
                <span class="text-white">${escapeHtml(venda.cliente_telefone) || 'Não informado'}</span> ${waBtn}
            </div>
             <div class="col-md-6">
                <small class="text-white-50 d-block">Email</small>
                <span class="text-white">${escapeHtml(venda.cliente_email) || 'Não informado'}</span> ${emailBtn}
            </div>
             <div class="col-md-6">
                <small class="text-white-50 d-block">CPF</small>
                <span class="text-white">${escapeHtml(venda.cliente_cpf) || 'Não informado'}</span>
            </div>
        `;

        // Linha do Tempo (datas de cada marco, para respaldo jurídico)
        const timelineText = document.getElementById('orderTimelineText');
        const marcos = [
            { label: 'Pedido criado', data: venda.data_hora },
            { label: 'Pagamento confirmado', data: venda.data_pagamento },
            { label: 'Enviado', data: venda.data_envio },
            { label: 'Entregue', data: venda.data_entrega }
        ];
        let timelineHtml = marcos
            .filter(m => m.data)
            .map(m => `<strong>${m.label}:</strong> ${escapeHtml(m.data)}`)
            .join('<br>');
        if (venda.data_cancelamento) {
            timelineHtml += `<br><strong class="text-danger">${venda.status === 'Reembolsada' ? 'Reembolsada' : 'Cancelada'} em:</strong> ${escapeHtml(venda.data_cancelamento)}`;
            if (venda.motivo_cancelamento) {
                timelineHtml += `<br><strong>Motivo:</strong> ${escapeHtml(venda.motivo_cancelamento)}`;
            }
        }
        timelineText.innerHTML = timelineHtml || 'Sem marcos registrados.';

        // Legal Compliance Box
        const legalCard = document.getElementById('legalComplianceCard');
        const legalText = document.getElementById('legalComplianceText');
        if (venda.termos_aceitos && venda.ip_comprador) {
            legalCard.classList.remove('d-none');
            const dataAceite = venda.data_hora;
            legalText.innerHTML = `O cliente <strong>${escapeHtml(venda.cliente_nome) || 'Não informado'}</strong>, portador do CPF <strong>${escapeHtml(venda.cliente_cpf) || 'Não informado'}</strong>, declarou explicitamente ter lido e concordado com as Políticas de Troca, Prazos e Termos de Uso.<br><br>
            <strong>Registrado em:</strong> ${escapeHtml(dataAceite)}<br>
            <strong>Versão dos Termos aceita:</strong> ${escapeHtml(venda.versao_termos) || 'Não registrada'}<br>
            <strong>Assinatura Digital (IP):</strong> ${escapeHtml(venda.ip_comprador)}<br>
            <strong>Dispositivo/Navegador:</strong> ${escapeHtml(venda.user_agent_comprador) || 'Não registrado'}`;
        } else {
            legalCard.classList.add('d-none');
            legalText.innerHTML = '';
        }

        document.getElementById('modalOrderDate').textContent = venda.data_hora;
        // NOTE: modalOrderTotal element was removed from header section in HTML update, 
        // using modalOrderTotal in footer section now.

        // Remove old references
        // const deliveryType = venda.tipo_entrega || 'Motoboy';
        // document.getElementById('modalOrderDeliveryType').textContent = deliveryType;

        const statusEl = document.getElementById('modalOrderStatus');
        statusEl.textContent = venda.status || 'Desconhecido';
        statusEl.className = `badge fs-6 ${getStatusClass(venda.status || '')} `;

        // Botão "Ver Comprovante" (só aparece se o pagamento já foi confirmado)
        const comprovanteBtn = document.getElementById('verComprovanteBtn');
        if (comprovanteBtn) {
            if (!['Pendente', 'Cancelada'].includes(venda.status)) {
                comprovanteBtn.classList.remove('d-none');
                comprovanteBtn.onclick = () => verComprovanteAdmin(venda.id);
            } else {
                comprovanteBtn.classList.add('d-none');
            }
        }

        // Card "Sem pagamento registrado" (só aparece se não houver nenhum Pagamento e o
        // pedido não estiver cancelado/reembolsado)
        const marcarPagoCard = document.getElementById('marcarPagoCard');
        if (marcarPagoCard) {
            const semPagamento = (!venda.pagamentos || venda.pagamentos.length === 0);
            const podeMarcar = !['Cancelada', 'Reembolsada'].includes(venda.status);
            marcarPagoCard.classList.toggle('d-none', !(semPagamento && podeMarcar));
        }

        // Render Itens
        const itemsList = document.getElementById('modalOrderItems');
        itemsList.innerHTML = '';
        let subtotalCalculado = 0;

        venda.itens.forEach(item => {
            subtotalCalculado += (item.quantidade * item.preco_unitario);
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
                    <span>R$ ${(item.quantidade * item.preco_unitario).toFixed(2)}</span>
                </li>
            `;
        });

        // Financial Summary Logic
        const desc = parseFloat(venda.desconto_total) || 0;
        const frete = parseFloat(venda.taxa_entrega) || 0;
        const freteNome = venda.tipo_entrega || 'Frete';

        document.getElementById('modalSummarySubtotal').textContent = `R$ ${subtotalCalculado.toFixed(2)}`;
        document.getElementById('modalSummaryDiscount').textContent = `- R$ ${desc.toFixed(2)}`;

        const transp = venda.transportadora ? ` (${venda.transportadora})` : '';
        document.getElementById('modalSummaryFreight').textContent = `R$ ${frete.toFixed(2)}`;
        document.getElementById('modalSummaryFreightType').textContent = `${freteNome}${transp}`;

        document.getElementById('modalOrderTotal').textContent = `R$ ${venda.total_venda.toFixed(2)}`;

        // Render Address
        let address = '';
        if (venda.entrega_rua) {
            address = `Destinatário: ${venda.cliente_nome}
Rua: ${venda.entrega_rua}, ${venda.entrega_numero} ${venda.entrega_complemento ? `- ${venda.entrega_complemento}` : ''}
Bairro: ${venda.entrega_bairro}
Cidade: ${venda.entrega_cidade} / ${venda.entrega_estado}
CEP: ${venda.entrega_cep}`;
        } else {
            address = 'Endereço não informado ou Retirada na Loja.';
        }
        document.getElementById('modalOrderAddress').textContent = address;
        document.getElementById('modalOrderAddress').style.whiteSpace = 'pre-line'; // Preserve line breaks

        // Populate Tracking Inputs
        document.getElementById('trackingCodeInput').value = venda.codigo_rastreio || '';

        // O texto salvo em venda.transportadora (ex: "Retirada na Loja", "Motoboy Próprio",
        // "SEDEX") raramente bate com o valor exato das opções do dropdown (Retirada, Motoboy,
        // Correios...), então tentar um match exato quase nunca funcionava - o admin tinha que
        // reselecionar manualmente toda vez, mesmo o sistema já sabendo a transportadora.
        // Em vez disso, procura qual opção está contida no texto salvo.
        const carrierSelect = document.getElementById('trackingCarrierInput');
        carrierSelect.selectedIndex = 0;
        if (venda.transportadora && venda.transportadora !== 'None') {
            const transportadoraLower = venda.transportadora.toLowerCase();
            // Sinônimos que não aparecem como substring do nome da opção (ex: SEDEX/PAC são
            // serviços dos Correios, mas não contêm a palavra "correios").
            const sinonimos = { sedex: 'Correios', pac: 'Correios' };
            const sinonimoEncontrado = Object.keys(sinonimos).find(chave => transportadoraLower.includes(chave));

            if (sinonimoEncontrado) {
                carrierSelect.value = sinonimos[sinonimoEncontrado];
            } else {
                for (const option of carrierSelect.options) {
                    if (option.value && transportadoraLower.includes(option.value.toLowerCase())) {
                        carrierSelect.value = option.value;
                        break;
                    }
                }
            }
        }

        // Store ID for save button context
        document.getElementById('trackingCodeInput').dataset.vendaId = venda.id;

        // Etiqueta do Melhor Envio: só aparece se essa venda foi feita com um serviço do ME
        // (codigo_servico_frete começa com "me_"). Se já existe etiqueta, o botão imprime a
        // que já foi gerada (nunca gera de novo - isso recompraria o frete); senão, gera.
        const etiquetaBox = document.getElementById('etiquetaMelhorEnvioBox');
        const usouMelhorEnvio = venda.codigo_servico_frete && venda.codigo_servico_frete.startsWith('me_');
        if (usouMelhorEnvio) {
            etiquetaBox.classList.remove('d-none');
            const btn = document.getElementById('btnEtiquetaAction');
            const label = document.getElementById('btnEtiquetaActionLabel');
            if (venda.etiqueta_url) {
                label.textContent = 'Imprimir Etiqueta';
                btn.onclick = () => window.open(`/imprimir_etiqueta.html?venda_id=${venda.id}`, '_blank');
            } else {
                label.textContent = 'Gerar Etiqueta';
                btn.onclick = () => gerarEtiquetaEImprimir(venda.id, btn, label);
            }
        } else {
            etiquetaBox.classList.add('d-none');
        }

        // Render Actions (Also Contextual here!)
        const actionsDiv = document.getElementById('statusActions');
        actionsDiv.innerHTML = '';

        const tipoEntrega = venda.tipo_entrega || 'Motoboy';

        if (venda.status !== 'Cancelada' && venda.status !== 'Entregue') {
            const nextStatus = getNextStatus(venda.status, tipoEntrega);
            if (nextStatus) {
                actionsDiv.innerHTML += `<button class="btn btn-success flex-grow-1" onclick="updateOrderStatus(${venda.id}, '${nextStatus}')">Avançar para: ${nextStatus}</button>`;
            }
            actionsDiv.innerHTML += `<button class="btn btn-danger" onclick="updateOrderStatus(${venda.id}, 'Cancelada')">Cancelar Pedido</button>`;
        } else {
            actionsDiv.innerHTML = '<span class="text-white-50 small">Nenhuma ação disponível para este status.</span>';
        }

        const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
        modal.show();

    } catch (error) {
        console.error(error);
        Swal.fire('Erro', 'Não foi possível carregar os detalhes.', 'error');
    }
}

async function gerarEtiquetaEImprimir(vendaId, btn, label) {
    const token = localStorage.getItem('authToken');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Gerando...';

    try {
        const res = await fetch(`${API_URL}/api/vendas/${vendaId}/etiqueta`, {
            method: 'POST',
            headers: { 'x-access-token': token }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.erro || 'Erro ao gerar etiqueta.');

        window.open(`/imprimir_etiqueta.html?venda_id=${vendaId}`, '_blank');
    } catch (error) {
        console.error('Erro ao gerar etiqueta:', error);
        Swal.fire('Erro', error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

function copiarEndereco() {
    const venda = window.currentOrderDetails;
    if (!venda || !venda.entrega_rua) {
        Swal.fire('Aviso', 'Não há endereço para copiar.', 'warning');
        return;
    }

    const textToCopy = `Destinatário: ${venda.cliente_nome}
Rua: ${venda.entrega_rua}, ${venda.entrega_numero} ${venda.entrega_complemento ? `- ${venda.entrega_complemento}` : ''}
Bairro: ${venda.entrega_bairro}
Cidade: ${venda.entrega_cidade} / ${venda.entrega_estado}
CEP: ${venda.entrega_cep}
Obs: Pedido #${venda.id}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        Swal.fire({
            icon: 'success',
            title: 'Copiado!',
            text: 'Endereço copiado para a área de transferência.',
            timer: 1500,
            showConfirmButton: false
        });
    });
}

async function salvarRastreio() {
    const input = document.getElementById('trackingCodeInput');
    const select = document.getElementById('trackingCarrierInput');
    const vendaId = input.dataset.vendaId;
    const token = localStorage.getItem('authToken');

    if (!vendaId) return;

    try {
        const response = await fetch(`${API_URL}/api/vendas/${vendaId}/rastreio`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token
            },
            body: JSON.stringify({
                codigo_rastreio: input.value,
                transportadora: select.value
            })
        });

        if (!response.ok) throw new Error('Falha ao salvar rastreio');

        Swal.fire({
            icon: 'success',
            title: 'Salvo!',
            text: 'Informações de rastreio atualizadas.',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (error) {
        Swal.fire('Erro', error.message, 'error');
    }
}

function getNextStatus(current, tipo) {
    let flow = [];

    if (tipo === 'Retirada') {
        flow = ['Em separação', 'Pronto para retirada', 'Entregue'];
    } else if (tipo === 'Correios') {
        flow = ['Em separação', 'Produto Postado', 'Entregue'];
    } else {
        flow = ['Em separação', 'Saiu para entrega', 'Entregue'];
    }

    // Pendente (ainda não confirmado) e Concluída (pago, aguardando separação)
    // ainda não entraram no fluxo de preparação: o próximo passo para ambos é "Em separação".
    if (current === 'Pendente' || current === 'Concluída') {
        return flow[0];
    }

    const idx = flow.indexOf(current);
    if (idx >= 0 && idx < flow.length - 1) {
        return flow[idx + 1];
    }
    return null;
}

async function updateOrderStatus(id, newStatus) {
    const token = localStorage.getItem('authToken');
    let motivo = null;

    if (newStatus === 'Cancelada') {
        const confirm = await Swal.fire({
            title: 'Cancelar pedido',
            text: "O estoque será estornado automaticamente. Informe o motivo do cancelamento:",
            icon: 'warning',
            input: 'text',
            inputPlaceholder: 'Ex: cliente desistiu, produto em falta...',
            inputValidator: (value) => !value.trim() ? 'O motivo é obrigatório.' : undefined,
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, cancelar!'
        });
        if (!confirm.isConfirmed) return;
        motivo = confirm.value.trim();
    }

    try {
        const response = await fetch(`${API_URL}/api/vendas/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token
            },
            body: JSON.stringify({ status: newStatus, motivo })
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

