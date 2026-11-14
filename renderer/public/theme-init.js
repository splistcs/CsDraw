// Aplica o tema salvo antes de a interface carregar (arquivo externo: a CSP bloqueia scripts inline).
try {
  document.documentElement.dataset.theme = localStorage.getItem('csdraw-theme') === 'light' ? 'light' : 'dark';
} catch (error) {
  /* armazenamento indisponivel: mantem o tema escuro padrao */
}
