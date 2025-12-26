// Define a URL base da sua API. Deixe vazio para rodar no mesmo local.
const API_URL = '';
const token = localStorage.getItem('authToken');

// Barreira de segurança: Se não houver token, redireciona para o login.
if (!token) {
    window.location.href = '/login.html';
}

// --- VARIÁVEIS GLOBAIS ---
let allProducts = [];
let cart = [];
let allClients = [];
let appliedCoupons = []; // Array para armazenar os múltiplos cupons aplicados
let payments = [];
let totalSaleValue = 0;

// Variáveis para o carrossel de imagens
let currentPreviewImages = [];
let currentPreviewIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const cartItemsDiv = document.getElementById('cartItems');
    const cartSubtotalSpan = document.getElementById('cartSubtotal');
    const cartTotalSpan = document.getElementById('cartTotal');

    // Elementos do Preview de Imagem
    const lastItemPreview = document.getElementById('last-item-preview');
    const previewImage = document.getElementById('preview-image');
    const prevImageBtn = document.getElementById('prevImageBtn');
    const nextImageBtn = document.getElementById('nextImageBtn');
    const imageCounter = document.getElementById('imageCounter');

    const cupomInput = document.getElementById('cupomInput');
    const applyCupomBtn = document.getElementById('applyCupomBtn');
    const taxaEntregaInput = document.getElementById('taxaEntregaInput');
    const freeDeliveryCheckbox = document.getElementById('freeDeliveryCheckbox');
    const deliveryAddressWrapper = document.getElementById('deliveryAddressWrapper');

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

    // UPDATED FOR SPLIT PAYMENTS
    const paymentAmountWrapper = document.getElementById('paymentAmountWrapper');
    const paymentAmountInput = document.getElementById('paymentAmountInput');
    const paymentAmountLabel = document.getElementById('paymentAmountLabel');

    const changePreviewWrapper = document.getElementById('changePreviewWrapper');
    const changePreviewValue = document.getElementById('changePreviewValue');
    const addedPaymentsList = document.getElementById('addedPaymentsList');
    const confirmSaleBtn = document.getElementById('confirmSaleBtn');

    // --- FUNÇÕES ---

    async function fetchAllProducts() {
        try {


            const currentSearchQuery = searchInput.value;
            const response = await fetch(`${API_URL}/api/produtos?per_page=1000`, { headers: { 'x-access-token': token } });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Status: ${response.status}. ${errorText}`);
            }

            const data = await response.json();

            if (!data.produtos) {
                searchResults.innerHTML = `<div class="list-group-item text-danger">ERRO API: Resposta sem chave "produtos". Keys: ${Object.keys(data).join(', ')}</div>`;
                return;
            }

            allProducts = data.produtos;



            if (currentSearchQuery) renderSearchResults(currentSearchQuery);
        } catch (error) {
            console.error('Erro no fetchAllProducts:', error);
            searchResults.innerHTML = `<div class="list-group-item text-danger">ERRO CRÍTICO: ${error.message}</div>`;
            alert('Erro crítico ao carregar produtos: ' + error.message);
        }
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

        if (allProducts.length === 0) {
            searchResults.innerHTML = `<div class="list-group-item text-danger text-center">
                ERRO: Lista de produtos vazia (0 itens).<br>
                Tentando recarregar...<br>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="location.reload()">Recarregar Página</button>
             </div>`;
            // Tentar recarregar se estiver vazia
            fetchAllProducts();
            return;
        }

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

        // Configurar imagens para o carrossel
        currentPreviewImages = [];
        if (product.imagem_url) currentPreviewImages.push(product.imagem_url);
        if (product.imagens && product.imagens.length > 0) {
            product.imagens.forEach(img => currentPreviewImages.push(img.imagem_url));
        }
        // Remove duplicatas se houver (caso a imagem principal esteja na lista de imagens extras)
        currentPreviewImages = [...new Set(currentPreviewImages)];

        if (currentPreviewImages.length === 0) currentPreviewImages.push('default.png');

        currentPreviewIndex = 0;
        updatePreviewDisplay();
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

    function updatePreviewDisplay() {
        if (currentPreviewImages.length === 0) return;

        const imageUrl = currentPreviewImages[currentPreviewIndex];
        previewImage.src = `${API_URL}/uploads/${imageUrl}`;

        // Atualizar contador
        if (currentPreviewImages.length > 1) {
            imageCounter.textContent = `${currentPreviewIndex + 1}/${currentPreviewImages.length}`;
            imageCounter.style.display = 'block';
            prevImageBtn.style.display = 'block';
            nextImageBtn.style.display = 'block';
        } else {
            imageCounter.style.display = 'none';
            prevImageBtn.style.display = 'none';
            nextImageBtn.style.display = 'none';
        }
    }

    function nextPreviewImage() {
        if (currentPreviewImages.length <= 1) return;
        currentPreviewIndex = (currentPreviewIndex + 1) % currentPreviewImages.length;
        updatePreviewDisplay();
    }

    function prevPreviewImage() {
        if (currentPreviewImages.length <= 1) return;
        currentPreviewIndex = (currentPreviewIndex - 1 + currentPreviewImages.length) % currentPreviewImages.length;
        updatePreviewDisplay();
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

    function renderAppliedCoupons() {
        appliedCouponsList.innerHTML = '';
        if (appliedCoupons.length > 0) {
            appliedCoupons.forEach(coupon => {
                const couponBadge = document.createElement('span');
                couponBadge.className = 'badge bg-success me-2 mb-1';
                couponBadge.innerHTML = `${coupon.codigo} <button class="btn-close btn-close-white ms-1" style="font-size: 0.6em;" data-code="${coupon.codigo}"></button>`;
                appliedCouponsList.appendChild(couponBadge);
            });
        }
    }

    function updateTotals() {
        let subtotal = cart.reduce((sum, item) => sum + (item.quantidade * item.preco_venda), 0);
        let totalDiscountAmount = 0;
        let subtotalParaCalculo = subtotal;

        if (appliedCoupons.length > 0) {
            const cuponsOrdenados = [...appliedCoupons].sort((a, b) => {
                if (a.tipo_desconto === 'percentual' && b.tipo_desconto !== 'percentual') return -1;
                if (a.tipo_desconto !== 'percentual' && b.tipo_desconto === 'percentual') return 1;
                return b.valor_desconto - a.valor_desconto;
            });

            cuponsOrdenados.forEach(coupon => {
                let baseCalculo = 0;
                if (coupon.aplicacao === 'total') {
                    baseCalculo = subtotalParaCalculo;
                } else { // 'produto_especifico'
                    baseCalculo = cart.reduce((sum, cartItem) => {
                        if (coupon.produtos_validos_ids.includes(cartItem.id)) {
                            return sum + (cartItem.quantidade * cartItem.preco_venda);
                        }
                        return sum;
                    }, 0);
                }

                let descontoRodada = 0;
                if (coupon.tipo_desconto === 'percentual') {
                    descontoRodada = (baseCalculo * coupon.valor_desconto) / 100;
                } else { // 'fixo'
                    descontoRodada = Math.min(coupon.valor_desconto, baseCalculo);
                }

                totalDiscountAmount += descontoRodada;
                if (coupon.aplicacao === 'total') {
                    subtotalParaCalculo -= descontoRodada;
                }
            });
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

    function removeCoupon(codeToRemove) {
        appliedCoupons = appliedCoupons.filter(c => c.codigo !== codeToRemove);
        renderAppliedCoupons();
        updateTotals();
    }

    function preparePaymentModal() {
        try {
            console.log('preparePaymentModal chamado');
            // alert('DEBUG: Botão de pagamento clicado!'); 

            const totalText = cartTotalSpan.textContent;
            console.log('Texto do total:', totalText);

            totalSaleValue = parseFloat(totalText.replace('R$ ', '').replace(',', '.'));
            console.log('Valor total parseado:', totalSaleValue);

            if (isNaN(totalSaleValue)) {
                alert('Erro: Valor total inválido.');
                return;
            }

            payments = [];

            paymentMethodSelect.value = 'Dinheiro';
            paymentInstallmentsWrapper.classList.add('d-none');

            // UPDATED: paymentAmountWrapper is always visible
            changePreviewWrapper.classList.remove('d-none');

            // UPDATED: Initialize with total value
            paymentAmountInput.value = totalSaleValue.toFixed(2);
            paymentAmountLabel.textContent = 'Valor Recebido (R$)';
            changePreviewValue.textContent = 'R$ 0,00';

            updatePaymentModal();
            paymentModal.show();
        } catch (error) {
            console.error('Erro em preparePaymentModal:', error);
            alert('Erro ao abrir modal de pagamento: ' + error.message);
        }
    }

    function updatePaymentModal() {
        const totalPaidSoFar = payments.reduce((sum, p) => sum + p.valor, 0);
        const remaining = totalSaleValue - totalPaidSoFar;

        paymentTotalDisplay.textContent = `R$ ${totalSaleValue.toFixed(2)}`;

        if (remaining < -0.01) {
            paymentRemainingDisplay.innerHTML = `<span class="text-success">Troco: R$ ${Math.abs(remaining).toFixed(2)}</span>`;
            confirmSaleBtn.disabled = false;
        } else {
            paymentRemainingDisplay.textContent = `R$ ${Math.max(0, remaining).toFixed(2)}`;
            confirmSaleBtn.disabled = remaining > 0.01;
        }

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

        // UPDATED: Auto-fill remaining amount
        if (remaining > 0) {
            paymentAmountInput.value = remaining.toFixed(2);
        } else {
            paymentAmountInput.value = '0.00';
        }
    }

    function addPayment(event) {
        event.preventDefault();
        const forma = paymentMethodSelect.value;
        const valor = parseFloat(paymentAmountInput.value); // UPDATED
        const totalPaidSoFar = payments.reduce((sum, p) => sum + p.valor, 0);
        const remaining = totalSaleValue - totalPaidSoFar;

        if (isNaN(valor) || valor <= 0) { alert('Por favor, insira um valor de pagamento válido.'); return; }

        // Se NÃO for dinheiro, não pode pagar a mais
        if (forma !== 'Dinheiro' && valor > remaining + 0.01) {
            alert('O valor do pagamento não pode ser maior que o valor restante (exceto em Dinheiro).');
            return;
        }

        // Se for dinheiro, pode pagar a mais (gera troco)

        payments.push({ forma, valor });
        updatePaymentModal();
    }

    async function finalizeSale() {
        if (cart.length === 0) return;
        const saleData = {
            itens: cart.map(item => ({ id_produto: item.id, quantidade: item.quantidade })),
            pagamentos: payments,
            id_cliente: selectedClientId.value || null,
            taxa_entrega: parseFloat(taxaEntregaInput.value) || 0,
            entrega_gratuita: freeDeliveryCheckbox.checked,
            cupons_utilizados: appliedCoupons.map(c => c.codigo),
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

            cart = [];
            payments = [];
            appliedCoupons = [];
            renderAppliedCoupons();

            taxaEntregaInput.value = 0;
            freeDeliveryCheckbox.checked = false;
            deliveryAddressWrapper.classList.add('d-none');
            document.getElementById('deliveryAddressWrapper').querySelectorAll('input').forEach(i => i.value = '');
            lastItemPreview.style.display = 'none';
            removeClient();
            renderCart();
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
            if (data.desconto_total > 0) {
                receiptDiscountRow.classList.remove('d-none');
                document.getElementById('receiptCupomCode').textContent = data.cupons_utilizados.join(', ');
                document.getElementById('receiptDiscountValue').textContent = `- R$ ${data.desconto_total.toFixed(2)}`;
            } else {
                receiptDiscountRow.classList.add('d-none');
            }
            if (data.entrega_gratuita) {
                document.getElementById('receiptTaxaEntrega').innerHTML = '<span class="text-success">Grátis</span> <small class="text-muted text-decoration-line-through">R$ ' + data.taxa_entrega.toFixed(2) + '</small>';
            } else {
                document.getElementById('receiptTaxaEntrega').textContent = `R$ ${data.taxa_entrega.toFixed(2)}`;
            }
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

            if (data.troco > 0) {
                const trocoElem = document.createElement('h5');
                trocoElem.className = 'text-success mt-2';
                trocoElem.innerHTML = `<strong>Troco:</strong> R$ ${data.troco.toFixed(2)}`;
                paymentsDiv.appendChild(trocoElem);
            }

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

    function printReceipt(format) {
        const receiptContent = document.getElementById('receiptContent');
        receiptContent.classList.toggle('termica-print', format === 'termica');
        setTimeout(() => window.print(), 100);
    }

    // --- EVENT LISTENERS ---

    searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
    searchResults.addEventListener('click', (e) => { e.preventDefault(); const item = e.target.closest('[data-product-id]'); if (item) { addToCart(parseInt(item.dataset.productId)); searchInput.value = ''; searchResults.innerHTML = ''; searchInput.focus(); } });
    cartItemsDiv.addEventListener('click', (e) => { const target = e.target; const id = parseInt(target.dataset.id); if (!id) return; if (target.classList.contains('adjust-qty-btn')) { const item = cart.find(i => i.id === id); const stockProduct = allProducts.find(p => p.id === id); if (target.dataset.action === 'increase' && item.quantidade < stockProduct.quantidade) item.quantidade++; else if (target.dataset.action === 'decrease' && item.quantidade > 0) item.quantidade--; if (item.quantidade === 0) cart = cart.filter(i => i.id !== id); renderCart(); } else if (target.classList.contains('remove-item-btn')) { cart = cart.filter(i => i.id !== id); renderCart(); } });
    applyCupomBtn.addEventListener('click', applyCoupon);
    appliedCouponsList.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON' && e.target.dataset.code) { removeCoupon(e.target.dataset.code); } });
    taxaEntregaInput.addEventListener('input', () => {
        const hasFee = (parseFloat(taxaEntregaInput.value) || 0) > 0;
        const isFree = freeDeliveryCheckbox.checked;
        (hasFee || isFree) ? deliveryAddressWrapper.classList.remove('d-none') : deliveryAddressWrapper.classList.add('d-none');
        updateTotals();
    });
    freeDeliveryCheckbox.addEventListener('change', () => {
        const hasFee = (parseFloat(taxaEntregaInput.value) || 0) > 0;
        const isFree = freeDeliveryCheckbox.checked;
        (hasFee || isFree) ? deliveryAddressWrapper.classList.remove('d-none') : deliveryAddressWrapper.classList.add('d-none');
        updateTotals();
    });
    openPaymentModalBtn.addEventListener('click', preparePaymentModal);
    addPaymentForm.addEventListener('submit', addPayment);
    confirmSaleBtn.addEventListener('click', finalizeSale);

    // Event Listeners para o Carrossel de Imagens
    prevImageBtn.addEventListener('click', prevPreviewImage);
    nextImageBtn.addEventListener('click', nextPreviewImage);

    // UPDATED EVENT LISTENERS
    paymentMethodSelect.addEventListener('change', () => {
        const isCredit = paymentMethodSelect.value === 'Cartão de Crédito';
        const isCash = paymentMethodSelect.value === 'Dinheiro';
        paymentInstallmentsWrapper.classList.toggle('d-none', !isCredit);

        // paymentAmountWrapper is always visible
        changePreviewWrapper.classList.toggle('d-none', !isCash);

        if (isCash) {
            paymentAmountLabel.textContent = 'Valor Recebido (R$)';
            changePreviewValue.textContent = 'R$ 0,00';
        } else {
            paymentAmountLabel.textContent = 'Valor a Pagar (R$)';
        }
    });

    paymentAmountInput.addEventListener('input', () => {
        const received = parseFloat(paymentAmountInput.value) || 0;
        const totalPaidSoFar = payments.reduce((sum, p) => sum + p.valor, 0);
        const debt = totalSaleValue - totalPaidSoFar;
        const change = received - debt;

        if (change > 0) {
            changePreviewValue.textContent = `R$ ${change.toFixed(2)}`;
        } else {
            changePreviewValue.textContent = 'R$ 0,00';
        }
    });

    addedPaymentsList.addEventListener('click', (e) => { if (e.target.classList.contains('remove-payment-btn')) { const indexToRemove = parseInt(e.target.dataset.index); payments.splice(indexToRemove, 1); updatePaymentModal(); } });
    clientSearchInput.addEventListener('input', () => renderClientSearchResults(clientSearchInput.value));
    clientSearchResults.addEventListener('click', (e) => { e.preventDefault(); if (e.target.dataset.clientId) selectClient(e.target.dataset.clientId); });
    removeClientBtn.addEventListener('click', removeClient);
    quickClientForm.addEventListener('submit', async (e) => { e.preventDefault(); const data = { nome: document.getElementById('quickClientNome').value, telefone: document.getElementById('quickClientTelefone').value, cpf: document.getElementById('quickClientCpf').value }; try { const response = await fetch(`${API_URL}/api/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-token': token }, body: JSON.stringify(data) }); const newClient = await response.json(); if (response.ok) { quickClientModal.hide(); await fetchAllClients(); selectClient(newClient.id); } else { alert(`Erro: ${newClient.message || newClient.erro}`); } } catch (error) { console.error(error); } });
    document.getElementById('logoutButton').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
    document.getElementById('quickAddClientBtn').addEventListener('click', () => { quickClientForm.reset(); quickClientModal.show(); });
    document.body.addEventListener('click', (event) => { if (event.target.id === 'imprimirA4Btn') printReceipt('a4'); if (event.target.id === 'imprimirTermicaBtn') printReceipt('termica'); });
    window.onafterprint = () => document.getElementById('receiptContent').classList.remove('termica-print');

    // --- INICIALIZAÇÃO ---
    fetchAllProducts();
    fetchAllClients();
    setInterval(fetchAllProducts, 20000); // Atualiza o estoque periodicamente
});