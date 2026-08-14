document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch('/api/admin/feedbacks', {
            headers: { 'x-access-token': token }
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }

        const feedbacks = await response.json();
        
        let somaNotas = 0;
        let contagemNotas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        const tableBody = document.getElementById('feedbacksTableBody');
        
        if (feedbacks.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Nenhum feedback recebido ainda.</td></tr>';
            return;
        }

        let html = '';
        feedbacks.forEach(f => {
            somaNotas += f.nota;
            contagemNotas[f.nota]++;

            html += `
                <tr>
                    <td class="px-4 py-3"><small class="text-muted">${escapeHtml(f.data_criacao)}</small></td>
                    <td class="fw-bold">${escapeHtml(f.cliente_nome)}</td>
                    <td><a href="/loja_online.html" class="text-decoration-none">#${f.id_venda}</a></td>
                    <td class="text-warning">
                        ${'<i class="fas fa-star"></i>'.repeat(f.nota)}${'<i class="far fa-star"></i>'.repeat(5 - f.nota)}
                    </td>
                    <td class="text-muted text-wrap" style="max-width: 300px;">
                        ${f.comentario ? escapeHtml(f.comentario) : '<em>Sem comentário</em>'}
                    </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;

        // Atualizar Dashboard
        const total = feedbacks.length;
        const media = (somaNotas / total).toFixed(1);
        
        document.getElementById('totalAvaliacoes').textContent = total;
        document.getElementById('avgNota').textContent = media;
        
        const roundedMedia = Math.round(media);
        document.getElementById('avgStars').innerHTML = '<i class="fas fa-star"></i>'.repeat(roundedMedia) + '<i class="far fa-star"></i>'.repeat(5 - roundedMedia);

        // Barras
        for (let i = 1; i <= 5; i++) {
            const perc = ((contagemNotas[i] / total) * 100).toFixed(0);
            document.getElementById(`bar${i}`).style.width = `${perc}%`;
        }

    } catch (error) {
        console.error('Erro ao carregar feedbacks:', error);
        document.getElementById('feedbacksTableBody').innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar os dados.</td></tr>';
    }
});
