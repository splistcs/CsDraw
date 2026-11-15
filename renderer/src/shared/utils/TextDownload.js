export class TextDownload {
  static save(fileName, content, mime = 'text/markdown;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  static slugify(text, fallback = 'file') {
    const slug = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || fallback;
  }
}
