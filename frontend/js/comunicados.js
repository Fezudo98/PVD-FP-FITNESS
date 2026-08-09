const API_URL = ''; // Deixe vazio
const token = localStorage.getItem('authToken');

if (!token) {
    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('comunicadoForm');
    const assuntoInput = document.getElementById('assuntoInput');
    const mensagemInput = document.getElementById('mensagemInput');
    const totalDestinatariosEl = document.getElementById('totalDestinatarios');
    const previewBtn = document.getElementById('previewBtn');
    const enviarBtn = document.getElementById('enviarBtn');
    const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

    function textoParaHtml(texto, nomeExemplo) {
        const comNome = texto.replace(/\{\{\s*nome\s*\}\}/gi, nomeExemplo);
        return comNome
            .split(/\n{2,}/)
            .map(paragrafo => `<p>${paragrafo.replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    async function carregarTotalDestinatarios() {
        try {
            const res = await fetch(`${API_URL}/api/marketing/comunicado/destinatarios`, {
                headers: { 'x-access-token': token }
            });
            const data = await res.json();
            totalDestinatariosEl.textContent = res.ok ? data.total : '?';
        } catch (e) {
            totalDestinatariosEl.textContent = '?';
        }
    }

    previewBtn.addEventListener('click', () => {
        const assunto = assuntoInput.value.trim() || '(sem assunto)';
        const mensagem = mensagemInput.value.trim() || '(mensagem vazia)';

        document.getElementById('previewAssunto').textContent = assunto;
        document.getElementById('previewMensagem').innerHTML = textoParaHtml(mensagem, 'Maria');

        previewModal.show();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const assunto = assuntoInput.value.trim();
        const mensagem = mensagemInput.value.trim();
        const total = totalDestinatariosEl.textContent;

        const confirmacao = await Swal.fire({
            title: 'Enviar comunicado?',
            html: `Esta mensagem será enviada para <strong>${total} cliente(s)</strong> cadastrados, com o assunto:<br><em>"${assunto}"</em><br><br>Essa ação não pode ser desfeita. Confirma o envio?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e0b431',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sim, enviar',
            cancelButtonText: 'Cancelar'
        });

        if (!confirmacao.isConfirmed) return;

        enviarBtn.disabled = true;
        enviarBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';

        try {
            const res = await fetch(`${API_URL}/api/marketing/comunicado`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-access-token': token },
                body: JSON.stringify({ assunto, mensagem })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.erro || 'Erro ao iniciar o envio.');

            Swal.fire('Envio iniciado!', result.mensagem, 'success');
            form.reset();
        } catch (error) {
            Swal.fire('Erro', error.message, 'error');
        } finally {
            enviarBtn.disabled = false;
            enviarBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Enviar Comunicado';
        }
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    carregarTotalDestinatarios();
});
