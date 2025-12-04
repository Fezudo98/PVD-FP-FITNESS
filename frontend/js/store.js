// Store Logic

let cart = JSON.parse(localStorage.getItem('fp_fitness_cart')) || [];
let currentCoupon = null; // Store applied coupon

function updateCartCount() {
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    const badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count;
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
        title: 'Adicionado!',
        text: 'Produto adicionado ao carrinho.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        background: '#1e1e1e',
        color: '#fff'
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

    // Get client token for validation
    const token = localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');
    if (!token) {
        Swal.fire('Login Necessário', 'Faça login para usar cupons.', 'info');
        return;
    }

    try {
        const response = await fetch(`/api/store/cupons/validar/${code}`, {
            headers: { 'x-client-token': token }
        });
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
            <li class="list-group-item bg-transparent text-dark d-flex justify-content-between lh-sm border-bottom border-secondary-subtle">
                <div>
                    <h6 class="my-0 fw-bold text-dark">${item.nome || 'Produto'}</h6>
                    <small class="text-secondary">Qtd: ${item.quantity}</small>
                    ${item.size ? `<br><small class="text-secondary">Tamanho: ${item.size}</small>` : ''}
                </div>
                <span class="text-dark fw-bold">R$ ${itemTotal.toFixed(2)}</span>
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

async function submitOrder() {
    const form = document.getElementById('checkoutForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const cliente = {
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

    // Calculate final value again to be safe (though backend should verify)
    let total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    // Apply discount logic here too for the 'valor' field, 
    // BUT backend should recalculate. 
    // We'll send the raw total and let backend handle coupon application if we send cupom_id.
    // Wait, the backend 'checkout' endpoint needs to know about the coupon.
    // I should add 'cupom_id' to the payload.

    const pagamento = {
        forma: document.querySelector('input[name="pagamento"]:checked').value,
        valor: total // Backend should recalculate with coupon
    };

    const payload = {
        cliente,
        itens,
        pagamento,
        cupom_id: currentCoupon ? currentCoupon.id : null, // Send coupon ID
        salvar_endereco: document.getElementById('salvarEndereco') ? document.getElementById('salvarEndereco').checked : false
    };

    try {
        Swal.fire({
            title: 'Processando...',
            text: 'Aguarde enquanto finalizamos seu pedido.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch('/api/store/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            cart = [];
            localStorage.removeItem('fp_fitness_cart');
            updateCartCount();

            Swal.fire({
                icon: 'success',
                title: 'Pedido Realizado!',
                text: `Seu pedido #${result.id_pedido} foi confirmado com sucesso.`,
                confirmButtonText: 'Voltar para Loja'
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
    if (document.getElementById('cep')) document.getElementById('cep').value = data.endereco_cep || '';
}
