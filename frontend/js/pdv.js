const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// --- VARIÁVEIS GLOBAIS ---
let allProducts = [];
let cart = [];
let allClients = [];
let appliedCoupon = null;

document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const cartItemsDiv = document.getElementById('cartItems');
    const cartSubtotalSpan = document.getElementById('cartSubtotal');
    const cartTotalSpan = document.getElementById('cartTotal');
    const finalizeSaleBtn = document.getElementById('finalizeSaleBtn');
    const taxaEntregaInput = document.getElementById('taxaEntregaInput');
    const lastItemPreview = document.getElementById('last-item-preview');
    const previewImage = document.getElementById('preview-image');
    
    // Elementos do Cupom
    const cupomInput = document.getElementById('cupomInput');
    const applyCupomBtn = document.getElementById('applyCupomBtn');
    const removeCupomBtn = document.getElementById('removeCupomBtn');
    const discountDisplay = document.getElementById('discountDisplay');
    const cupomCodeDisplay = document.getElementById('cupomCodeDisplay');
    const discountValueSpan = document.getElementById('discountValue');

    // Elementos de Pagamento e Parcelamento
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const installmentsWrapper = document.getElementById('installmentsWrapper');
    const installmentsInput = document.getElementById('installmentsInput');

    // Elementos do Cliente
    const clientSearchInput = document.getElementById('clientSearchInput');
    const clientSearchResults = document.getElementById('clientSearchResults');
    const selectedClientDisplay = document.getElementById('selectedClientDisplay');
    const selectedClientName = document.getElementById('selectedClientName');
    const removeClientBtn = document.getElementById('removeClientBtn');
    const clientSearchWrapper = document.getElementById('clientSearchWrapper');
    const selectedClientId = document.getElementById('selectedClientId');
    
    // Modais
    const quickClientModal = new bootstrap.Modal(document.getElementById('quickClientModal'));
    const quickClientForm = document.getElementById('quickClientForm');
    const receiptModal = new bootstrap.Modal(document.getElementById('receiptModal'));

    // --- FUNÇÕES ---

    async function fetchAllProducts() {
        try {
            const currentSearchQuery = searchInput.value;
            const response = await fetch(`${API_URL}/api/produtos`, { headers: { 'x-access-token': token } });
            if (!response.ok) throw new Error('Falha ao recarregar produtos.');
            allProducts = await response.json();
            if (currentSearchQuery) {
                renderSearchResults(currentSearchQuery);
            }
        } catch (error) { 
            console.error(error); 
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
            if (cartItem.quantidade < product.quantidade) {
                cartItem.quantidade++;
            } else { alert('Quantidade máxima em estoque atingida.'); }
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
    
    // =============== FUNÇÃO TOTALMENTE ATUALIZADA ===============
    function updateTotals() {
        let subtotal = cart.reduce((sum, item) => sum + (item.quantidade * item.preco_venda), 0);
        let discountAmount = 0;

        if (appliedCoupon) {
            let discountBase = 0;
            // Verifica se o cupom é para o total ou para produtos específicos
            if (appliedCoupon.aplicacao === 'total') {
                discountBase = subtotal;
            } else if (appliedCoupon.aplicacao === 'produto_especifico') {
                // Calcula o subtotal apenas dos itens válidos para o cupom
                discountBase = cart.reduce((sum, item) => {
                    if (appliedCoupon.produtos_validos_ids.includes(item.id)) {
                        return sum + (item.quantidade * item.preco_venda);
                    }
                    return sum;
                }, 0);
            }

            // Calcula o valor do desconto com base no tipo
            if (appliedCoupon.tipo_desconto === 'percentual') {
                discountAmount = (discountBase * appliedCoupon.valor_desconto) / 100;
            } else { // 'fixo'
                discountAmount = appliedCoupon.valor_desconto;
            }

            // Garante que o desconto não seja maior que a base de cálculo
            if (discountAmount > discountBase) {
                discountAmount = discountBase;
            }

            cupomCodeDisplay.textContent = appliedCoupon.codigo;
            discountValueSpan.textContent = `- R$ ${discountAmount.toFixed(2)}`;
            discountDisplay.classList.remove('d-none');
        } else {
            discountDisplay.classList.add('d-none');
        }

        const taxaEntrega = parseFloat(taxaEntregaInput.value) || 0;
        const totalGeral = subtotal - discountAmount + taxaEntrega;

        cartSubtotalSpan.textContent = `R$ ${subtotal.toFixed(2)}`;
        cartTotalSpan.textContent = `R$ ${totalGeral.toFixed(2)}`;
        finalizeSaleBtn.disabled = cart.length === 0;
    }
    // ==============================================================

    async function applyCoupon() {
        const code = cupomInput.value;
        if (!code) { alert('Por favor, insira um código de cupom.'); return; }
        if (cart.length === 0) { alert('Adicione produtos ao carrinho antes de aplicar um cupom.'); return; }

        try {
            const response = await fetch(`${API_URL}/api/cupons/validar/${code}`, { headers: { 'x-access-token': token } });
            const result = await response.json();
            if (!response.ok) throw new Error(result.erro || 'Erro ao validar cupom.');
            appliedCoupon = result;
            cupomInput.disabled = true;
            applyCupomBtn.disabled = true;
            updateTotals();
        } catch (error) {
            alert(error.message);
            appliedCoupon = null;
            updateTotals();
        }
    }

    function removeCoupon() {
        appliedCoupon = null;
        cupomInput.value = '';
        cupomInput.disabled = false;
        applyCupomBtn.disabled = false;
        updateTotals();
    }

    async function finalizeSale() {
        if (cart.length === 0) { alert('O carrinho está vazio!'); return; }
        
        // A lógica de cálculo foi movida para o backend para segurança.
        // O frontend envia os dados brutos.
        const saleData = {
            itens: cart.map(item => ({ id_produto: item.id, quantidade: item.quantidade })),
            forma_pagamento: paymentMethodSelect.value,
            id_cliente: selectedClientId.value || null,
            taxa_entrega: parseFloat(taxaEntregaInput.value) || 0,
            cupom_utilizado: appliedCoupon ? appliedCoupon.codigo : null,
            parcelas: paymentMethodSelect.value === 'Cartão de Crédito' ? parseInt(installmentsInput.value) : 1
            // Não enviamos mais total_venda nem valor_desconto. O backend calcula.
        };

        try {
            const response = await fetch(`${API_URL}/api/vendas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(saleData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.erro || 'Erro desconhecido ao finalizar a venda.');
            
            await showReceipt(result.id_venda);
            
            lastItemPreview.style.display = 'none';
            cart = [];
            taxaEntregaInput.value = 0;
            removeClient();
            removeCoupon();
            paymentMethodSelect.value = 'Dinheiro';
            installmentsWrapper.classList.add('d-none');
            installmentsInput.value = 1;
            renderCart();
            fetchAllProducts();
            searchInput.value = '';
            searchResults.innerHTML = '';
        } catch (error) {
            console.error('Erro ao finalizar venda:', error);
            alert(`Erro: ${error.message}`);
        }
    }

    function renderClientSearchResults(query) {
        clientSearchResults.innerHTML = '';
        if (!query || query.length < 2) return;
        const filtered = allClients.filter(c => c.nome.toLowerCase().includes(query.toLowerCase()) || (c.cpf && c.cpf.includes(query)));
        if (filtered.length === 0) {
            clientSearchResults.innerHTML = '<div class="list-group-item text-muted">Nenhum cliente encontrado.</div>';
            return;
        }
        filtered.slice(0, 5).forEach(c => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action';
            item.textContent = `${c.nome} ${c.cpf ? `(${c.cpf})` : ''}`;
            item.dataset.clientId = c.id;
            clientSearchResults.appendChild(item);
        });
    }

    function selectClient(clientId) {
        const client = allClients.find(c => c.id === clientId);
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
                const itemSubtotal = item.quantidade * item.preco_unitario;
                row.innerHTML = `<td>${item.produto_nome}</td><td>${item.quantidade}</td><td>R$ ${item.preco_unitario.toFixed(2)}</td><td>R$ ${itemSubtotal.toFixed(2)}</td>`;
                subtotalProdutos += itemSubtotal;
            });
            document.getElementById('receiptSubtotal').textContent = `R$ ${subtotalProdutos.toFixed(2)}`;
            
            const receiptDiscountRow = document.getElementById('receiptDiscountRow');
            if(data.valor_desconto > 0) {
                document.getElementById('receiptCupomCode').textContent = data.cupom_utilizado;
                document.getElementById('receiptDiscountValue').textContent = `- R$ ${data.valor_desconto.toFixed(2)}`;
                receiptDiscountRow.classList.remove('d-none');
            } else {
                receiptDiscountRow.classList.add('d-none');
            }

            document.getElementById('receiptTaxaEntrega').textContent = `R$ ${data.taxa_entrega.toFixed(2)}`;
            document.getElementById('receiptTotalGeral').textContent = `R$ ${data.total_venda.toFixed(2)}`;

            let pagamentoStr = data.forma_pagamento;
            if (data.forma_pagamento === 'Cartão de Crédito' && data.parcelas > 1) {
                pagamentoStr += ` (${data.parcelas}x)`;
            }
            document.getElementById('receiptFormaPagamento').textContent = pagamentoStr;
            
            receiptModal.show();
        } catch (error) { console.error('Erro ao mostrar o recibo:', error); alert(error.message); }
    }

    // --- EVENT LISTENERS ---
    searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
    searchResults.addEventListener('click', (e) => { e.preventDefault(); const item = e.target.closest('[data-product-id]'); if(item) { addToCart(parseInt(item.dataset.productId)); searchInput.value=''; searchResults.innerHTML=''; } });
    
    cartItemsDiv.addEventListener('click', (e) => { const target = e.target; const id = parseInt(target.dataset.id); if(!id) return; if(target.classList.contains('adjust-qty-btn')) { const item = cart.find(i=>i.id===id); const stockProduct = allProducts.find(p=>p.id===id); if(target.dataset.action==='increase' && item.quantidade < stockProduct.quantidade) item.quantidade++; else if(target.dataset.action==='decrease' && item.quantidade > 0) item.quantidade--; if(item.quantidade===0) cart=cart.filter(i=>i.id!==id); renderCart(); } else if(target.classList.contains('remove-item-btn')) { cart=cart.filter(i=>i.id!==id); renderCart(); } });
    taxaEntregaInput.addEventListener('input', updateTotals);

    applyCupomBtn.addEventListener('click', applyCoupon);
    removeCupomBtn.addEventListener('click', removeCoupon);

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const scannedSKU = searchInput.value.trim();
            if (scannedSKU === '') return;
            const matchedProduct = allProducts.find(p => p.sku.toLowerCase() === scannedSKU.toLowerCase());
            if (matchedProduct) {
                addToCart(matchedProduct.id);
                searchInput.value = '';
                searchResults.innerHTML = '';
            } else {
                alert(`Produto com código de barras "${scannedSKU}" não encontrado.`);
                searchInput.select();
            }
        }
    });

    paymentMethodSelect.addEventListener('change', () => {
        if (paymentMethodSelect.value === 'Cartão de Crédito') {
            installmentsWrapper.classList.remove('d-none');
        } else {
            installmentsWrapper.classList.add('d-none');
            installmentsInput.value = 1;
        }
    });
    
    clientSearchInput.addEventListener('input', () => renderClientSearchResults(clientSearchInput.value));
    clientSearchResults.addEventListener('click', (e) => { e.preventDefault(); if(e.target.dataset.clientId) selectClient(parseInt(e.target.dataset.clientId)); });
    removeClientBtn.addEventListener('click', removeClient);
    document.getElementById('quickAddClientBtn').addEventListener('click', () => { quickClientForm.reset(); quickClientModal.show(); });
    quickClientForm.addEventListener('submit', async (e) => { e.preventDefault(); const data = { nome: document.getElementById('quickClientNome').value, telefone: document.getElementById('quickClientTelefone').value, cpf: document.getElementById('quickClientCpf').value }; try { const response = await fetch(`${API_URL}/api/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-token': token }, body: JSON.stringify(data) }); const newClient = await response.json(); if(response.ok) { quickClientModal.hide(); await fetchAllClients(); selectClient(newClient.id); } else { alert(`Erro: ${newClient.message || newClient.erro}`); } } catch (error) { console.error(error); } });
    finalizeSaleBtn.addEventListener('click', finalizeSale);
    document.getElementById('logoutButton').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });

    // --- INICIALIZAÇÃO ---
    fetchAllProducts();
    fetchAllClients();
});

function printReceipt() { window.print(); }

// Inicia a atualização automática a cada 20 segundos
setInterval(fetchAllProducts, 20000);