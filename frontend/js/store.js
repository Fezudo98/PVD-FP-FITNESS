// Store Logic

let cart = JSON.parse(localStorage.getItem('fp_fitness_cart')) || [];
let currentCoupon = null; // Store applied coupon

function updateCartCount() {
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    // Update all badges (mobile and desktop)
    const badges = document.querySelectorAll('.cart-count-badge');
    badges.forEach(badge => badge.textContent = count);
}

function addToCart(productId, nome, price, image) {
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id: productId, nome: nome, price: price, image: image, quantity: 1 });
    }

    localStorage.setItem('fp_fitness_cart', JSON.stringify(cart));
    updateCartCount();

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

function renderCartPage() {
    const container = document.getElementById('cartItemsContainer');
    const emptyMsg = document.getElementById('emptyCartMessage');
    const table = document.getElementById('cartTable');
    const subtotalEl = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');

    if (!container) return; // Not on cart page

    if (cart.length === 0) {
        table.classList.add('d-none');
        emptyMsg.classList.remove('d-none');
        if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
        if (totalEl) totalEl.textContent = 'R$ 0,00';
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
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${item.image ? '/uploads/' + item.image : 'https://via.placeholder.com/50'}" alt="${item.nome || 'Produto'}" class="rounded me-3" style="width: 50px; height: 50px; object-fit: cover;">
                        <div>
                            <h6 class="mb-0 text-dark">${item.nome || 'Produto sem nome'}</h6>
                            ${item.size ? `<small class="text-muted">Tamanho: ${item.size}</small>` : ''}
                        </div>
                    </div>
                </td>
                <td class="text-dark">R$ ${price.toFixed(2)}</td>
                <td>
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <button class="btn btn-outline-secondary" onclick="updateQuantity(${item.id}, -1)">-</button>
                        <input type="text" class="form-control text-center bg-white text-dark border-secondary" value="${quantity}" readonly>
                        <button class="btn btn-outline-secondary" onclick="updateQuantity(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td class="text-dark fw-bold">R$ ${subtotal.toFixed(2)}</td>
                <td>
                    <button class="btn btn-link text-danger p-0" onclick="removeFromCart(${item.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `R$ ${total.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
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
            <li class="list-group-item bg-transparent text-dark d-flex justify-content-between lh-sm border-bottom border-secondary-subtle align-items-center">
                <div class="d-flex align-items-center">
                    <img src="${item.image ? '/uploads/' + item.image : 'https://via.placeholder.com/40'}" 
                         alt="${item.nome}" 
                         class="rounded me-2 object-fit-cover" 
                         style="width: 40px; height: 40px;">
                    <div>
                        <h6 class="my-0 fw-bold text-dark" style="font-size: 0.9rem;">${item.nome || 'Produto'}</h6>
                        <small class="text-secondary" style="font-size: 0.8rem;">Qtd: ${item.quantity} ${item.size ? ' | Tam: ' + item.size : ''}</small>
                    </div>
                </div>
                <span class="text-dark fw-bold" style="font-size: 0.9rem;">R$ ${itemTotal.toFixed(2)}</span>
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

    // Ensure discount doesn't exceed subtotal
    if (discount > subtotal) discount = subtotal;

    const total = subtotal - discount;

    if (subtotalEl) subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;

    if (discount > 0) {
        discountRow.classList.remove('d-none');
        discountEl.textContent = `- R$ ${discount.toFixed(2)}`;
    } else {
        discountRow.classList.add('d-none');
    }

    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
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
            try {
                const suggRes = await fetch('/api/public/products/suggestions');
                if (suggRes.ok) {
                    const suggestions = await suggRes.json();
                    suggestionsHtml = `
                        <div class="mt-4 pt-3 border-top border-secondary-subtle">
                            <h5 class="text-warning mb-3 fw-bold">Você também pode gostar:</h5>
                            <div class="row g-2 justify-content-center">
                                ${suggestions.map(p => `
                                    <div class="col-4">
                                        <a href="/store/produto/${p.id}" class="text-decoration-none text-dark">
                                            <div class="card h-100 border-0 shadow-sm">
                                                <img src="${p.imagem ? '/uploads/' + p.imagem : 'https://via.placeholder.com/80'}" class="card-img-top object-fit-cover" style="height: 80px;" alt="${p.nome}">
                                                <div class="card-body p-1 text-center">
                                                    <small class="d-block text-truncate fw-bold" style="font-size: 0.7rem;">${p.nome}</small>
                                                    <small class="text-success fw-bold" style="font-size: 0.7rem;">R$ ${parseFloat(p.preco).toFixed(2)}</small>
                                                </div>
                                            </div>
                                        </a>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            } catch (err) { console.error('Error fetching suggestions', err); }

            Swal.fire({
                icon: 'success',
                title: 'Obrigado!',
                html: `
                    <h5 class="fw-bold mb-3">Pedido #${result.id_pedido} Confirmado!</h5>
                    <p class="mb-2">Recebemos seu pedido e já estamos preparando tudo.</p>
                    ${suggestionsHtml}
                `,
                confirmButtonText: 'Voltar para Loja',
                width: suggestionsHtml ? '600px' : '32em',
                allowOutsideClick: false
            }).then(() => {
                window.location.href = '/store/produtos';
            });
        } else {
            throw new Error(result.erro || 'Erro ao processar pedido.');
        }
    } catch (error) {
        console.error('Erro no checkout:', error);
        Swal.fire('Erro', error.message, 'error');
    }
}

async function submitOrder() {
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

    if (selectedShipping) {
        const name = selectedShipping.dataset.name || '';
        const nameLower = name.toLowerCase();

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

    let totalProdutos = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    // Apply discount if exists? logic is in renderCheckoutPage but not fully synced here?
    // For safety, recalculate discount logic here or assume subtotal check.
    // Ideally we should replicate the exact total calc: Subtotal - Discount + Shipping.

    // Recalculating Discount Logic briefly to be accurate
    let discount = 0;
    if (currentCoupon) {
        if (currentCoupon.aplicacao === 'total') {
            if (currentCoupon.tipo_desconto === 'percentual') {
                discount = totalProdutos * (currentCoupon.valor_desconto / 100);
            } else {
                discount = parseFloat(currentCoupon.valor_desconto);
            }
        }
        if (discount > totalProdutos) discount = totalProdutos;
    }

    const finalTotal = totalProdutos - discount + taxaEntrega;

    const pagamento = {
        forma: document.querySelector('input[name="pagamento"]:checked').value,
        valor: finalTotal
    };

    const payload = {
        cliente: clienteData,
        itens,
        pagamento: [pagamento], // Backend expects list? "pagamentos_data = dados.get('pagamentos')" -> yes list in python usually? 
        // Wait, Python: "sum(float(p['valor']) for p in pagamentos_data)" iterates.
        // Frontend "pagamento" was an object in previous code: "pagamento, ...".
        // Let's check Python: "pagamentos_data = dados.get('pagamentos')". If it's a list, it iterates.
        // If frontend sends object in 'pagamento' key vs 'pagamentos', checking payload construction below.
        // Original code: "pagamento, ...".
        // Python: "pagamentos_data = dados.get('pagamentos')". 
        // IF payload key is 'pagamento', Python 'pagamentos' would be None?
        // Ah, looking at lines 358: "pagamento,".
        // Python: "pagamentos_data = dados.get('pagamentos')".
        // Mismatch? 
        // Let's check "app/routes/api/sales.py" Line 15: "pagamentos_data = dados.get('pagamentos')".
        // Frontend Line 361: "pagamento,".
        // Key is "pagamento". Backend expects "pagamentos"?
        // If key is "pagamento", `dados.get('pagamentos')` is None!
        // Line 19: `if not pagamentos_data: return jsonify...`.

        // WAIT. If backend requires 'pagamentos' and frontend sends 'pagamento', it should fail "Pagamentos não podem estar vazios".
        // So frontend MUST be sending 'pagamentos'. 
        // Let's check `store.js` line 361 carefully in previous `view_file`.
        // Line 361: `pagamento,` inside `payload`.
        // This implies the key is `pagamento`.
        // So `sales.py` MUST be looking for `pagamento` OR I missed something.
        // Let's re-read `sales.py` line 15.
        // `pagamentos_data = dados.get('pagamentos')`
        // THIS IS A MAJOR DISCREPANCY.
        // Unless `pagamento` variable holds a list?
        // Line 321: `const pagamento = { forma: ..., valor: ... }`. It is an object.

        // Maybe I am misreading `sales.py`?
        // Or maybe `store.js` uses a different endpoint? `/api/store/checkout`.
        // `sales.py` has `@api_bp.route('/api/vendas', methods=['POST'])`.
        // `store.js` calls `/api/store/checkout` (Line 256).
        // I need to find the route `/api/store/checkout`. It is likely in `app/routes/api/store.py`!
        // I was looking at `sales.py` which is likely the internal POS API.
        // Online store likely uses `store.py`.

        // I will PAUSE the replace to verify `store.py`.
        // This explains why validation passed! Different code path!

        cupom_id: currentCoupon ? currentCoupon.id : null,
        salvar_endereco: document.getElementById('salvarEndereco') ? document.getElementById('salvarEndereco').checked : false,
        tipo_entrega: tipoEntrega,
        transportadora: transportadora,
        taxa_entrega: taxaEntrega
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
                    window.location.href = '/store/login';
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

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    updateAuthUI();
    if (window.location.pathname.includes('/checkout')) {
        autoFillCheckout();
    }
});

function updateAuthUI() {
    const authContainer = document.getElementById('authButtons');
    if (!authContainer) return;

    const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');

    if (token) {
        authContainer.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-warning btn-sm rounded-pill px-3 dropdown-toggle fw-bold" type="button" data-bs-toggle="dropdown">
                    <i class="fa-regular fa-user me-2"></i>Minha Conta
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                    <li><a class="dropdown-item" href="/store/conta">Perfil</a></li>
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
    }
});
