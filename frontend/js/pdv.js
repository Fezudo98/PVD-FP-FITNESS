const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// --- VARIÁVEIS GLOBAIS ---
let allProducts = [];
let cart = [];
let allClients = [];
let appliedCoupons = []; // MODIFICADO: Agora é um array para múltiplos cupons
let payments = [];
let totalSaleValue = 0;

document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const cartItemsDiv = document.getElementById('cartItems');
    const cartSubtotalSpan = document.getElementById('cartSubtotal');
    const cartTotalSpan = document.getElementById('cartTotal');
    const lastItemPreview = document.getElementById('last-item-preview');
    const previewImage = document.getElementById('preview-image');
    
    const cupomInput = document.getElementById('cupomInput');
    const applyCupomBtn = document.getElementById('applyCupomBtn');
    const taxaEntregaInput = document.getElementById('taxaEntregaInput');
    const freeDeliveryCheckbox = document.getElementById('freeDeliveryCheckbox');
    const deliveryAddressWrapper = document.getElementById('deliveryAddressWrapper');

    // NOVAS REFERÊNCIAS PARA MÚLTIPLOS CUPONS
    const appliedCouponsList = document.getElementById('appliedCouponsList');
    const totalDiscountDisplay = document.getElementById('totalDiscountDisplay');
    const totalDiscountValueSpan = document.getElementById('totalDiscountValue');
    
    const clientSearchInput = document.getElementById('clientSearchInput');
    const clientSearchResults = document.getElementById('clientSearchResults');
    const selectedClientDisplay = document.getElementById('selectedClientDisplay');
    const selectedClientName = document.getElementById('selectedClientName');
    const removeClientBtn = document.getElementById('removeClientBtn');
    const clientSearchWrapper = document.getElementById('clientSearchWrapper');
    const selectedClientId = document.getElementById('selectedClientId');
    
    const quickClientModal = new bootstrap.Modal(document.getElementById('quickClientModal'));
    const quickClientForm = document.getElementById('quickClientForm');
    const receiptModal = new bootstrap.Modal(document.getElementById('receiptModal'));
    
    const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    const openPaymentModalBtn = document.getElementById('openPaymentModalBtn');
    const paymentTotalDisplay = document.getElementById('paymentTotalDisplay');
    const paymentRemainingDisplay = document.getElementById('paymentRemainingDisplay');
    const addPaymentForm = document.getElementById('addPaymentForm');
    const paymentMethodSelect = document.getElementById('paymentMethodSelect');
    const paymentInstallmentsWrapper = document.getElementById('paymentInstallmentsWrapper');
    const paymentInstallmentsInput = document.getElementById('paymentInstallmentsInput');
    const paymentValueInput = document.getElementById('paymentValueInput');
    const addedPaymentsList = document.getElementById('addedPaymentsList');
    const confirmSaleBtn = document.getElementById('confirmSaleBtn');

    // --- FUNÇÕES ---

    async function fetchAllProducts() {
        try {
            const currentSearchQuery = searchInput.value;
            const response = await fetch(`${API_URL}/api/produtos?per_page=1000`, { headers: { 'x-access-token': token } });
            if (!response.ok) throw new Error('Falha ao recarregar produtos.');
            const data = await response.json();
            allProducts = data.produtos;
            if (currentSearchQuery) renderSearchResults(currentSearchQuery);
        } catch (error) { console.error(error); }
    }

    async function fetchAllClients() {
        try {
            const response = await fetch(`${API_URL}/api/clientes`, { headers: { 'x-access-token': token } });
            if (!response.ok) throw new Error('Falha ao carregar clientes.');
            allClients = await response.json();
        } catch (error) { console.error(error); alert('Não foi possível carregar os clientes.'); }
    }

    function renderSearchResults(query) {
        searchResults.innerHTML = '';
        if (!query) return;
        const filtered = allProducts.filter(p => p.nome.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            searchResults.innerHTML = '<div class="list-group-item text-muted text-center">Nenhum produto encontrado.</div>';
            return;
        }
        filtered.slice(0, 7).forEach(p => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action d-flex align-items-center';
            item.innerHTML = `<img src="${API_URL}/uploads/${p.imagem_url || 'default.png'}" alt="${p.nome}" class="rounded me-3" style="width: 50px; height: 50px; object-fit: cover;"><div>${p.nome} (SKU: ${p.sku})<br><small>Estoque: ${p.quantidade}</small></div>`;
            item.dataset.productId = p.id;
            searchResults.appendChild(item);
        });
    }

    function addToCart(productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product || product.quantidade <= 0) { alert('Produto sem estoque!'); return; }
        previewImage.src = `${API_URL}/uploads/${product.imagem_url || 'default.png'}`;
        lastItemPreview.style.display = 'block';
        const cartItem = cart.find(item => item.id === productId);
        if (cartItem) {
            if (cartItem.quantidade < product.quantidade) cartItem.quantidade++;
            else alert('Quantidade máxima em estoque atingida.');
        } else {
            cart.push({ ...product, quantidade: 1 });
        }
        renderCart();
    }
    
    function renderCart() {
        cartItemsDiv.innerHTML = '';
        if (cart.length === 0) {
            cartItemsDiv.innerHTML = '<div class="list-group-item text-center">Carrinho vazio</div>';
        } else {
            cart.forEach(item => {
                const itemSubtotal = item.quantidade * item.preco_venda;
                const itemDiv = document.createElement('div');
                itemDiv.className = 'list-group-item d-flex justify-content-between align-items-center';
                itemDiv.innerHTML = `<div>${item.nome} <br><small><button class="btn btn-sm btn-outline-secondary py-0 px-2 adjust-qty-btn" data-id="${item.id}" data-action="decrease">-</button><span class="mx-2">${item.quantidade}</span><button class="btn btn-sm btn-outline-secondary py-0 px-2 adjust-qty-btn" data-id="${item.id}" data-action="increase">+</button></small></div><div class="d-flex align-items-center"><strong class="me-3">R$ ${itemSubtotal.toFixed(2)}</strong><button class="btn btn-sm btn-outline-danger py-0 px-2 remove-item-btn" data-id="${item.id}">X</button></div>`;
                cartItemsDiv.appendChild(itemDiv);
            });
        }
        updateTotals();
    }
    
    // NOVA FUNÇÃO para renderizar os badges dos cupons
    function renderAppliedCoupons() {
        appliedCouponsList.innerHTML = '';
        if (appliedCoupons.length > 0) {
            appliedCoupons.forEach(coupon => {
                const couponBadge = document.createElement('span');
                couponBadge.className = 'badge bg-success me-2 mb-1'; // mb-1 para espaçamento
                couponBadge.innerHTML = `
                    ${coupon.codigo} 
                    <button class="btn-close btn-close-white ms-1" style="font-size: 0.6em;" data-code="${coupon.codigo}"></button>
                `;
                appliedCouponsList.appendChild(couponBadge);
            });
        }
    }

    // FUNÇÃO ATUALIZADA para calcular múltiplos descontos
    function updateTotals() {
        let subtotal = cart.reduce((sum, item) => sum + (item.quantidade * item.preco_venda), 0);
        let totalDiscountAmount = 0;
        let subtotalParaCalculo = subtotal;

        if (appliedCoupons.length > 0) {
            // Lógica de cálculo espelhando o backend (percentual primeiro, depois fixo)
            const percentuais = appliedCoupons.filter(c => c.tipo_desconto === 'percentual');
            percentuais.sort((a, b) => b.valor_desconto - a.valor_desconto); // Maior % primeiro
            
            for (const coupon of percentuais) {
                let baseCalculo = (coupon.aplicacao === 'total') ? subtotalParaCalculo : cart.reduce((sum, item) => coupon.produtos_validos_ids.includes(item.id) ? sum + (item.quantidade * item.preco_venda) : sum, 0);
                const discount = (baseCalculo * coupon.valor_desconto) / 100;
                totalDiscountAmount += discount;
                subtotalParaCalculo -= discount;
            }

            const fixos = appliedCoupons.filter(c => c.tipo_desconto === 'fixo');
            fixos.sort((a, b) => b.valor_desconto - a.valor_desconto); // Maior valor fixo primeiro
            
            for (const coupon of fixos) {
                let baseCalculo = (coupon.aplicacao === 'total') ? subtotalParaCalculo : cart.reduce((sum, item) => coupon.produtos_validos_ids.includes(item.id) ? sum + (item.quantidade * item.preco_venda) : sum, 0);
                const discount = Math.min(coupon.valor_desconto, baseCalculo);
                totalDiscountAmount += discount;
                subtotalParaCalculo -= discount;
            }
        }
        
        totalDiscountAmount = Math.min(totalDiscountAmount, subtotal);

        if (totalDiscountAmount > 0) {
            totalDiscountValueSpan.textContent = `- R$ ${totalDiscountAmount.toFixed(2)}`;
            totalDiscountDisplay.classList.remove('d-none');
        } else {
            totalDiscountDisplay.classList.add('d-none');
        }
        
        const taxaEntrega = parseFloat(taxaEntregaInput.value) || 0;
        let totalGeral = subtotal - totalDiscountAmount;
        if (!freeDeliveryCheckbox.checked) {
            totalGeral += taxaEntrega;
        }

        cartSubtotalSpan.textContent = `R$ ${subtotal.toFixed(2)}`;
        cartTotalSpan.textContent = `R$ ${totalGeral.toFixed(2)}`;
        openPaymentModalBtn.disabled = cart.length === 0;
    }

    // FUNÇÃO ATUALIZADA para adicionar cupons a uma lista
    async function applyCoupon() {
        const code = cupomInput.value.toUpperCase();
        if (!code) return;

        if (appliedCoupons.some(c => c.codigo === code)) {
            alert('Este cupom já foi adicionado.');
            cupomInput.value = '';
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/cupons/validar/${code}`, { headers: { 'x-access-token': token } });
            const result = await response.json();
            if (!response.ok) throw new Error(result.erro || 'Erro ao validar cupom.');
            
            appliedCoupons.push(result);
            cupomInput.value = '';
            renderAppliedCoupons();
            updateTotals();
        } catch (error) {
            alert(error.message);
        }
    }

    // NOVA FUNÇÃO para remover um cupom específico da lista
    function removeCoupon(codeToRemove) {
        appliedCoupons = appliedCoupons.filter(c => c.codigo !== codeToRemove);
        renderAppliedCoupons();
        updateTotals();
    }

    function preparePaymentModal() {
        payments = [];
        totalSaleValue = parseFloat(cartTotalSpan.textContent.replace('R$ ', '').replace(',', '.'))
        paymentValueInput.value = totalSaleValue.toFixed(2);
        updatePaymentModal();
        paymentModal.show();
    }

    function updatePaymentModal() {
        const totalPaid = payments.reduce((sum, p) => sum + p.valor, 0);
        const remaining = totalSaleValue - totalPaid;

        paymentTotalDisplay.textContent = `R$ ${totalSaleValue.toFixed(2)}`;
        paymentRemainingDisplay.textContent = `R$ ${remaining.toFixed(2)}`;
        
        addedPaymentsList.innerHTML = '';
        if (payments.length === 0) {
            addedPaymentsList.innerHTML = '<div class="list-group-item text-muted text-center">Nenhum pagamento adicionado.</div>';
        } else {
            payments.forEach((p, index) => {
                const item = document.createElement('div');
                item.className = 'list-group-item d-flex justify-content-between align-items-center';
                item.innerHTML = `<span>${p.forma}</span><strong>R$ ${p.valor.toFixed(2)}</strong><button class="btn btn-sm btn-outline-danger py-0 px-1 remove-payment-btn" data-index="${index}">X</button>`;
                addedPaymentsList.appendChild(item);
            });
        }
        confirmSaleBtn.disabled = Math.abs(remaining) > 0.01;
        paymentValueInput.value = remaining.toFixed(2);
    }

    function addPayment(event) {
        event.preventDefault();
        const forma = paymentMethodSelect.value;
        const valor = parseFloat(paymentValueInput.value);
        const remaining = totalSaleValue - payments.reduce((sum, p) => sum + p.valor, 0);
        if (isNaN(valor) || valor <= 0) { alert('Por favor, insira um valor de pagamento válido.'); return; }
        if (valor > remaining + 0.01) { alert('O valor do pagamento não pode ser maior que o valor restante.'); return; }
        payments.push({ forma, valor });
        updatePaymentModal();
    }

    // FUNÇÃO ATUALIZADA para enviar a lista de cupons
    async function finalizeSale() {
        if (cart.length === 0) return;
        const saleData = {
            itens: cart.map(item => ({ id_produto: item.id, quantidade: item.quantidade })),
            pagamentos: payments,
            id_cliente: selectedClientId.value || null,
            taxa_entrega: parseFloat(taxaEntregaInput.value) || 0,
            entrega_gratuita: freeDeliveryCheckbox.checked,
            cupons_utilizados: appliedCoupons.map(c => c.codigo), // ENVIA ARRAY DE CÓDIGOS
            parcelas: paymentInstallmentsWrapper.classList.contains('d-none') ? 1 : parseInt(paymentInstallmentsInput.value),
            entrega_rua: document.getElementById('entregaRua').value,
            entrega_numero: document.getElementById('entregaNumero').value,
            entrega_bairro: document.getElementById('entregaBairro').value,
            entrega_cidade: document.getElementById('entregaCidade').value,
            entrega_complemento: document.getElementById('entregaComplemento').value
        };

        try {
            confirmSaleBtn.disabled = true;
            confirmSaleBtn.textContent = 'Registrando...';
            const response = await fetch(`${API_URL}/api/vendas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(saleData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.erro || 'Erro ao finalizar a venda.');
            
            paymentModal.hide();
            await showReceipt(result.id_venda);
            
            // Limpeza completa do formulário
            cart = [];
            payments = [];
            appliedCoupons = []; // Limpa o array de cupons
            renderAppliedCoupons(); // Limpa a UI de cupons
            
            taxaEntregaInput.value = 0;
            freeDeliveryCheckbox.checked = false;
            deliveryAddressWrapper.classList.add('d-none');
            document.getElementById('deliveryAddressWrapper').querySelectorAll('input').forEach(i => i.value = '');
            lastItemPreview.style.display = 'none';
            removeClient();
            renderCart(); // Isso já chama updateTotals()
            await fetchAllProducts();
            searchInput.value = '';
            searchResults.innerHTML = '';

        } catch (error) {
            alert(`Erro: ${error.message}`);
        } finally {
            confirmSaleBtn.disabled = false;
            confirmSaleBtn.textContent = 'Confirmar Venda';
        }
    }

    // FUNÇÃO ATUALIZADA para exibir múltiplos cupons no recibo
    async function showReceipt(vendaId) {
        try {
            const response = await fetch(`${API_URL}/api/vendas/${vendaId}`, { headers: { 'x-access-token': token } });
            if (!response.ok) throw new Error('Não foi possível obter os detalhes da venda.');
            const data = await response.json();
            
            document.getElementById('receiptVendaId').textContent = data.id;
            document.getElementById('receiptData').textContent = data.data_hora;
            document.getElementById('receiptCliente').textContent = data.cliente_nome;
            document.getElementById('receiptVendedor').textContent = data.vendedor_nome;

            const itemsTable = document.getElementById('receiptItemsTable');
            itemsTable.innerHTML = '';
            let subtotalProdutos = 0;
            data.itens.forEach(item => {
                const row = itemsTable.insertRow();
                subtotalProdutos += item.subtotal;
                row.innerHTML = `<td>${item.produto_nome}</td><td>${item.quantidade}</td><td>R$ ${item.preco_unitario.toFixed(2)}</td><td>R$ ${item.subtotal.toFixed(2)}</td>`;
            });
            document.getElementById('receiptSubtotal').textContent = `R$ ${subtotalProdutos.toFixed(2)}`;
            
            const receiptDiscountRow = document.getElementById('receiptDiscountRow');
            if(data.desconto_total > 0) {
                receiptDiscountRow.classList.remove('d-none');
                document.getElementById('receiptCupomCode').textContent = data.cupons_utilizados.join(', ');
                document.getElementById('receiptDiscountValue').textContent = `- R$ ${data.desconto_total.toFixed(2)}`;
            } else {
                receiptDiscountRow.classList.add('d-none');
            }
            document.getElementById('receiptTaxaEntrega').textContent = `R$ ${data.taxa_entrega.toFixed(2)}`;
            document.getElementById('receiptTotalGeral').textContent = `R$ ${data.total_venda.toFixed(2)}`;
            
            const paymentsDiv = document.getElementById('receiptPayments');
            paymentsDiv.innerHTML = '';
            data.pagamentos.forEach(p => {
                let paymentText = `${p.forma} - R$ ${p.valor.toFixed(2)}`;
                if (p.forma === 'Cartão de Crédito' && data.parcelas > 1) {
                    paymentText = `${p.forma} (${data.parcelas}x) - R$ ${p.valor.toFixed(2)}`;
                }
                const pElem = document.createElement('p');
                pElem.innerHTML = `<strong>Pagamento:</strong> <span>${paymentText}</span>`;
                paymentsDiv.appendChild(pElem);
            });
            
            receiptModal.show();
        } catch (error) { console.error('Erro ao mostrar o recibo:', error); alert(error.message); }
    }

    function renderClientSearchResults(query) {
        clientSearchResults.innerHTML = '';
        if (!query || query.length < 2) return;
        const filtered = allClients.filter(c => c.nome.toLowerCase().includes(query.toLowerCase()) || (c.cpf && c.cpf.includes(query)));
        filtered.slice(0, 5).forEach(c => {
            const item = document.createElement('a'); item.href = '#';
            item.className = 'list-group-item list-group-item-action';
            item.textContent = `${c.nome} ${c.cpf ? `(${c.cpf})` : ''}`;
            item.dataset.clientId = c.id;
            clientSearchResults.appendChild(item);
        });
    }

    function selectClient(clientId) {
        const client = allClients.find(c => c.id === parseInt(clientId));
        if (client) {
            selectedClientId.value = client.id;
            selectedClientName.textContent = client.nome;
            selectedClientDisplay.classList.remove('d-none');
            clientSearchWrapper.classList.add('d-none');
            clientSearchInput.value = '';
            clientSearchResults.innerHTML = '';
        }
    }

    function removeClient() {
        selectedClientId.value = '';
        selectedClientDisplay.classList.add('d-none');
        clientSearchWrapper.classList.remove('d-none');
    }

    // --- EVENT LISTENERS ---
    
    searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
    searchResults.addEventListener('click', (e) => { e.preventDefault(); const item = e.target.closest('[data-product-id]'); if(item) { addToCart(parseInt(item.dataset.productId)); searchInput.value=''; searchResults.innerHTML=''; searchInput.focus(); } });
    cartItemsDiv.addEventListener('click', (e) => { const target = e.target; const id = parseInt(target.dataset.id); if(!id) return; if(target.classList.contains('adjust-qty-btn')) { const item = cart.find(i=>i.id===id); const stockProduct = allProducts.find(p=>p.id===id); if(target.dataset.action==='increase' && item.quantidade < stockProduct.quantidade) item.quantidade++; else if(target.dataset.action==='decrease' && item.quantidade > 0) item.quantidade--; if(item.quantidade===0) cart=cart.filter(i=>i.id!==id); renderCart(); } else if(target.classList.contains('remove-item-btn')) { cart=cart.filter(i=>i.id!==id); renderCart(); } });
    applyCupomBtn.addEventListener('click', applyCoupon);
    // NOVO LISTENER para remover cupons
    appliedCouponsList.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON' && e.target.dataset.code) { removeCoupon(e.target.dataset.code); } });
    taxaEntregaInput.addEventListener('input', () => { (parseFloat(taxaEntregaInput.value) || 0) > 0 ? deliveryAddressWrapper.classList.remove('d-none') : deliveryAddressWrapper.classList.add('d-none'); updateTotals(); });
    freeDeliveryCheckbox.addEventListener('change', updateTotals);
    openPaymentModalBtn.addEventListener('click', preparePaymentModal);
    addPaymentForm.addEventListener('submit', addPayment);
    confirmSaleBtn.addEventListener('click', finalizeSale);
    paymentMethodSelect.addEventListener('change', () => { paymentInstallmentsWrapper.classList.toggle('d-none', paymentMethodSelect.value !== 'Cartão de Crédito'); });
    addedPaymentsList.addEventListener('click', (e) => { if (e.target.classList.contains('remove-payment-btn')) { const indexToRemove = parseInt(e.target.dataset.index); payments.splice(indexToRemove, 1); updatePaymentModal(); } });
    clientSearchInput.addEventListener('input', () => renderClientSearchResults(clientSearchInput.value));
    clientSearchResults.addEventListener('click', (e) => { e.preventDefault(); if(e.target.dataset.clientId) selectClient(e.target.dataset.clientId); });
    removeClientBtn.addEventListener('click', removeClient);
    quickClientForm.addEventListener('submit', async (e) => { e.preventDefault(); const data = { nome: document.getElementById('quickClientNome').value, telefone: document.getElementById('quickClientTelefone').value, cpf: document.getElementById('quickClientCpf').value }; try { const response = await fetch(`${API_URL}/api/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-token': token }, body: JSON.stringify(data) }); const newClient = await response.json(); if(response.ok) { quickClientModal.hide(); await fetchAllClients(); selectClient(newClient.id); } else { alert(`Erro: ${newClient.message || newClient.erro}`); } } catch (error) { console.error(error); } });
    document.getElementById('logoutButton').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
    document.getElementById('quickAddClientBtn').addEventListener('click', () => { quickClientForm.reset(); quickClientModal.show(); });
    
    document.body.addEventListener('click', (event) => { if (event.target.id === 'imprimirA4Btn') printReceipt('a4'); if (event.target.id === 'imprimirTermicaBtn') printReceipt('termica'); });
    window.onafterprint = () => document.getElementById('receiptContent').classList.remove('termica-print');
    function printReceipt(format) { const receiptContent = document.getElementById('receiptContent'); receiptContent.classList.toggle('termica-print', format === 'termica'); setTimeout(() => window.print(), 100); }

    // --- INICIALIZAÇÃO ---
    fetchAllProducts();
    fetchAllClients();
    setInterval(fetchAllProducts, 20000); // Continua atualizando o estoque periodicamente
});