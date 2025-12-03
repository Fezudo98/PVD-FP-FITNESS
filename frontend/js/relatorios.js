const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

// Variáveis globais para os gráficos e o modal
let vendasTempoChart = null;
let formaPagamentoChart = null;
let rankingProdutosChart = null;
let rankingVendedoresChart = null;
let receiptModal = null;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o modal do recibo
    receiptModal = new bootstrap.Modal(document.getElementById('receiptModal'));

    const dataInicioInput = document.getElementById('dataInicio');
    const dataFimInput = document.getElementById('dataFim');
    const filtrarBtn = document.getElementById('filtrarBtn');

    async function fetchAndRenderDashboard() {
        const dataInicio = dataInicioInput.value;
        const dataFim = dataFimInput.value;
        if (!dataInicio || !dataFim) {
            alert('Por favor, selecione uma data de início e de fim.');
            return;
        }
        const url = `${API_URL}/api/relatorios/dashboard?data_inicio=${dataInicio}&data_fim=${dataFim}`;
        try {
            const response = await fetch(url, { headers: { 'x-access-token': token } });
            if (!response.ok) throw new Error('Falha ao buscar dados do relatório.');
            const data = await response.json();
            renderKPIs(data.kpis);
            renderVendasTempoChart(data.grafico_vendas_tempo);
            renderFormaPagamentoChart(data.grafico_forma_pagamento);
            renderRankingProdutosChart(data.ranking_produtos);
            renderRankingVendedoresChart(data.ranking_vendedores);
            renderVendasTable(data.lista_vendas);
        } catch (error) {
            console.error('Erro no dashboard:', error);
            alert(error.message);
        }
    }

    function renderKPIs(kpis) {
        document.getElementById('kpiReceitaTotal').textContent = `R$ ${kpis.receita_total.toFixed(2)}`;
        document.getElementById('kpiLucroBruto').textContent = `R$ ${kpis.lucro_bruto.toFixed(2)}`;
        document.getElementById('kpiTotalVendas').textContent = kpis.total_vendas;
        document.getElementById('kpiTicketMedio').textContent = `R$ ${kpis.ticket_medio.toFixed(2)}`;
        document.getElementById('kpiTaxasEntrega').textContent = `R$ ${kpis.total_taxas_entrega.toFixed(2)}`;
        document.getElementById('kpiTotalDescontos').textContent = `R$ ${kpis.total_descontos.toFixed(2)}`;
    }

    function renderVendasTempoChart(data) {
        const ctx = document.getElementById('vendasTempoChart').getContext('2d');
        if (vendasTempoChart) vendasTempoChart.destroy();
        vendasTempoChart = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.data), datasets: [{ label: 'Receita por Dia', data: data.map(d => d.total), borderColor: '#e0b431', backgroundColor: 'rgba(224, 180, 49, 0.2)', tension: 0.1, fill: true }] }, options: { responsive: true, plugins: { title: { display: true, text: 'Vendas ao Longo do Tempo', color: '#f8f9fa' }, legend: { labels: { color: '#f8f9fa' } } }, scales: { x: { ticks: { color: '#f8f9fa' } }, y: { ticks: { color: '#f8f9fa' } } } } });
    }
    function renderFormaPagamentoChart(data) {
        const ctx = document.getElementById('formaPagamentoChart').getContext('2d');
        if (formaPagamentoChart) formaPagamentoChart.destroy();
        const backgroundColors = ['rgba(224, 180, 49, 0.9)', 'rgba(255, 235, 153, 0.9)', 'rgba(166, 138, 54, 0.9)', 'rgba(200, 200, 200, 0.9)', 'rgba(120, 100, 40, 0.9)'];
        formaPagamentoChart = new Chart(ctx, { type: 'doughnut', data: { labels: data.map(d => d.forma), datasets: [{ label: 'Total R$', data: data.map(d => d.total), backgroundColor: backgroundColors, borderColor: '#2a2a2a', borderWidth: 2 }] }, options: { responsive: true, plugins: { title: { display: true, text: 'Vendas por Forma de Pagamento', color: '#f8f9fa' }, legend: { labels: { color: '#f8f9fa' } } } } });
    }
    function renderRankingProdutosChart(data) {
        const ctx = document.getElementById('rankingProdutosChart').getContext('2d');
        if (rankingProdutosChart) rankingProdutosChart.destroy();
        rankingProdutosChart = new Chart(ctx, { type: 'bar', data: { labels: data.map(d => d.produto), datasets: [{ label: 'Quantidade Vendida', data: data.map(d => d.quantidade), backgroundColor: 'rgba(224, 180, 49, 0.8)', }] }, options: { indexAxis: 'y', responsive: true, plugins: { title: { display: true, text: 'Top 10 Produtos Mais Vendidos', color: '#f8f9fa' }, legend: { display: false }, }, scales: { x: { ticks: { color: '#f8f9fa' } }, y: { ticks: { color: '#f8f9fa' } } } } });
    }
    function renderRankingVendedoresChart(data) {
        const ctx = document.getElementById('rankingVendedoresChart').getContext('2d');
        if (rankingVendedoresChart) rankingVendedoresChart.destroy();
        rankingVendedoresChart = new Chart(ctx, { type: 'bar', data: { labels: data.map(d => d.vendedor), datasets: [{ label: 'Valor Total Vendido (R$)', data: data.map(d => d.total), backgroundColor: 'rgba(224, 180, 49, 0.8)', }] }, options: { indexAxis: 'y', responsive: true, plugins: { title: { display: true, text: 'Ranking de Vendedores', color: '#f8f9fa' }, legend: { display: false }, }, scales: { x: { ticks: { color: '#f8f9fa' } }, y: { ticks: { color: '#f8f9fa' } } } } });
    }

    function renderVendasTable(vendas) {
        const tableBody = document.getElementById('vendasTableBody');
        tableBody.innerHTML = '';
        if (vendas.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhuma venda encontrada no período.</td></tr>';
            return;
        }
        vendas.forEach(venda => {
            const row = tableBody.insertRow();
            if (venda.status === 'Reembolsada') {
                row.classList.add('table-secondary');
                row.style.textDecoration = 'line-through';
                row.style.opacity = '0.6';
            }
            row.innerHTML = `
                <td>${venda.id}</td>
                <td>${venda.data_hora}</td>
                <td>${venda.cliente}</td>
                <td>${venda.vendedor}</td>
                <td>${venda.pagamento}</td>
                <td>R$ ${venda.total.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-info view-receipt-btn" data-id="${venda.id}">Ver Recibo</button>
                    ${venda.status === 'Concluída'
                    ? `<button class="btn btn-sm btn-warning reembolsar-btn" data-id="${venda.id}">Reembolsar</button>`
                    : `<span class="badge bg-danger">${venda.status}</span>`
                }
                </td>
            `;
        });
    }

    // ===== FUNÇÃO DE EXIBIR RECIBO ATUALIZADA =====
    async function showReceiptDetails(vendaId) {
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
            if (data.valor_desconto > 0) {
                receiptDiscountRow.classList.remove('d-none');
                document.getElementById('receiptCupomCode').textContent = data.cupom_utilizado;
                document.getElementById('receiptDiscountValue').textContent = `- R$ ${data.valor_desconto.toFixed(2)}`;
            } else {
                receiptDiscountRow.classList.add('d-none');
            }

            document.getElementById('receiptTaxaEntrega').textContent = `R$ ${data.taxa_entrega.toFixed(2)}`;
            document.getElementById('receiptTotalGeral').textContent = `R$ ${data.total_venda.toFixed(2)}`;

            // Lógica para exibir múltiplos pagamentos
            const paymentsDiv = document.getElementById('receiptPayments'); // Assumindo que o HTML terá este div
            paymentsDiv.innerHTML = ''; // Limpa pagamentos anteriores
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
        } catch (error) {
            console.error('Erro ao mostrar o recibo:', error);
            alert(error.message);
        }
    }

    function init() {
        const hoje = new Date();
        const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataFimInput.value = hoje.toISOString().split('T')[0];
        dataInicioInput.value = primeiroDiaDoMes.toISOString().split('T')[0];
        fetchAndRenderDashboard();
    }

    // Event Listeners
    filtrarBtn.addEventListener('click', fetchAndRenderDashboard);

    document.getElementById('vendasTableBody').addEventListener('click', async function (event) {
        const target = event.target;
        if (target.classList.contains('reembolsar-btn')) {
            const vendaId = target.dataset.id;
            if (confirm(`Tem certeza que deseja reembolsar a venda ID ${vendaId}? Esta ação não pode ser desfeita e o estoque dos produtos será devolvido.`)) {
                try {
                    const response = await fetch(`${API_URL}/api/vendas/${vendaId}/reembolsar`, { method: 'POST', headers: { 'x-access-token': token } });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.erro || 'Erro desconhecido');
                    alert(result.mensagem);
                    fetchAndRenderDashboard();
                } catch (error) {
                    console.error('Erro ao reembolsar venda:', error);
                    alert(`Falha no reembolso: ${error.message}`);
                }
            }
        }
        if (target.classList.contains('view-receipt-btn')) {
            const vendaId = target.dataset.id;
            showReceiptDetails(vendaId);
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // --- LÓGICA DE IMPRESSÃO ---
    document.body.addEventListener('click', (event) => {
        if (event.target.id === 'imprimirA4Btn') printReceipt('a4');
        if (event.target.id === 'imprimirTermicaBtn') printReceipt('termica');
    });

    window.onafterprint = () => {
        document.getElementById('receiptContent').classList.remove('termica-print');
    };
    function printReceipt(format) {
        const receiptContent = document.getElementById('receiptContent');
        receiptContent.classList.toggle('termica-print', format === 'termica');
        setTimeout(() => window.print(), 100);
    }

    init();
});