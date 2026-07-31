document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    window.openMedia = (type, url) => {
        const body = document.getElementById('mediaPreviewBody');
        const fullUrl = `/static/uploads/reviews/${url}`;
        
        if (type === 'foto') {
            body.innerHTML = `<img src="${fullUrl}" class="img-fluid rounded" alt="Preview">`;
        } else {
            body.innerHTML = `<video src="${fullUrl}" class="w-100 rounded" controls autoplay></video>`;
        }
        
        new bootstrap.Modal(document.getElementById('mediaPreviewModal')).show();
    };

    try {
        const response = await fetch('/api/admin/avaliacoes-produtos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }

        const avaliacoes = await response.json();
        
        let somaNotas = 0;
        let contagemNotas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        const tableBody = document.getElementById('avaliacoesTableBody');
        
        if (avaliacoes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Nenhuma avaliação de produto recebida ainda.</td></tr>';
            return;
        }

        let html = '';
        avaliacoes.forEach(a => {
            somaNotas += a.nota;
            contagemNotas[a.nota]++;

            // Medias HTML
            let mediasHtml = '';
            if (a.midias && a.midias.length > 0) {
                mediasHtml = `<div class="d-flex gap-2 mt-2">`;
                a.midias.forEach(m => {
                    const fullUrl = `/static/uploads/reviews/${m.url}`;
                    if (m.tipo === 'foto') {
                        mediasHtml += `<img src="${fullUrl}" class="media-thumbnail" onclick="openMedia('foto', '${m.url}')">`;
                    } else {
                        // For video, use video tag to generate thumbnail or a placeholder
                        mediasHtml += `<video src="${fullUrl}" class="media-thumbnail" onclick="openMedia('video', '${m.url}')"></video>`;
                    }
                });
                mediasHtml += `</div>`;
            }

            html += `
                <tr>
                    <td class="px-4 py-3"><small class="text-muted">${a.data_criacao}</small></td>
                    <td>
                        <a href="/loja_online_produto.html?id=${a.id_produto}" class="text-decoration-none fw-bold text-dark" target="_blank">
                            <i class="fas fa-box me-1"></i> ${a.produto_nome} <small class="text-muted">(#${a.id_produto})</small>
                        </a>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <img src="${a.cliente_foto || '/static/img/default_avatar.png'}" class="rounded-circle me-2" width="30" height="30" style="object-fit: cover;">
                            <span>${a.cliente_nome}</span>
                        </div>
                    </td>
                    <td class="text-warning text-nowrap">
                        ${'<i class="fas fa-star"></i>'.repeat(a.nota)}${'<i class="far fa-star"></i>'.repeat(5 - a.nota)}
                    </td>
                    <td class="text-muted text-wrap" style="max-width: 300px;">
                        ${a.comentario || '<em>Sem comentário</em>'}
                        ${mediasHtml}
                    </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;

        // Atualizar Dashboard
        const total = avaliacoes.length;
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
        console.error('Erro ao carregar avaliações:', error);
        document.getElementById('avaliacoesTableBody').innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar os dados.</td></tr>';
    }
});
