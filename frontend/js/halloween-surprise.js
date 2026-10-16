(() => {
  'use strict';
  const button = document.getElementById('halloweenSurpriseButton');
  const dialog = document.getElementById('halloweenSurpriseDialog');
  if (!button || !dialog || typeof dialog.showModal !== 'function') return;

  function updateCampaign() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type).value;
    const date = `${value('year')}-${value('month')}-${value('day')}`;
    button.hidden = date < '2026-10-16' || date > '2026-10-31';
    if (button.hidden && dialog.open) dialog.close();
    if (date === '2026-10-31') {
      document.getElementById('hs-description').textContent =
        'O Halloween chegou! Explore as promoções disponíveis na loja e descubra o que combina com seu próximo treino.';
    }
  }
  updateCampaign();
  button.addEventListener('click', () => {
    updateCampaign();
    if (!button.hidden && !dialog.open) dialog.showModal();
  });
  dialog.querySelector('.hs-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { if (!button.hidden) button.focus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCampaign(); });
})();
