// Impressão térmica nativa (ZPL via QZ Tray) e impressão em lote de etiquetas do Melhor Envio.
// QZ Tray é um programa local (gratuito) que faz a ponte entre a página e a impressora - sem
// ele, a impressão continua funcionando normalmente pela etiqueta em PDF/HTML (ver botão
// "Imprimir Etiqueta" nos detalhes do pedido), só não tem o ganho de tamanho/escala exatos.

const QZ_PRINTER_STORAGE_KEY = 'fp_fitness_impressora_termica';

function initImpressaoLote() {
    const label = document.getElementById('impressoraAtualLabel');
    if (label) {
        const salva = localStorage.getItem(QZ_PRINTER_STORAGE_KEY);
        label.textContent = salva ? `(${salva})` : '(nenhuma configurada)';
    }
}

async function conectarQzTray() {
    if (typeof qz === 'undefined') {
        throw new Error('QZ Tray não está instalado ou não carregou. Baixe em qz.io/download e instale no computador antes de imprimir.');
    }
    if (!qz.websocket.isActive()) {
        try {
            await qz.websocket.connect();
        } catch (e) {
            throw new Error('Não foi possível conectar ao QZ Tray. Confirme que o programa está aberto (ícone na bandeja do Windows) e tente de novo.');
        }
    }
}

async function configurarImpressoraTermica() {
    try {
        await conectarQzTray();
        const impressoras = await qz.printers.find();
        if (!impressoras || impressoras.length === 0) {
            Swal.fire('Nenhuma impressora encontrada', 'O QZ Tray não encontrou nenhuma impressora instalada no Windows.', 'warning');
            return;
        }

        const atual = localStorage.getItem(QZ_PRINTER_STORAGE_KEY) || '';
        const opcoes = impressoras.map(nome =>
            `<option value="${nome}" ${nome === atual ? 'selected' : ''}>${nome}</option>`
        ).join('');

        const { value: escolhida } = await Swal.fire({
            title: 'Impressora Térmica',
            html: `<p class="text-white-50 small">Selecione a impressora (ex: Knup) que vai receber as etiquetas em ZPL.</p>
                   <select id="swalPrinterSelect" class="form-select bg-dark text-white border-secondary">${opcoes}</select>`,
            background: '#1e1e1e',
            color: '#fff',
            confirmButtonText: 'Salvar',
            confirmButtonColor: '#e0b431',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => document.getElementById('swalPrinterSelect').value
        });

        if (escolhida) {
            localStorage.setItem(QZ_PRINTER_STORAGE_KEY, escolhida);
            initImpressaoLote();
            Swal.fire({ icon: 'success', title: 'Impressora salva!', timer: 1500, showConfirmButton: false, background: '#1e1e1e', color: '#fff' });
        }
    } catch (error) {
        console.error('Erro ao configurar impressora:', error);
        Swal.fire('Erro', error.message, 'error');
    }
}

function toggleTodosLote(checkboxTodos) {
    document.querySelectorAll('.lote-checkbox').forEach(cb => { cb.checked = checkboxTodos.checked; });
    atualizarSelecaoLote();
}

function atualizarSelecaoLote() {
    const marcados = document.querySelectorAll('.lote-checkbox:checked');
    const label = document.getElementById('loteSelecionadosLabel');
    const btn = document.getElementById('btnImprimirLote');

    if (marcados.length === 0) {
        label.textContent = 'Nenhum pedido selecionado';
        btn.classList.add('d-none');
    } else {
        label.textContent = `${marcados.length} pedido(s) selecionado(s)`;
        btn.classList.remove('d-none');
        btn.innerHTML = `<i class="fa-solid fa-print me-1"></i>Imprimir Etiquetas Selecionadas (${marcados.length})`;
    }
}

async function imprimirEtiquetasSelecionadas() {
    const vendaIds = Array.from(document.querySelectorAll('.lote-checkbox:checked')).map(cb => Number(cb.dataset.vendaId));
    if (vendaIds.length === 0) return;

    const impressora = localStorage.getItem(QZ_PRINTER_STORAGE_KEY);
    if (!impressora) {
        Swal.fire('Configure a impressora primeiro', 'Clique em "Configurar Impressora Térmica" antes de imprimir em lote.', 'warning');
        return;
    }

    try {
        await conectarQzTray();
    } catch (error) {
        Swal.fire('Erro de conexão', error.message, 'error');
        return;
    }

    Swal.fire({
        title: 'Gerando etiquetas...',
        html: `Processando ${vendaIds.length} pedido(s). Isso pode levar alguns segundos.`,
        background: '#1e1e1e', color: '#fff',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const token = localStorage.getItem('authToken');
    let resultados = [];
    try {
        const res = await fetch(`${API_URL}/api/vendas/etiquetas/lote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-access-token': token },
            body: JSON.stringify({ venda_ids: vendaIds })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao gerar etiquetas em lote.');
        resultados = data.resultados || [];
    } catch (error) {
        Swal.fire('Erro', error.message, 'error');
        return;
    }

    const sucesso = resultados.filter(r => r.ok);
    const falhas = resultados.filter(r => !r.ok);

    if (sucesso.length > 0) {
        try {
            const config = qz.configs.create(impressora);
            const dados = sucesso.map(r => ({ type: 'raw', format: 'command', flavor: 'plain', data: r.zpl }));
            await qz.print(config, dados);
        } catch (error) {
            console.error('Erro ao imprimir via QZ Tray:', error);
            Swal.fire('Erro ao imprimir', `As etiquetas foram geradas, mas houve um erro ao enviar pra impressora: ${error.message || error}`, 'error');
            return;
        }
    }

    let mensagem = `<p>${sucesso.length} etiqueta(s) enviada(s) pra impressão.</p>`;
    if (falhas.length > 0) {
        mensagem += `<p class="text-danger mb-1">${falhas.length} pedido(s) com erro:</p>
            <ul class="text-start small text-danger">${falhas.map(f => `<li>Pedido #${f.venda_id}: ${f.erro}</li>`).join('')}</ul>`;
    }

    Swal.fire({
        icon: falhas.length > 0 ? 'warning' : 'success',
        title: falhas.length > 0 ? 'Concluído com pendências' : 'Etiquetas impressas!',
        html: mensagem,
        background: '#1e1e1e', color: '#fff'
    });

    document.querySelectorAll('.lote-checkbox:checked').forEach(cb => { cb.checked = false; });
    const checkAll = document.getElementById('checkAllLote');
    if (checkAll) checkAll.checked = false;
    atualizarSelecaoLote();

    if (sucesso.length > 0) {
        loadOnlineOrders();
    }
}
