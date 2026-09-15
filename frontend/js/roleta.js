(() => {
  const dialog = document.getElementById('roletaDialog');
  const button = document.getElementById('girarRoleta');
  const status = document.getElementById('roletaResultado');
  const canvas = document.getElementById('roletaCanvas');
  const labels = ['5% OFF', '10% OFF', '15% OFF', 'Frete grátis', 'Brinde surpresa'];
  let state = null, spinning = false, sequence = 0, timer;
  const token = () => localStorage.getItem('clientToken') || sessionStorage.getItem('clientToken');
  const headers = () => ({'Content-Type':'application/json', 'x-client-token':token() || ''});
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wheelView = document.getElementById('roletaWheelView');
  const prizeView = document.getElementById('roletaPrizeView');
  const launcher = document.querySelector('#abrirRoleta strong');
  const ctx = canvas.getContext('2d');
  const segmentLines = [['5%', 'OFF'], ['10%', 'OFF'], ['15%', 'OFF'], ['FRETE', 'GRÁTIS'], ['BRINDE', 'SURPRESA']];
  const fills = ['#d8bd7b','#27251f','#e7ce91','#302c23','#c6a76a'];
  for (let i = 0; i < 5; i++) {
    const start = -Math.PI / 2 + i * 2 * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(360,360); ctx.arc(360,360,357,start,start+2*Math.PI/5);
    ctx.closePath(); ctx.fillStyle=fills[i];ctx.fill();
    ctx.strokeStyle='#f4dda13b';ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.translate(360,360);ctx.rotate(start+Math.PI/5+Math.PI/2);
    ctx.fillStyle=i%2 ? '#ead7a4' : '#2b2416';ctx.textAlign='center';
    ctx.font=i<3 ? '800 49px sans-serif' : '800 27px sans-serif';
    ctx.fillText(segmentLines[i][0],0,-219);
    ctx.font='700 23px sans-serif';ctx.fillText(segmentLines[i][1],0,-186);ctx.restore();
  }
  function showState() {
    button.disabled=spinning;
    button.textContent=spinning ? 'Sua surpresa está chegando…' : state?.premio ? 'Ver meu prêmio ↗' : 'Girar e descobrir ↗';
    document.getElementById('abrirRoleta').disabled=spinning;
    document.getElementById('fecharRoleta').disabled=spinning;
    dialog.classList.toggle('rw-spinning',spinning);
    launcher.textContent=state?.premio ? 'Meu prêmio' : 'Gire e ganhe';
    if (!spinning && state?.premio) {
      status.textContent=state.utilizado ? 'Seu prêmio já está vinculado a um pedido.' : 'Seu prêmio está salvo. Veja os detalhes abaixo.';
      canvas.style.transition='none';
      canvas.style.transform=`rotate(${-(state.indice*72+36)}deg)`;
    }
  }
  function reveal(celebrate=false) {
    if (!state?.premio) return;
    wheelView.hidden=true;prizeView.hidden=false;
    const title=document.getElementById('roletaPrizeTitle');
    title.textContent=labels[state.indice];
    const descriptions={off5:'Um carinho extra para seu próximo look.',off10:'Seu próximo look ganhou uma vantagem especial.',off15:'Uma surpresa especial para renovar sua coleção.',frete:'Seu presente é a entrega grátis no pedido elegível.',brinde:'Um presente surpresa vai junto com seu pedido — e pode acumular com seus descontos.'};
    document.getElementById('roletaPrizeDescription').textContent=state.utilizado ? 'Seu prêmio está vinculado ao pedido. Acompanhe ou retome o pagamento em Minha Conta.' : descriptions[state.premio];
    const link=document.getElementById('roletaUsePrize');
    const hasCart=JSON.parse(localStorage.getItem('fp_fitness_cart') || '[]').length>0;
    link.href=state.utilizado ? '/store/conta' : hasCart ? '/store/checkout' : '/store/produtos';
    link.textContent=state.utilizado ? 'Ver meu pedido ↗' : hasCart ? 'Usar no meu pedido ↗' : 'Escolher meu look ↗';
    title.focus({preventScroll:true});
    if (celebrate) confetti();
  }
  function confetti() {
    if (reduced() || !dialog.open) return;
    const layer=document.getElementById('roletaConfetti');
    const width=dialog.clientWidth,height=dialog.clientHeight;
    const dpr=Math.min(devicePixelRatio || 1,2);layer.width=width*dpr;layer.height=height*dpr;
    const context=layer.getContext('2d');context.scale(dpr,dpr);
    const colors=['#f5dc91','#ffffff','#c2a260','#8f7745'];
    const pieces=Array.from({length:110},()=>({x:width/2,y:height*.28,vx:(Math.random()-.5)*12,vy:-Math.random()*12-3,size:3+Math.random()*5,angle:Math.random()*6,color:colors[Math.floor(Math.random()*colors.length)]}));
    let last=performance.now(),elapsed=0;
    function frame(now) {
      const delta=Math.min((now-last)/16.67,2);last=now;elapsed+=delta*16.67;
      context.clearRect(0,0,width,height);
      if (!dialog.open || elapsed>3500) return;
      for (const particle of pieces) {
        particle.x+=particle.vx*delta;particle.y+=particle.vy*delta;particle.vy+=.14*delta;particle.vx*=Math.pow(.992,delta);particle.angle+=.06*delta;
        context.save();context.globalAlpha=Math.min(1,(3500-elapsed)/800);context.translate(particle.x,particle.y);context.rotate(particle.angle);context.fillStyle=particle.color;context.fillRect(-particle.size/2,-particle.size/2,particle.size,particle.size*.5);context.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  async function load() {
    if (!token()) return;
    const response=await fetch('/api/store/roleta',{headers:headers()});
    if(response.status===410){dialog.close();document.getElementById('roletaBanner').hidden=true;return;}
    if(!response.ok)throw new Error('Entre novamente na sua conta para participar.');
    state=await response.json();showState();
    if(state.premio && !state.utilizado)await refresh();
  }
  document.getElementById('abrirRoleta').onclick=async()=>{
    if(!token()){location.href='/store/login?redirect='+encodeURIComponent(location.pathname);return;}
    wheelView.hidden=false;prizeView.hidden=true;button.disabled=true;dialog.showModal();
    try{await load();}catch(e){status.textContent=e.message;button.disabled=true;}
  };
  document.getElementById('fecharRoleta').onclick=()=>{if(!spinning)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(spinning)event.preventDefault();});
  document.getElementById('roletaBack').onclick=()=>{prizeView.hidden=true;wheelView.hidden=false;showState();button.focus();};
  button.onclick=async()=>{
    if(spinning)return;
    if(state?.premio){reveal();return;}
    spinning=true;showState();status.textContent='Aguarde o giro terminar para descobrir seu prêmio.';
    let won=false;
    try{
      const response=await fetch('/api/store/roleta',{method:'POST',headers:headers()});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message || 'A campanha terminou ou sua sessão expirou.');
      state=data;won=true;
      canvas.style.transition=reduced() ? 'none' : 'transform 7s cubic-bezier(.12,.67,.1,1)';
      // Nove voltas, com parada no centro do setor escolhido pelo servidor.
      canvas.style.transform=`rotate(${3240-(state.indice*72+36)}deg)`;
      await new Promise(resolve=>setTimeout(resolve,reduced() ? 0 : 7100));
    }catch(e){status.textContent=e.message;}
    finally{spinning=false;showState();}
    if(won){reveal(true);refresh().catch(console.error);}
  };
  async function refresh() {
    if (!document.getElementById('checkoutTotal') || !token()) return;
    const id = ++sequence;
    const items = JSON.parse(localStorage.getItem('fp_fitness_cart') || '[]').map(i => ({id_produto:i.id,quantidade:i.quantity}));
    const response = await fetch('/api/store/roleta/resumo', {method:'POST',headers:headers(),body:JSON.stringify({
      itens:items, taxa_entrega:window.shippingCost || 0,
      cupom_id:typeof currentCoupon !== 'undefined' && currentCoupon ? currentCoupon.id : null
    })});
    if (!response.ok) { if (response.status === 401) resetSummary(); return; }
    const data = await response.json();
    if (id !== sequence) return;
    if (!data.ativa) { resetSummary(); return; }
    window.roletaSummary=data;
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
  function resetSummary() {
    const hadSummary=Boolean(window.roletaSummary?.ativa);
    window.roletaSummary=null;
    document.getElementById('roletaBeneficio')?.remove();
    if (!hadSummary) return;
    if (typeof renderCheckoutPage === 'function') renderCheckoutPage();
    if (typeof recalculateTotal === 'function') recalculateTotal();
  }
  const deadline = Date.parse('2026-09-16T00:00:00-03:00');
  const expiryTimer = setInterval(() => {
    if (Date.now() < deadline) return;
    clearInterval(expiryTimer);
    dialog.close();
    document.getElementById('roletaBanner').hidden=true;
    resetSummary();
  }, 1000);
  window.refreshRoletaSummary=refresh;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>refresh().catch(console.error),150);};
  document.addEventListener('change',schedule);
  window.addEventListener('checkoutUpdated',schedule);
  load().catch(console.error);
})();
