const API_URL = '';
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const tabelasContainer = document.getElementById('tabelasContainer');
    const tabelaModal = new bootstrap.Modal(document.getElementById('tabelaModal'));
    const tabelaForm = document.getElementById('tabelaForm');
    const addTabelaBtn = document.getElementById('addTabelaBtn');
    const addColunaBtn = document.getElementById('addColunaBtn');
    const addLinhaBtn = document.getElementById('addLinhaBtn');
    const colunasContainer = document.getElementById('colunasContainer');
    const linhasTableHead = document.getElementById('linhasTableHead');
    const linhasTableBody = document.getElementById('linhasTableBody');

    let allTabelas = [];
    let colunasAtuais = [];
    let linhasAtuais = [];

    async function fetchTabelas() {
        try {
            const response = await fetch(`${API_URL}/api/tabelas-medidas`, {
                headers: { 'x-access-token': token }
            });
            if (!response.ok) throw new Error('Falha ao carregar tabelas de medidas.');
            allTabelas = await response.json();
            renderTabelas(allTabelas);
        } catch (error) {
            console.error('Erro ao buscar tabelas de medidas:', error);
        }
    }

    async function fetchCategorias() {
        try {
            const response = await fetch(`${API_URL}/api/categorias`, { headers: { 'x-access-token': token } });
            const categorias = await response.json();
            const datalist = document.getElementById('categoriasList');
            datalist.innerHTML = categorias.map(c => `<option value="${escapeHtml(c)}">`).join('');
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
        }
    }

    function renderTabelas(tabelas) {
        tabelasContainer.innerHTML = '';
        if (tabelas.length === 0) {
            tabelasContainer.innerHTML = '<div class="text-center text-white-50 py-5"><i class="fas fa-ruler fa-2x mb-3 d-block"></i>Nenhuma tabela de medidas cadastrada.</div>';
            return;
        }

        tabelas.forEach(t => {
            const card = document.createElement('div');
            card.className = 'medida-card';

            const linhasHtml = t.linhas.map(l => `
                <tr>
                    <td class="fw-bold">${escapeHtml(l.tamanho)}</td>
                    ${l.valores.map(v => `<td>${escapeHtml(v)}</td>`).join('')}
                </tr>
            `).join('');

            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-0">${escapeHtml(t.categoria)}</h5>
                        ${t.observacao ? `<div class="text-white-50 small mt-1">${escapeHtml(t.observacao)}</div>` : ''}
                    </div>
                    <div>
                        <button class="btn btn-sm btn-info tabela-edit-btn" data-id="${t.id}">Editar</button>
                        <button class="btn btn-sm btn-danger tabela-delete-btn" data-id="${t.id}">Excluir</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-dark table-sm align-middle mb-0">
                        <thead>
                            <tr class="text-white-50 small">
                                <th>Tamanho</th>
                                ${t.colunas.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>${linhasHtml}</tbody>
                    </table>
                </div>
            `;
            tabelasContainer.appendChild(card);
        });
    }

    // --- Editor de colunas/linhas dentro do modal ---

    function renderColunas() {
        colunasContainer.innerHTML = colunasAtuais.map((nome, idx) => `
            <div class="input-group input-group-sm" style="width: 190px;">
                <input type="text" class="form-control bg-secondary text-white border-0 coluna-input" data-idx="${idx}" value="${escapeHtml(nome)}" placeholder="Ex: Cintura (cm)">
                <button type="button" class="btn btn-outline-danger remove-coluna-btn" data-idx="${idx}"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        colunasContainer.querySelectorAll('.coluna-input').forEach(input => {
            input.addEventListener('input', (e) => {
                colunasAtuais[parseInt(e.target.dataset.idx)] = e.target.value;
            });
        });
        colunasContainer.querySelectorAll('.remove-coluna-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                colunasAtuais.splice(idx, 1);
                linhasAtuais.forEach(l => l.valores.splice(idx, 1));
                renderColunas();
                renderLinhas();
            });
        });

        renderLinhas();
    }

    function renderLinhas() {
        linhasTableHead.innerHTML = `<th>Tamanho</th>${colunasAtuais.map(c => `<th>${escapeHtml(c || '(sem nome)')}</th>`).join('')}<th></th>`;

        linhasTableBody.innerHTML = linhasAtuais.map((linha, lIdx) => `
            <tr class="linha-medida-row">
                <td><input type="text" class="form-control form-control-sm bg-secondary text-white border-0 linha-tamanho-input" data-lidx="${lIdx}" value="${escapeHtml(linha.tamanho)}" placeholder="P, M, G..."></td>
                ${colunasAtuais.map((_, cIdx) => `
                    <td><input type="text" class="form-control form-control-sm bg-secondary text-white border-0 linha-valor-input" data-lidx="${lIdx}" data-cidx="${cIdx}" value="${escapeHtml(linha.valores[cIdx] || '')}"></td>
                `).join('')}
                <td><button type="button" class="btn btn-sm btn-outline-danger remove-linha-btn" data-lidx="${lIdx}"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');

        linhasTableBody.querySelectorAll('.linha-tamanho-input').forEach(input => {
            input.addEventListener('input', (e) => {
                linhasAtuais[parseInt(e.target.dataset.lidx)].tamanho = e.target.value;
            });
        });
        linhasTableBody.querySelectorAll('.linha-valor-input').forEach(input => {
            input.addEventListener('input', (e) => {
                linhasAtuais[parseInt(e.target.dataset.lidx)].valores[parseInt(e.target.dataset.cidx)] = e.target.value;
            });
        });
        linhasTableBody.querySelectorAll('.remove-linha-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                linhasAtuais.splice(parseInt(e.currentTarget.dataset.lidx), 1);
                renderLinhas();
            });
        });
    }

    addColunaBtn.addEventListener('click', () => {
        colunasAtuais.push('');
        linhasAtuais.forEach(l => l.valores.push(''));
        renderColunas();
    });

    addLinhaBtn.addEventListener('click', () => {
        linhasAtuais.push({ tamanho: '', valores: colunasAtuais.map(() => '') });
        renderLinhas();
    });

    addTabelaBtn.addEventListener('click', () => {
        tabelaForm.reset();
        document.getElementById('tabelaId').value = '';
        document.getElementById('tabelaModalTitle').textContent = 'Nova Tabela de Medidas';
        colunasAtuais = ['Cintura (cm)', 'Quadril (cm)'];
        linhasAtuais = [
            { tamanho: 'P', valores: ['', ''] },
            { tamanho: 'M', valores: ['', ''] },
            { tamanho: 'G', valores: ['', ''] }
        ];
        renderColunas();
        tabelaModal.show();
    });

    tabelaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const colunasLimpas = colunasAtuais.map(c => c.trim());
        if (colunasLimpas.length === 0 || colunasLimpas.some(c => !c)) {
            alert('Preencha o nome de todas as colunas (ou remova as vazias).');
            return;
        }
        if (linhasAtuais.length === 0 || linhasAtuais.some(l => !l.tamanho.trim())) {
            alert('Preencha o tamanho de todas as linhas (ou remova as vazias).');
            return;
        }

        const id = document.getElementById('tabelaId').value;
        const url = id ? `${API_URL}/api/tabelas-medidas/${id}` : `${API_URL}/api/tabelas-medidas`;
        const method = id ? 'PUT' : 'POST';

        const data = {
            categoria: document.getElementById('tabelaCategoria').value,
            observacao: document.getElementById('tabelaObservacao').value,
            colunas: colunasLimpas,
            linhas: linhasAtuais.map(l => ({ tamanho: l.tamanho.trim(), valores: l.valores.map(v => v.trim()) }))
        };

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                tabelaModal.hide();
                fetchTabelas();
            } else {
                const error = await response.json();
                alert(`Erro: ${error.erro || 'Ocorreu um problema.'}`);
            }
        } catch (error) {
            console.error('Erro ao salvar tabela de medidas:', error);
            alert('Erro de conexão.');
        }
    });

    tabelasContainer.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.tabela-edit-btn');
        const deleteBtn = e.target.closest('.tabela-delete-btn');

        if (editBtn) {
            const t = allTabelas.find(x => x.id === parseInt(editBtn.dataset.id));
            if (!t) return;
            document.getElementById('tabelaId').value = t.id;
            document.getElementById('tabelaCategoria').value = t.categoria;
            document.getElementById('tabelaObservacao').value = t.observacao || '';
            document.getElementById('tabelaModalTitle').textContent = `Editar: ${t.categoria}`;
            colunasAtuais = [...t.colunas];
            linhasAtuais = t.linhas.map(l => ({ tamanho: l.tamanho, valores: [...l.valores] }));
            renderColunas();
            tabelaModal.show();
        }

        if (deleteBtn) {
            if (confirm('Tem certeza que deseja excluir esta tabela de medidas?')) {
                const id = deleteBtn.dataset.id;
                const response = await fetch(`${API_URL}/api/tabelas-medidas/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-access-token': token }
                });
                if (response.ok) {
                    fetchTabelas();
                } else {
                    const error = await response.json();
                    alert(`Erro: ${error.erro || 'Não foi possível excluir.'}`);
                }
            }
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    fetchTabelas();
    fetchCategorias();
});
