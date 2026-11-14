import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Blocks } from '../renderer/src/modules/playbook/editor/blocks.js';
import { InlineMarkdown } from '../renderer/src/modules/playbook/editor/inline.js';

const SAMPLE = `# Título C#

Texto com **negrito**, *itálico*, ~~riscado~~, \`código\` e [link](https://a.com/x).

- item 1
  - filho
    - neto
- [x] feito
- [ ] a fazer

1. um
1. dois

> citação

---

\`\`\`js
const a = 1;
\`\`\`

![Meu desenho](csdraw-drawing:abc123)
![Foto](csdraw-media:m9)

https://exemplo.com/pagina

| a | b |
|---|---|
| 1 | 2 |

\\# não é título
`;

test('editor: Markdown vira blocos com os tipos e recuos certos', () => {
  const types = Blocks.parse(SAMPLE).map((b) => `${b.type}${b.indent ? `:${b.indent}` : ''}`);
  assert.deepEqual(types, ['h1', 'text', 'bullet', 'bullet:1', 'bullet:2', 'todo', 'todo', 'number', 'number', 'quote', 'divider', 'code', 'drawing', 'media', 'link', 'raw', 'text']);
});

test('editor: ler e gravar de novo e estavel e preserva desenhos, midias e links', () => {
  const once = Blocks.serialize(Blocks.parse(SAMPLE));
  assert.equal(Blocks.serialize(Blocks.parse(once)), once);
  for (const part of ['![Meu desenho](csdraw-drawing:abc123)', '![Foto](csdraw-media:m9)', 'https://exemplo.com/pagina', '| a | b |', '# Título C#', '- [x] feito']) {
    assert.ok(once.includes(part), part);
  }
});

test('editor: texto que parece sintaxe de bloco e protegido ao gravar', () => {
  for (const text of ['# nao titulo', '- nao lista', '1. nao lista', '> nao citacao', '---', '```', 'https://so-texto.com']) {
    const md = Blocks.serialize([Blocks.create('text', { text })]);
    const [block] = Blocks.parse(md);
    assert.equal(block.type, 'text', text);
    assert.equal(InlineMarkdown.toPlain(block.text), text);
  }
});

test('editor: texto inline escapa e interpreta so formatacao conhecida', () => {
  assert.equal(InlineMarkdown.toHtml('a **b *c***'), 'a <b>b <i>c</i></b>');
  assert.equal(InlineMarkdown.toHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.equal(InlineMarkdown.toHtml('[x](javascript:alert(1))'), 'x');
  assert.equal(InlineMarkdown.toHtml('[f](https://pt.wikipedia.org/wiki/A_(filme))'), '<a href="https://pt.wikipedia.org/wiki/A_(filme)">f</a>');
  assert.equal(InlineMarkdown.toHtml('\\*nao\\* snake_case'), '*nao* snake_case');
});

test('editor: numeracao reinicia depois de outro bloco', () => {
  const list = Blocks.parse('1. a\n1. b\n\ntexto\n\n1. c');
  assert.deepEqual(Blocks.numbering(list), [1, 2, null, 1]);
});

test('editor: familia de uma lista inclui os itens filhos (arrastar leva junto)', () => {
  const list = Blocks.parse('- a\n  - b\n  - c\n- d');
  assert.deepEqual(Blocks.family(list, 0), [0, 3]);
  assert.deepEqual(Blocks.family(list, 3), [3, 4]);
});
