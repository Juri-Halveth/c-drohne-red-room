const search = document.getElementById('audit-search');
const count = document.getElementById('audit-count');
const cards = [...document.querySelectorAll('.audit-card')];
const groups = [...document.querySelectorAll('.audit-group')];
let filter = 'ALLE';
function updateAudit() {
  const term = search.value.trim().toLocaleLowerCase('de');
  let visible = 0;
  for (const card of cards) {
    const show = (filter === 'ALLE' || card.dataset.status === filter) && card.textContent.toLocaleLowerCase('de').includes(term);
    card.hidden = !show;
    if (show) visible++;
  }
  for (const group of groups) group.hidden = !group.querySelector('.audit-card:not([hidden])');
  count.textContent = `${visible} von 72 Fragen sichtbar.`;
}
search.addEventListener('input', updateAudit);
for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    updateAudit();
  });
}
for (const link of document.querySelectorAll('.audit-jump a')) {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target && target.hidden) {
      search.value = '';
      filter = 'ALLE';
      document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === 'ALLE')));
      updateAudit();
    }
  });
}
