// Store Logic

// Escapa texto de origem externa (nome/comentário de avaliação, digitado por qualquer cliente)
// antes de interpolar em innerHTML - sem isso, um comentário malicioso roda no navegador de
// QUALQUER visitante que abrir a página do produto (XSS armazenado com alcance público).
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Formata valores monetários no padrão brasileiro (vírgula decimal, ponto de milhar)
function formatBRL(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Parcelamento nos cards de produto: a taxa de juros do Mercado Pago é sempre a mesma
// porcentagem independente do valor (confirmado comparando R$100 e R$200 - o "total" escala
// linear), então uma única consulta à API já basta pra estimar o parcelamento de qualquer
// produto na página, sem precisar de uma chamada por card (evita N chamadas numa grade de
// 20-50 produtos).
let _parcelamentoInfoPromise = null;

function obterParcelamentoInfo() {
    if (!_parcelamentoInfoPromise) {
        _parcelamentoInfoPromise = fetch('/api/public/parcelamento?valor=100')
            .then(res => res.json())
            .then(data => {
                const opcoes = data.opcoes || [];
                if (opcoes.length === 0) return null;
                const melhor = opcoes[opcoes.length - 1];
                return { parcelas: melhor.parcelas, multiplicador: melhor.total / 100 };
            })
            .catch(() => null);
    }
    return _parcelamentoInfoPromise;
}

function formatarParcelasProduto(preco, infoParcelamento) {
    if (!infoParcelamento || !preco) return '';
    const totalEstimado = preco * infoParcelamento.multiplicador;
    const valorParcela = totalEstimado / infoParcelamento.parcelas;
    return `até ${infoParcelamento.parcelas}x de R$ ${formatBRL(valorParcela)}`;
}

// Card de produto minimalista compartilhado (foto em foco, texto discreto embaixo) - usado na
// home, listagem, relacionados e sugestões do carrinho, pra manter o mesmo visual em todo
// lugar sem duplicar a marcação em cada arquivo.
function renderProdutoCardMinimal(p, infoParcelamento) {
    let priceDisplay = `R$ ${formatBRL(p.preco_venda)}`;
    if (p.max_price && p.max_price > p.preco_venda) {
        priceDisplay = `A partir de R$ ${formatBRL(p.preco_venda)}`;
    }

    const img = p.imagem_url ? `/uploads/${p.imagem_url}` : 'https://via.placeholder.com/400x520?text=Sem+Imagem';
    const parcelasTexto = formatarParcelasProduto(p.preco_venda, infoParcelamento);

    const tags = [];
    if (p.total_stock !== undefined && p.total_stock > 0 && p.total_stock <= 5) {
        tags.push(`<span class="product-card-tag product-card-tag-estoque">Últimas ${p.total_stock} unid.</span>`);
    }
    if (p.is_best_seller) {
        tags.push(`<span class="product-card-tag"><i class="fa-solid fa-fire me-1"></i>Mais vendido</span>`);
    }

    return `
        <a href="/store/produto/${p.id}" class="product-card-minimal text-decoration-none">
            <div class="product-card-minimal-img">
                ${tags.length ? `<div class="product-card-tags">${tags.join('')}</div>` : ''}
                <img src="${img}" alt="${p.nome}" loading="lazy">
            </div>
            <div class="product-card-minimal-info">
                <div class="product-card-minimal-nome" title="${p.nome}">${p.nome}</div>
                <div class="product-card-minimal-preco">${priceDisplay}</div>
                ${parcelasTexto ? `<div class="product-card-minimal-parcelas">${parcelasTexto}</div>` : ''}
            </div>
        </a>
    `;
}

// Wrapper seguro pro Meta Pixel: nao quebra a pagina se o fbq nao carregou (ex: bloqueador
// de anuncios/tracker no navegador do cliente). Alem de disparar pro Pixel, espelha o evento
// no nosso backend (exceto Purchase, que o servidor ja registra com mais autoridade via
// webhook do Mercado Pago) pra alimentar o Gerenciador de Eventos do painel admin.
const TIPOS_EVENTO_ESPELHADOS_NO_BACKEND = ['ViewContent', 'AddToCart', 'Search', 'InitiateCheckout'];

function fbqTrack(evento, params, opcoes) {
    params = params || {};
    try {
        if (typeof fbq === 'function') fbq('track', evento, params, opcoes || {});
    } catch (e) {
        console.error('Erro ao disparar evento do Pixel:', e);
    }

    if (TIPOS_EVENTO_ESPELHADOS_NO_BACKEND.includes(evento)) {
        try {
            fetch('/api/public/track-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify({
                    tipo: evento,
                    valor: params.value,
                    id_produto: params.content_ids ? params.content_ids[0] : undefined,
                    detalhe: params.content_name || params.search_string
                })
            }).catch(() => {});
        } catch (e) {
            // Nunca deve travar a navegacao do cliente por causa disso
        }
    }
}

let cart = JSON.parse(localStorage.getItem('fp_fitness_cart')) || [];
let currentCoupon = null; // Store applied coupon
let clienteRecompensaAvaliacaoCheckout = null; // Desconto automático de "primeira avaliação" do cliente logado

function updateCartCount() {
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    // Update all badges (mobile and desktop)
    const badges = document.querySelectorAll('.cart-count-badge');
    badges.forEach(badge => badge.textContent = count);
}

function addToCart(productId, nome, price, image, stock = 999) {
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        if (existingItem.quantity + 1 > stock) {
            Swal.fire({ icon: 'warning', title: 'Estoque Insuficiente', text: `O estoque máximo é ${stock}.`, toast: true, position: 'top-end', background: '#1e1e1e', color: '#fff' });
            return;
        }
        existingItem.quantity += 1;
    } else {
        if (1 > stock) {
            Swal.fire({ icon: 'warning', title: 'Estoque Esgotado', text: `Produto sem estoque.`, toast: true, position: 'top-end', background: '#1e1e1e', color: '#fff' });
            return;
        }
        cart.push({ id: productId, nome: nome, price: price, image: image, quantity: 1, max_stock: stock });
    }

    localStorage.setItem('fp_fitness_cart', JSON.stringify(cart));
    updateCartCount();
    fbqTrack('AddToCart', {
        content_ids: [String(productId)],
        content_type: 'product',
        content_name: nome,
        value: price,
        currency: 'BRL'
    });

    Swal.fire({
        icon: 'success',
        title: 'Produto Adicionado!',
        text: 'Indo para o carrinho...',
        timer: 800,
        showConfirmButton: false,
        background: '#1e1e1e',
        color: '#fff'
    }).then(() => {
        window.location.href = '/store/carrinho';
    });
}

// Desconto de frete por valor minimo: carregado uma vez de /api/store/config (mesma fonte
// usada pelo backend) e cacheado, pra nao precisar hardcodar o valor no front.
let freteDescontoConfig = null;

async function carregarFreteDescontoConfig() {
    if (freteDescontoConfig) return freteDescontoConfig;
    try {
        const res = await fetch('/api/store/config');
        const data = await res.json();
        freteDescontoConfig = data.desconto_frete || null;
    } catch (e) {
        freteDescontoConfig = null;
    }
    return freteDescontoConfig;
}

function renderFreteDescontoNudge(elementId, subtotal) {
    const el = document.getElementById(elementId);
    if (!el || !freteDescontoConfig) return;

    const { valor_minimo, valor_desconto } = freteDescontoConfig;
    el.classList.remove('d-none');

    if (subtotal >= valor_minimo) {
        el.innerHTML = `
            <div class="alert alert-success bg-success bg-opacity-10 border-success text-success small mb-0 py-2">
                <i class="fa-solid fa-circle-check me-2"></i>Você ganhou <strong>R$ ${formatBRL(valor_desconto)}</strong> de desconto no frete!
            </div>`;
    } else {
        const faltam = valor_minimo - subtotal;
        const pct = Math.min(100, Math.round((subtotal / valor_minimo) * 100));
        el.innerHTML = `
            <div class="small text-warning mb-1">
                <i class="fa-solid fa-truck-fast me-1"></i>Faltam <strong>R$ ${formatBRL(faltam)}</strong> para ganhar R$ ${formatBRL(valor_desconto)} de desconto no frete!
            </div>
            <div class="progress" style="height: 6px; background-color: rgba(255,255,255,0.1);">
                <div class="progress-bar bg-warning" style="width: ${pct}%;"></div>
            </div>`;
    }
}

function renderCartPage() {
    const container = document.getElementById('cartItemsContainer');
    const emptyMsg = document.getElementById('emptyCartMessage');
    const table = document.getElementById('cartTable');
    const subtotalEl = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');
    const nudgeEl = document.getElementById('freteDescontoNudgeCart');

    if (!container) return; // Not on cart page

    if (cart.length === 0) {
        table.classList.add('d-none');
        emptyMsg.classList.remove('d-none');
        if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        if (nudgeEl) nudgeEl.classList.add('d-none');
        const suggestionsSection = document.getElementById('cartSuggestionsSection');
        if (suggestionsSection) suggestionsSection.style.display = 'none';
        return;
    }

    table.classList.remove('d-none');
    emptyMsg.classList.add('d-none');

    let total = 0;
    container.innerHTML = cart.map(item => {
        const price = parseFloat(item.price) || 0;
        const quantity = parseInt(item.quantity) || 1;
        const subtotal = price * quantity;
        total += subtotal;
        return `
            <tr class="align-middle border-bottom border-light">
                <td class="py-4">
                    <div class="d-flex align-items-center">
                        <a href="/store/produto/${item.id}" class="d-block overflow-hidden rounded-3 shadow-sm me-3 hover-zoom-container" style="width: 70px; height: 70px;">
                            <img src="${item.image ? '/uploads/' + item.image : 'https://via.placeholder.com/50'}" alt="${item.nome || 'Produto'}" class="w-100 h-100 transition-scale" style="object-fit: cover;">
                        </a>
                        <div>
                            <h6 class="mb-1 fw-bold" style="font-family: 'Outfit', sans-serif;">
                                <a href="/store/produto/${item.id}" class="text-dark text-decoration-none hover-warning transition-color">${item.nome || 'Produto sem nome'}</a>
                            </h6>
                            ${item.size ? `<small class="text-muted fw-semibold">Tamanho: ${item.size}</small>` : ''}
                        </div>
                    </div>
                </td>
                <td class="text-dark fw-semibold">R$ ${formatBRL(price)}</td>
                <td>
                    <div class="input-group input-group-sm rounded-pill border overflow-hidden" style="width: 110px; background-color: #f8f9fa;">
                        <button class="btn btn-light border-0 text-dark fw-bold px-3" onclick="updateQuantity(${item.id}, -1)">-</button>
                        <input type="text" class="form-control text-center bg-transparent border-0 text-dark fw-bold p-0" value="${quantity}" readonly>
                        <button class="btn btn-light border-0 text-dark fw-bold px-3" onclick="updateQuantity(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td class="text-dark fw-bold h6 mb-0">R$ ${formatBRL(subtotal)}</td>
                <td class="text-end">
                    <button class="btn btn-link text-muted p-0 transition-scale" onclick="removeFromCart(${item.id})" onmouseover="this.classList.remove('text-muted'); this.classList.add('text-danger');" onmouseout="this.classList.remove('text-danger'); this.classList.add('text-muted');">
                        <i class="fa-regular fa-trash-can fs-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `R$ ${formatBRL(total)}`;
    if (totalEl) totalEl.textContent = `R$ ${formatBRL(total)}`;

    carregarFreteDescontoConfig().then(() => renderFreteDescontoNudge('freteDescontoNudgeCart', total));
    loadCartSuggestions();
}

async function loadCartSuggestions() {
    const section = document.getElementById('cartSuggestionsSection');
    const container = document.getElementById('cartSuggestionsContainer');
    if (!section || !container) return;

    try {
        const [res, infoParcelamento] = await Promise.all([
            fetch('/api/store/products?per_page=8&sort=mais_vendidos'),
            obterParcelamentoInfo()
        ]);
        if (!res.ok) return;
        const data = await res.json();

        const idsNoCarrinho = new Set(cart.map(item => item.id));
        const sugestoes = (data.produtos || []).filter(p => !idsNoCarrinho.has(p.id)).slice(0, 4);
        if (sugestoes.length === 0) {
            section.style.display = 'none';
            return;
        }

        container.innerHTML = sugestoes.map(p => `
            <div class="col-6 col-md-3">
                ${renderProdutoCardMinimal(p, infoParcelamento)}
            </div>
        `).join('');

        section.style.display = '';
    } catch (e) {
        console.error('Erro ao carregar sugestões do carrinho:', e);
    }
}

function updateQuantity(id, change) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(id);
            return;
        }
        localStorage.setItem('fp_fitness_cart', JSON.stringify(cart));
        updateCartCount();
        renderCartPage();
    }
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    localStorage.setItem('fp_fitness_cart', JSON.stringify(cart));
    updateCartCount();
    renderCartPage();
}

function proceedToCheckout() {
    if (cart.length === 0) {
        Swal.fire('Carrinho Vazio', 'Adicione produtos antes de finalizar.', 'warning');
        return;
    }
    window.location.href = '/store/checkout';
}

// --- COUPON LOGIC ---
async function applyCoupon() {
    const codeInput = document.getElementById('cupomInput');
    const messageDiv = document.getElementById('cupomMessage');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        messageDiv.textContent = 'Digite um código.';
        messageDiv.className = 'form-text mt-1 text-danger';
        return;
    }

    // Capture CPF for validation context
    const cpfInput = document.getElementById('cpf');
    const cpf = cpfInput ? cpfInput.value.replace(/\D/g, '') : '';

    try {
        // Use query param for CPF if available
        // Don't send token to avoid potential 401s if token is invalid/expired during this public check
        // Changed to /api/public to avoid any path-based middleware issues
        const url = `/api/public/cupons/validar/${code}?cpf=${cpf}`;

        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            currentCoupon = data;
            messageDiv.textContent = `Cupom ${data.codigo} aplicado!`;
            messageDiv.className = 'form-text mt-1 text-success';
            document.getElementById('btnAplicarCupom').classList.add('d-none');
            document.getElementById('btnRemoverCupom').classList.remove('d-none');
            document.getElementById('cupomInput').disabled = true;
            renderCheckoutPage(); // Re-render to show discount
        } else {
            currentCoupon = null;
            messageDiv.textContent = data.erro || 'Cupom inválido.';
            messageDiv.className = 'form-text mt-1 text-danger';
            renderCheckoutPage();
        }
    } catch (error) {
        console.error('Erro ao validar cupom:', error);
        messageDiv.textContent = 'Erro ao validar cupom.';
        messageDiv.className = 'form-text mt-1 text-danger';
    }
}

function removeCoupon() {
    currentCoupon = null;
    const codeInput = document.getElementById('cupomInput');
    const messageDiv = document.getElementById('cupomMessage');
    
    codeInput.value = '';
    codeInput.disabled = false;
    messageDiv.textContent = '';
    
    document.getElementById('btnAplicarCupom').classList.remove('d-none');
    document.getElementById('btnRemoverCupom').classList.add('d-none');
    
    renderCheckoutPage();
}

let initiateCheckoutTracked = false;

function renderCheckoutPage() {
    const container = document.getElementById('checkoutItems');
    const subtotalEl = document.getElementById('checkoutSubtotal');
    const totalEl = document.getElementById('checkoutTotal');
    const discountRow = document.getElementById('discountRow');
    const discountEl = document.getElementById('checkoutDiscount');

    if (!container) return; // Not on checkout page

    if (cart.length === 0) {
        window.location.href = '/store/produtos';
        return;
    }

    let subtotal = 0;
    container.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        return `
            <li class="list-group-item bg-transparent text-white d-flex justify-content-between lh-sm border-bottom border-secondary border-opacity-50 align-items-center py-3">
                <div class="d-flex align-items-center">
                    <img src="${item.image ? '/uploads/' + item.image : 'https://via.placeholder.com/40'}" 
                         alt="${item.nome}" 
                         class="rounded-3 shadow-sm me-3 object-fit-cover" 
                         style="width: 50px; height: 50px;">
                    <div>
                        <h6 class="my-0 fw-bold text-white" style="font-size: 0.95rem; font-family: 'Outfit', sans-serif;">${item.nome || 'Produto'}</h6>
                        <small class="text-light text-opacity-75" style="font-size: 0.8rem;">Qtd: ${item.quantity} ${item.size ? ' | Tam: ' + item.size : ''}</small>
                    </div>
                </div>
                <span class="text-warning fw-bold" style="font-size: 1rem;">R$ ${formatBRL(itemTotal)}</span>
            </li>
        `;
    }).join('');

    // Calculate Discount
    let discount = 0;
    if (currentCoupon) {
        if (currentCoupon.aplicacao === 'total') {
            if (currentCoupon.tipo_desconto === 'percentual') {
                discount = subtotal * (currentCoupon.valor_desconto / 100);
            } else {
                discount = parseFloat(currentCoupon.valor_desconto);
            }
        } else if (currentCoupon.aplicacao === 'produto_especifico') {
            // Logic for specific products
            // Assuming currentCoupon.produtos_validos_ids is available (backend needs to send this)
            // If backend doesn't send it in 'validar', we might need to adjust.
            // For now, let's assume 'validar' returns 'produtos_validos_ids' if applicable.
            // Or simpler: just apply to total for now as per previous logic, or check if we have IDs.
            // The backend 'validar_cupom_loja' returns cupom.to_dict().
            // Let's check if to_dict includes relations. Usually it doesn't unless specified.
            // If not, we might need to fetch them.
            // BUT, for simplicity and robustness, let's apply to total if 'aplicacao' is total,
            // and maybe just warn/skip if specific (or implement if data is there).
            // Let's assume 'total' for the main use case (First Purchase/Review).
        }
    }

    // Recompensa automática de primeira avaliação: aplicada por cima do cupom manual, sobre o
    // que sobrar do subtotal.
    if (clienteRecompensaAvaliacaoCheckout) {
        const restante = subtotal - discount;
        if (clienteRecompensaAvaliacaoCheckout.tipo === 'percentual') {
            discount += restante * (clienteRecompensaAvaliacaoCheckout.percentual / 100);
        } else {
            discount += Math.min(clienteRecompensaAvaliacaoCheckout.percentual, restante);
        }
    }

    // Ensure discount doesn't exceed subtotal
    if (discount > subtotal) discount = subtotal;

    // Expõe o valor numérico (não formatado) para outras funções (ex: recalculateTotal
    // ao trocar o frete) usarem diretamente, em vez de tentar reler o texto já formatado da tela
    window.currentDiscountValue = discount;

    const total = subtotal - discount;

    if (subtotalEl) subtotalEl.textContent = `R$ ${formatBRL(subtotal)}`;

    if (discount > 0) {
        discountRow.classList.remove('d-none');
        discountEl.textContent = `- R$ ${formatBRL(discount)}`;
    } else {
        discountRow.classList.add('d-none');
    }

    if (totalEl) totalEl.textContent = `R$ ${formatBRL(total)}`;

    // So dispara uma vez por carregamento da pagina (a funcao roda de novo a cada
    // cupom/frete recalculado, o que nao deve gerar eventos duplicados de funil).
    if (!initiateCheckoutTracked) {
        initiateCheckoutTracked = true;
        fbqTrack('InitiateCheckout', {
            content_ids: cart.map(item => String(item.id)),
            content_type: 'product',
            num_items: cart.reduce((acc, item) => acc + item.quantity, 0),
            value: total,
            currency: 'BRL'
        });
    }
}


// Helper to perform the actual checkout API call
async function performCheckout(payload) {
    try {
        Swal.fire({
            title: 'Processando...',
            text: 'Aguarde enquanto finalizamos seu pedido.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['x-client-token'] = token;

        const response = await fetch('/api/store/checkout', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            cart = [];
            localStorage.removeItem('fp_fitness_cart');
            updateCartCount();

            // Fetch Suggestions
            let suggestionsHtml = '';
            // Ignorado no checkout pro para ser rápido, mas pode ser adicionado
            
            if (result.init_point) {
                window.location.href = result.init_point;
            } else {
                Swal.fire({
                    icon: 'success',
                    title: 'Obrigado!',
                    text: 'Pedido recebido com sucesso!',
                    confirmButtonText: 'Ver meus pedidos'
                }).then(() => {
                    window.location.href = '/store/conta';
                });
            }
        } else {
            throw new Error(result.erro || 'Erro ao processar pedido.');
        }
    } catch (error) {
        console.error('Erro no checkout:', error);
        Swal.fire('Erro', error.message, 'error');
    }
}

async function submitOrder() {
    const termsCheckbox = document.getElementById('termsCheckbox');
    if (termsCheckbox && !termsCheckbox.checked) {
        Swal.fire({
            icon: 'warning',
            title: 'Termos de Uso',
            text: 'Para prosseguir com o pagamento, você deve ler e concordar com os Termos de Uso e Políticas da loja.'
        });
        return;
    }

    const form = document.getElementById('checkoutForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const cpfInput = document.getElementById('cpf');
    if (!validateCPF(cpfInput.value)) {
        Swal.fire('CPF Inválido', 'Por favor, digite um CPF válido.', 'error');
        cpfInput.focus();
        return;
    }

    const clienteData = {
        nome: document.getElementById('nome').value,
        email: document.getElementById('email').value,
        cpf: document.getElementById('cpf').value,
        telefone: document.getElementById('telefone').value,
        endereco: {
            rua: document.getElementById('rua').value,
            numero: document.getElementById('numero').value,
            bairro: document.getElementById('bairro').value,
            cidade: document.getElementById('cidade').value,
            estado: document.getElementById('estado').value,
            cep: document.getElementById('cep').value
        }
    };

    const itens = cart.map(item => ({
        id_produto: item.id,
        quantidade: item.quantity
    }));

    // Capture Delivery Type and Cost
    const selectedShipping = document.querySelector('input[name="shippingOption"]:checked');
    let tipoEntrega = 'Motoboy'; // Default fallback
    let transportadora = null;
    let taxaEntrega = 0;
    let servicoFrete = null; // ID técnico da opção (retirada, motoboy ou me_<id> do Melhor Envio)

    if (selectedShipping) {
        const name = selectedShipping.dataset.name || '';
        const nameLower = name.toLowerCase();
        servicoFrete = selectedShipping.dataset.optionId || null;

        if (nameLower.includes('retirada')) {
            tipoEntrega = 'Retirada';
            transportadora = 'Retirada na Loja';
        } else if (nameLower.includes('sedex')) {
            tipoEntrega = 'Correios';
            transportadora = 'SEDEX';
        } else if (nameLower.includes('pac')) {
            tipoEntrega = 'Correios';
            transportadora = 'PAC';
        } else if (nameLower.includes('motoboy') || nameLower.includes('entrega local')) {
            tipoEntrega = 'Motoboy';
            transportadora = 'Motoboy Próprio';
        } else {
            // Fallback for external carriers like Jadlog, Azul, etc.
            tipoEntrega = 'Transportadora';
            transportadora = name; // Use the exact name from the option
        }

        taxaEntrega = parseFloat(selectedShipping.value) || window.shippingCost || 0;
    }

    const payload = {
        cliente: clienteData,
        itens,
        cupom_id: currentCoupon ? currentCoupon.id : null,
        salvar_endereco: document.getElementById('salvarEndereco') ? document.getElementById('salvarEndereco').checked : false,
        tipo_entrega: tipoEntrega,
        transportadora: transportadora,
        taxa_entrega: taxaEntrega,
        servico_frete: servicoFrete,
        termos_aceitos: document.getElementById('termsCheckbox') ? document.getElementById('termsCheckbox').checked : true,
        // Device ID do Mercado Pago (script security.js): ajuda o antifraude deles a diferenciar
        // cliente legítimo de fraude, reduzindo rejeições por falso positivo.
        device_id: window.MP_DEVICE_SESSION_ID || null
    };

    // --- FORCED REGISTRATION FLOW ---
    const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');

    // If logged in, proceed directly
    if (token) {
        await performCheckout(payload);
        return;
    }

    // If NOT logged in, check CPF
    try {
        Swal.fire({ title: 'Verificando cadastro...', didOpen: () => Swal.showLoading() });

        const cpfCheckRes = await fetch(`/api/client/check-cpf/${clienteData.cpf}`);
        const cpfCheckData = await cpfCheckRes.json();

        Swal.close();

        if (cpfCheckData.exists) {
            Swal.fire({
                icon: 'info',
                title: 'CPF já cadastrado',
                text: 'Você já possui conta conosco. Faça login para continuar.',
                showCancelButton: true,
                confirmButtonText: 'Fazer Login',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Redirect to login or open login modal
                    // For now, redirect, but maybe we can keep data?
                    // Better: save data to localstorage to restore?
                    // checkout.html already has auto-fill from user data, but maybe we want to keep current form?
                    // It's safer to just redirect to login page for now.
                    window.location.href = '/store/login?redirect=/store/checkout';
                }
            });
            return;
        } else {
            // NEW CLIENT: Force Password Creation
            const { value: password } = await Swal.fire({
                title: 'Finalize seu Cadastro',
                html: 'Você é novo por aqui! Crie uma senha para acompanhar seu pedido.<br><small class="text-muted"><i class="fa-solid fa-circle-info me-1"></i>Mínimo 6 caracteres (letras e números).</small>',
                input: 'password',
                inputLabel: 'Crie uma Senha',
                inputPlaceholder: 'Mínimo 6 caracteres',
                inputAttributes: {
                    minlength: 6,
                    autocapitalize: 'off',
                    autocorrect: 'off'
                },
                showCancelButton: true,
                confirmButtonText: 'Criar Conta e Finalizar',
                cancelButtonText: 'Cancelar',
                inputValidator: (value) => {
                    if (!value || value.length < 6) {
                        return 'A senha deve ter pelo menos 6 caracteres!';
                    }
                    if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
                        return 'A senha deve conter letras e números!';
                    }
                }
            });

            if (password) {
                // Register User
                Swal.fire({ title: 'Criando conta...', didOpen: () => Swal.showLoading() });

                const registerPayload = {
                    nome: clienteData.nome,
                    email: clienteData.email,
                    cpf: clienteData.cpf,
                    telefone: clienteData.telefone,
                    senha: password
                };

                const regRes = await fetch('/api/client/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(registerPayload)
                });
                const regData = await regRes.json();

                if (regRes.ok) {
                    // Login successful, save token
                    localStorage.setItem('clientToken', regData.token);
                    localStorage.setItem('clientUser', JSON.stringify(regData.cliente));

                    // Update Auth UI logic immediately if needed, but we proceed to checkout
                    // Now proceed to checkout with the new token context (though we passed data manually)
                    // We must ensure the checkout endpoint knows this is an authenticated user effectively?
                    // Authorization header will be added by performCheckout if we rely on localStorage.
                    // We just set localStorage, so performCheckout will pick it up.

                    await performCheckout(payload);

                } else {
                    Swal.fire('Erro no Cadastro', regData.erro || 'Não foi possível criar sua conta.', 'error');
                }
            }
        }

    } catch (e) {
        console.error('Erro na verificação de cadastro:', e);
        Swal.fire('Erro', 'Não foi possível verificar seu cadastro. Tente novamente.', 'error');
    }
}

// A barra fixa do topo (promoção + navbar) não tem altura fixa de verdade - varia com o
// conteúdo da promoção, se o logo quebra linha em telas menores, fonte carregando etc. Um
// valor de margem chutado no HTML (era 144px fixo) fica sempre um pouco errado, deixando uma
// faixa do conteúdo escondida atrás da barra ou um vão em branco. Mede a altura real e ajusta
// o espaço reservado pro conteúdo (e pro topo do painel de busca) toda vez que algo pode ter
// mudado essa altura.
function ajustarOffsetBarraFixa() {
    const barra = document.querySelector('.store-top-fixed');
    const main = document.querySelector('main');
    const searchBar = document.querySelector('.store-search-bar');
    if (!barra) return;
    const altura = barra.offsetHeight;
    if (main) main.style.marginTop = `${altura}px`;
    if (searchBar) searchBar.style.top = `${altura}px`;
}

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    updateAuthUI();
    initStoreSearchBar();
    ajustarOffsetBarraFixa();
    initStoreMarquee().then(ajustarOffsetBarraFixa);
    initNavCategorias();
    if (window.location.pathname.includes('/checkout')) {
        autoFillCheckout();
    }
});

window.addEventListener('load', ajustarOffsetBarraFixa);
let ajusteOffsetResizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(ajusteOffsetResizeTimeout);
    ajusteOffsetResizeTimeout = setTimeout(ajustarOffsetBarraFixa, 150);
});

// Barra de promoções rolando no topo: sempre com dados reais (frete/parcelamento), nunca
// hardcoded - se a Michele mudar o valor minimo do frete ou a conta mudar o parcelamento, o
// texto acompanha sozinho.
async function initStoreMarquee() {
    const track = document.getElementById('storeMarqueeTrack');
    if (!track) return;

    const itens = [];
    try {
        const res = await fetch('/api/store/config');
        const config = await res.json();
        if (config.desconto_frete) {
            itens.push(`Desconto no frete em compras acima de R$ ${formatBRL(config.desconto_frete.valor_minimo)}`);
        }
        if (config.primeira_compra && config.primeira_compra.ativo && config.primeira_compra.codigo) {
            itens.push(`${config.primeira_compra.percent}% OFF na primeira compra com o cupom ${config.primeira_compra.codigo}`);
        }
    } catch (e) {
        console.error('Erro ao carregar config da marquee:', e);
    }

    try {
        const resParcelas = await fetch('/api/public/parcelamento?valor=200');
        const dataParcelas = await resParcelas.json();
        const opcoes = dataParcelas.opcoes || [];
        if (opcoes.length > 0) {
            const maxParcelas = opcoes[opcoes.length - 1].parcelas;
            itens.push(`Parcelamento em até ${maxParcelas}x no cartão`);
        }
    } catch (e) {
        console.error('Erro ao carregar parcelamento da marquee:', e);
    }

    if (itens.length === 0) {
        document.getElementById('storeMarquee').style.display = 'none';
        return;
    }

    // Duplica a lista uma vez: a animação desloca -50% do track, então a segunda cópia
    // emenda exatamente onde a primeira termina, sem "salto" visual no loop.
    const htmlItens = itens.map(txt => `<span class="store-marquee-item">${txt}</span>`).join('');
    track.innerHTML = htmlItens + htmlItens;
}

// Dropdown "Categorias" da navbar: populado com as categorias reais de produto (mesma fonte
// que a pagina de produtos usa), nunca uma lista fixa que pode ficar desatualizada.
async function initNavCategorias() {
    const menu = document.getElementById('navCategoriasMenu');
    if (!menu) return;

    try {
        const res = await fetch('/api/store/products?per_page=1');
        const data = await res.json();
        const categorias = data.categorias || [];

        if (categorias.length === 0) {
            menu.innerHTML = '<li><span class="dropdown-item-text text-muted small">Nenhuma categoria disponível</span></li>';
            return;
        }

        menu.innerHTML =
            '<li class="mega-menu-titulo">Categorias</li>' +
            categorias.map(cat =>
                `<li><a class="dropdown-item" href="/store/produtos?categoria=${encodeURIComponent(cat)}">${escapeHtml(cat)}</a></li>`
            ).join('') +
            '<li class="mega-menu-rodape"><a class="dropdown-item" href="/store/produtos">Ver todos os produtos <i class="fa-solid fa-arrow-right-long ms-1"></i></a></li>';
    } catch (e) {
        console.error('Erro ao carregar categorias da navbar:', e);
        menu.innerHTML = '<li><span class="dropdown-item-text text-muted small">Erro ao carregar</span></li>';
    }
}

function initStoreSearchBar() {
    // Existem dois botoes de lupa (um pro layout mobile, outro pro desktop) que
    // controlam o mesmo painel de busca.
    const toggleBtns = document.querySelectorAll('.store-search-toggle');
    const searchBar = document.getElementById('storeSearchBar');
    const searchForm = document.getElementById('storeSearchForm');
    const searchInput = document.getElementById('storeSearchInput');
    const resultsBox = document.getElementById('storeSearchResults');
    if (!toggleBtns.length || !searchBar || !searchForm || !searchInput || !resultsBox) return;

    const MIN_CHARS = 2;
    let abortController = null;
    let ultimoTermoBuscado = '';
    let itemAtivoIndex = -1;

    const setExpanded = (valor) => toggleBtns.forEach(btn => btn.setAttribute('aria-expanded', valor));

    const abrirBusca = () => {
        searchBar.classList.add('show');
        setExpanded('true');
        setTimeout(() => searchInput.focus(), 150);
    };
    const fecharBusca = () => {
        searchBar.classList.remove('show');
        setExpanded('false');
        esconderResultados();
    };

    const esconderResultados = () => {
        resultsBox.classList.remove('show');
        itemAtivoIndex = -1;
    };

    const irParaResultados = (termo) => {
        fbqTrack('Search', { search_string: termo, content_type: 'product' });
        window.location.href = `/store/produtos?q=${encodeURIComponent(termo)}`;
    };

    function renderResultados(produtos, termo) {
        if (!produtos.length) {
            resultsBox.innerHTML = `<div class="store-search-results-empty">Nenhum produto encontrado para "${termo}".</div>`;
            resultsBox.classList.add('show');
            return;
        }

        const itens = produtos.map(p => {
            const preco = (Number(p.preco_venda) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const img = p.imagem_url ? `/uploads/${p.imagem_url}` : 'https://via.placeholder.com/80x80?text=%20';
            return `
                <a href="/store/produto/${p.id}" class="store-search-result-item" role="option">
                    <img src="${img}" alt="${p.nome}" loading="lazy" onerror="this.style.visibility='hidden'">
                    <div>
                        <div class="result-nome">${p.nome}</div>
                        <div class="result-preco">R$ ${preco}</div>
                    </div>
                </a>`;
        }).join('');

        resultsBox.innerHTML = itens + `
            <a href="/store/produtos?q=${encodeURIComponent(termo)}" class="store-search-results-footer">
                Ver todos os resultados para "${termo}"
            </a>`;
        resultsBox.classList.add('show');
        itemAtivoIndex = -1;
    }

    async function buscarSugestoes(termo) {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        ultimoTermoBuscado = termo;

        resultsBox.innerHTML = `<div class="store-search-results-loading"><span class="spinner-border spinner-border-sm me-2"></span>Buscando...</div>`;
        resultsBox.classList.add('show');

        try {
            const res = await fetch(`/api/store/products?q=${encodeURIComponent(termo)}&per_page=6&sort=alfabetica`, {
                signal: abortController.signal
            });
            if (!res.ok) throw new Error('Falha na busca');
            const data = await res.json();
            // Ignora resposta se o usuario ja digitou outra coisa enquanto isso carregava
            if (termo === ultimoTermoBuscado) {
                renderResultados(data.produtos || [], termo);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                resultsBox.innerHTML = `<div class="store-search-results-empty">Não foi possível buscar agora. Tente novamente.</div>`;
                resultsBox.classList.add('show');
            }
        }
    }

    const buscarComDebounce = (() => {
        let timer;
        return (termo) => {
            clearTimeout(timer);
            timer = setTimeout(() => buscarSugestoes(termo), 300);
        };
    })();

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchBar.classList.contains('show') ? fecharBusca() : abrirBusca();
        });
    });

    searchInput.addEventListener('input', () => {
        const termo = searchInput.value.trim();
        if (termo.length < MIN_CHARS) {
            esconderResultados();
            return;
        }
        buscarComDebounce(termo);
    });

    // Navegacao por teclado entre as sugestoes (setas + Enter)
    searchInput.addEventListener('keydown', (e) => {
        const itens = resultsBox.querySelectorAll('.store-search-result-item');
        if (!itens.length || !resultsBox.classList.contains('show')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            itemAtivoIndex = Math.min(itemAtivoIndex + 1, itens.length - 1);
            itens.forEach((el, i) => el.classList.toggle('active', i === itemAtivoIndex));
            itens[itemAtivoIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            itemAtivoIndex = Math.max(itemAtivoIndex - 1, 0);
            itens.forEach((el, i) => el.classList.toggle('active', i === itemAtivoIndex));
            itens[itemAtivoIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && itemAtivoIndex >= 0) {
            e.preventDefault();
            itens[itemAtivoIndex].click();
        }
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const termo = searchInput.value.trim();
        if (termo) irParaResultados(termo);
    });

    // Fecha ao clicar fora do painel (mas nao ao clicar em algum dos botoes, que já tratam isso)
    document.addEventListener('click', (e) => {
        const clicouEmToggle = Array.from(toggleBtns).some(btn => btn.contains(e.target));
        if (searchBar.classList.contains('show') && !searchBar.contains(e.target) && !clicouEmToggle) {
            fecharBusca();
        }
    });

    // Fecha com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchBar.classList.contains('show')) fecharBusca();
    });

    // Se a navbar ja abriu numa pagina de busca (?q=...), pre-preenche o campo pra
    // o usuario ver o termo atual caso reabra o painel.
    const qAtual = new URLSearchParams(window.location.search).get('q');
    if (qAtual) searchInput.value = qAtual;
}

function updateAuthUI() {
    const authContainer = document.getElementById('authButtons');
    if (!authContainer) return;

    const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');

    if (token) {
        authContainer.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-link text-dark position-relative dropdown-toggle" type="button" data-bs-toggle="dropdown" title="Minha Conta" aria-label="Minha Conta">
                    <i class="fa-regular fa-user fa-lg"></i>
                </button>
                  <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                      <li><a class="dropdown-item" href="/store/conta#profile">Meu Perfil</a></li>
                      <li><a class="dropdown-item" href="/store/conta#orders">Meus Pedidos</a></li>
                      <li><a class="dropdown-item" href="/store/conta#reviews">Minhas Avaliações</a></li>
                      <li><a class="dropdown-item" href="/store/conta#favorites">Favoritos</a></li>
                      <li><hr class="dropdown-divider"></li>
                      <li><a class="dropdown-item text-danger" href="#" onclick="logoutClient()">Sair</a></li>
                  </ul>
            </div>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="/store/login" class="btn btn-outline-warning btn-sm rounded-pill px-3">
                <i class="fa-regular fa-user me-2"></i>Login
            </a>
        `;
    }
}

function logoutClient() {
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientUser');
    sessionStorage.removeItem('clientToken');
    sessionStorage.removeItem('clientUser');
    window.location.href = '/store';
}

async function autoFillCheckout() {
    const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');
    if (!token) return;

    try {
        // Try to get fresh data first
        const res = await fetch('/api/client/me', { headers: { 'x-client-token': token } });
        if (res.ok) {
            const data = await res.json();
            // Critical Fix: Clear stale draft data if we have fresh profile data
            localStorage.removeItem('checkout_data');
            fillForm(data);

            const rewardBanner = document.getElementById('avaliacaoRewardBanner');
            if (rewardBanner && data.recompensa_avaliacao_disponivel) {
                clienteRecompensaAvaliacaoCheckout = { percentual: data.desconto_avaliacao_percentual, tipo: data.desconto_avaliacao_tipo };
                const desconto = data.desconto_avaliacao_tipo === 'percentual'
                    ? `${data.desconto_avaliacao_percentual}%`
                    : `R$ ${data.desconto_avaliacao_percentual.toFixed(2)}`;
                document.getElementById('avaliacaoRewardText').textContent =
                    `Você tem ${desconto} de desconto por avaliar sua compra — será aplicado automaticamente neste pedido!`;
                rewardBanner.classList.remove('d-none');
                if (typeof renderCheckoutPage === 'function') renderCheckoutPage();
            }
        } else {
            // Fallback to stored user data
            const storedUser = JSON.parse(localStorage.getItem('clientUser') || sessionStorage.getItem('clientUser'));
            if (storedUser) fillForm(storedUser);
        }
    } catch (e) {
        console.error('Erro ao auto-preencher checkout:', e);
    }
}

function fillForm(data) {
    if (document.getElementById('nome')) document.getElementById('nome').value = data.nome || '';
    if (document.getElementById('email')) document.getElementById('email').value = data.email || '';
    if (document.getElementById('cpf')) document.getElementById('cpf').value = data.cpf || '';
    if (document.getElementById('telefone')) document.getElementById('telefone').value = data.telefone || '';

    if (document.getElementById('rua')) document.getElementById('rua').value = data.endereco_rua || '';
    if (document.getElementById('numero')) document.getElementById('numero').value = data.endereco_numero || '';
    if (document.getElementById('bairro')) document.getElementById('bairro').value = data.endereco_bairro || '';
    if (document.getElementById('cidade')) document.getElementById('cidade').value = data.endereco_cidade || '';
    if (document.getElementById('estado')) document.getElementById('estado').value = data.endereco_estado || '';
    if (document.getElementById('cep')) {
        const cepVal = data.endereco_cep || '';
        document.getElementById('cep').value = cepVal;

        // Trigger shipping calculation if on checkout page
        if (cepVal && typeof window.calculateShipping === 'function') {
            window.calculateShipping(cepVal);
        }
    }
}

// --- CPF Validation ---
function validateCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf == '') return false;
    // Elimina CPFs invalidos conhecidos
    if (cpf.length != 11 ||
        cpf == "00000000000" ||
        cpf == "11111111111" ||
        cpf == "22222222222" ||
        cpf == "33333333333" ||
        cpf == "44444444444" ||
        cpf == "55555555555" ||
        cpf == "66666666666" ||
        cpf == "77777777777" ||
        cpf == "88888888888" ||
        cpf == "99999999999")
        return false;
    // Valida 1o digito
    let add = 0;
    for (let i = 0; i < 9; i++)
        add += parseInt(cpf.charAt(i)) * (10 - i);
    let rev = 11 - (add % 11);
    if (rev == 10 || rev == 11)
        rev = 0;
    if (rev != parseInt(cpf.charAt(9)))
        return false;
    // Valida 2o digito
    add = 0;
    for (let i = 0; i < 10; i++)
        add += parseInt(cpf.charAt(i)) * (11 - i);
    rev = 11 - (add % 11);
    if (rev == 10 || rev == 11)
        rev = 0;
    if (rev != parseInt(cpf.charAt(10)))
        return false;
    return true;
}

// --- DATA PERSISTENCE ---
function saveFormData() {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    const data = {};
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        if (input.id && input.type !== 'password') {
            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked) data[input.name || input.id] = input.value;
            } else {
                data[input.id] = input.value;
            }
        }
    });
    localStorage.setItem('checkout_data', JSON.stringify(data));
}

function restoreFormData() {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    const saved = localStorage.getItem('checkout_data');
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const input = document.getElementById(key);
            if (input) {
                input.value = data[key];
                input.dispatchEvent(new Event('input'));
            }
            if (key === 'pagamento' || key === 'payment') {
                // payment logic usually by name
                const radios = document.getElementsByName('pagamento');
                if (radios) {
                    radios.forEach(r => {
                        if (r.value === data[key]) r.checked = true;
                    });
                }
            }
        });
    } catch (e) { console.error('Error restoring data', e); }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('checkoutForm');
    if (form) {
        form.addEventListener('input', saveFormData);
        form.addEventListener('change', saveFormData);
        setTimeout(restoreFormData, 500); // Small delay to override autofill if needed
        
        const cpfInput = document.getElementById('cpf');
        if (cpfInput) {
            cpfInput.addEventListener('blur', async () => {
                const cpfVal = cpfInput.value.replace(/\D/g, '');
                if (cpfVal.length === 11) {
                    try {
                        const res = await fetch(`/api/client/data-by-cpf/${cpfVal}`);
                        if (res.ok) {
                            const data = await res.json();
                            if(data.nome) document.getElementById('nome').value = data.nome;
                            if(data.email) document.getElementById('email').value = data.email;
                            if(data.telefone) document.getElementById('telefone').value = data.telefone;
                            if(data.cep) {
                                document.getElementById('cep').value = data.cep;
                                document.getElementById('cep').dispatchEvent(new Event('blur'));
                            }
                            if(data.rua) document.getElementById('rua').value = data.rua;
                            if(data.numero) document.getElementById('numero').value = data.numero;
                            if(data.bairro) document.getElementById('bairro').value = data.bairro;
                            if(data.cidade) document.getElementById('cidade').value = data.cidade;
                            if(data.estado) document.getElementById('estado').value = data.estado;
                            
                            Swal.fire({
                                icon: 'success',
                                title: 'Cadastro Encontrado!',
                                text: 'Preenchemos seus dados automaticamente.',
                                timer: 1500,
                                showConfirmButton: false,
                                toast: true,
                                position: 'top-end'
                            });
                        }
                    } catch (e) {
                        console.error('Erro ao buscar CPF:', e);
                    }
                }
            });
        }
    }
});
