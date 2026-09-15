(() => {
  const dialog = document.getElementById('roletaDialog');
  const button = document.getElementById('girarRoleta');
  const status = document.getElementById('roletaResultado');
  const canvas = document.getElementById('roletaCanvas');
  const labels = ['5% OFF', '10% OFF', '15% OFF', 'Frete grátis', 'Brinde surpresa'];
  let state = null, spinning = false, sequence = 0, timer;
  const token = () => localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');
  const headers = () => ({'Content-Type':'application/json', 'x-client-token':token() || ''});
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 5; i++) {
    const start = -Math.PI / 2 + i * 2 * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(280,280); ctx.arc(280,280,276,start,start+2*Math.PI/5);
    ctx.closePath(); ctx.fillStyle = i%2 ? '#272727' : '#c4a052'; ctx.fill();
    ctx.save(); ctx.translate(280,280); ctx.rotate(start+Math.PI/5);
    ctx.fillStyle = i%2 ? '#fff' : '#101010'; ctx.font='bold 25px sans-serif';
    ctx.textAlign='center'; ctx.fillText(labels[i],166,8,180); ctx.restore();
  }
  function showState() {
    button.disabled = spinning || Boolean(state?.utilizado);
    button.textContent = state?.premio ? 'Ver meu prêmio' : 'Girar minha roleta';
    if (state?.premio) status.textContent = `${labels[state.indice]}${state.utilizado ? ' · Participação usada no pedido' : ' · Disponível no checkout hoje'}`;
  }
  async function load() {
    if (!token()) return;
    const response = await fetch('/api/store/roleta', {headers:headers()});
    if (response.status === 410) { dialog.close(); document.getElementById('roletaBanner').hidden=true; return; }
    if (!response.ok) throw new Error('Entre novamente na sua conta para participar.');
    state = await response.json(); showState();
    if (state.premio && !state.utilizado) await refresh();
  }
  document.getElementById('abrirRoleta').onclick = async () => {
    if (!token()) { location.href='/store/login?redirect='+encodeURIComponent(location.pathname); return; }
    dialog.showModal();
    try { await load(); } catch(e) { status.textContent=e.message; }
  };
  document.getElementById('fecharRoleta').onclick = () => { if (!spinning) dialog.close(); };
  button.onclick = async () => {
    if (state?.premio || spinning) return;
    spinning=true; showState();
    try {
      const response = await fetch('/api/store/roleta', {method:'POST',headers:headers()});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'A campanha terminou ou sua sessão expirou.');
      state=data;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) canvas.style.transition='none';
      canvas.style.transform=`rotate(${1800 - (state.indice * 72 + 36)}deg)`;
      await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 4100));
      await refresh();
    } catch(e) { status.textContent=e.message; }
    finally { spinning=false; showState(); }
  };
  async function refresh() {
    if (!document.getElementById('checkoutTotal') || !token()) return;
    const id = ++sequence;
    const items = JSON.parse(localStorage.getItem('fp_fitness_cart') || '[]').map(i => ({id_produto:i.id,quantidade:i.quantity}));
    const response = await fetch('/api/store/roleta/resumo', {method:'POST',headers:headers(),body:JSON.stringify({
      itens:items, taxa_entrega:window.shippingCost || 0,
      cupom_id:typeof currentCoupon !== 'undefined' && currentCoupon ? currentCoupon.id : null
    })});
    if (!response.ok) return;
    const data = await response.json();
    if (id !== sequence) return;
    window.roletaSummary=data;
    if (!data.ativa) return;
    const money = v => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    window.currentDiscountValue=data.desconto;
    document.getElementById('checkoutDiscount').textContent='- '+money(data.desconto);
    document.getElementById('discountRow').classList.toggle('d-none',data.desconto<=0);
    document.getElementById('checkoutShipping').textContent=money(data.frete);
    document.getElementById('checkoutTotal').textContent=money(data.total);
    const mobile = document.getElementById('mobileCheckoutTotal'); if (mobile) mobile.textContent=money(data.total);
    let note = document.getElementById('roletaBeneficio');
    if (!note) { note=document.createElement('p');note.id='roletaBeneficio';note.className='small text-warning mt-3';note.setAttribute('role','status');document.getElementById('discountRow').after(note); }
    const origins={roleta:'Prêmio da roleta aplicado',brinde:'Brinde surpresa incluído, com os descontos disponíveis',avaliacao:'Desconto de avaliação aplicado: maior economia',primeira_compra:'Desconto de primeira compra aplicado: maior economia',cupom:'Cupom aplicado: maior economia',nenhum:'Seu prêmio não reduz este carrinho'};
    note.textContent=origins[data.origem];
  }
  window.refreshRoletaSummary=refresh;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>refresh().catch(console.error),150);};
  document.addEventListener('change',schedule);
  window.addEventListener('checkoutUpdated',schedule);
  load().catch(console.error);
})();
