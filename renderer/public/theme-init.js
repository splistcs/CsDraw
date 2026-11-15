try {
  document.documentElement.dataset.theme = localStorage.getItem('csdraw-theme') === 'light' ? 'light' : 'dark';
} catch (error) {
}
