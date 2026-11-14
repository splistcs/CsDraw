# CSDraw Desktop

App desktop (Electron + React) para Counter-Strike 2: quadro tático com adesivos de granadas, playbooks em Markdown, biblioteca de imagens/vídeos e **demo viewer 2D**. Tudo fica salvo localmente em um cofre criptografado, que pode ser exportado e importado.

## Rodar

Requer Node.js 22+.

```bash
npm install
npm run dev        # Vite + Electron com recarga automática
npm start          # compila e abre o app
npm test           # testes do núcleo (criptografia, cofre, parser, viewer)
npm run dist       # gera o instalador do SO atual (electron-builder) -> release/
```

## Abas

### Quadro tático
- **Mapa** no menu suspenso do cabeçalho (com o ícone de cada mapa). Mapas de dois andares (Nuke, Vertigo, Baggage) mostram os dois radares lado a lado; o botão de andares da barra enquadra “ver tudo / superior / inferior”.
- **Barra de ferramentas única** (sobre o mapa): mover, caneta, marca-texto, linha, seta, retângulo, elipse, texto, borracha, cor, espessura, desfazer, limpar, zoom, enquadrar, **filtros** (ocultar tipos de granada e/ou os desenhos) e atalhos.
- **Pan e zoom:** roda do mouse dá zoom no cursor; ferramenta “mover” (ou botão do meio) arrasta o mapa; o % da barra volta ao enquadramento.
- **Granadas:** arraste para o mapa (efeitos de fogo/fumaça/clarão/explosão; ícones em `public/grenades-board/`, separados dos do demo viewer). **Clique num adesivo** para abrir o painel deslizante da **direita**: anexe imagens (botão, arrastar ou Ctrl+V) e escreva a legenda de cada uma. Arrastar com uma ferramenta de desenho move o adesivo; duplo clique remove.
- **Desenhos salvos** ficam no painel deslizante da **esquerda** (a alça fica sempre visível). Clique num desenho para **abrir e editar de novo**; “Atualizar” sobrescreve, “Novo” começa outro; há aviso de alterações não salvas.
- **Anotações** em Markdown com preview (botão Editar alterna), salvas junto com o desenho.
- Atalhos: `Espaço` limpa (Ctrl+Z restaura) · `Ctrl+Z` desfaz · `D` caneta (de novo troca a cor) · `M` mover · `E` borracha · `T` texto · `F` enquadrar · `+`/`-` zoom · `H` lista de atalhos.

### Playbook
Editor de blocos **dinâmico, como o do Notion** (sem modo "preview": o que você escreve já aparece formatado). O arquivo continua sendo Markdown puro, com autosave; “Baixar .md” exporta em texto portável.
- **Blocos:** texto, títulos 1–4, lista com marcadores (com recuo/`Tab`), lista numerada, lista de tarefas, citação, bloco de código, divisor, desenho salvo, imagem/vídeo da biblioteca e **link (favorito)**.
- **Menu de blocos:** digite `/` (com filtro: `/tarefa`, `/titulo 2`…) ou clique no **`+`** à esquerda da linha. ↑/↓ navegam, `Enter` escolhe, `Esc` fecha.
- **Atalhos de Markdown:** `# `, `## `, `- `, `1. `, `[] `, `> `, `---`, ``` ` ``` ` ``` e, no texto, `**negrito**`, `*itálico*`, `~~riscado~~` e `` `código` `` viram formatação ao digitar. `Ctrl+B/I/E/K` e `Ctrl+Shift+S`; ao selecionar texto aparece a barra de formatação.
- **Mover linhas:** arraste pela alça `⋮⋮` à esquerda (leva os itens filhos juntos) ou use `Ctrl+Shift+↑/↓`. Clique na alça para **duplicar, excluir ou transformar** o bloco. `Ctrl+D` duplica.
- **Links:** cole uma URL numa linha vazia para virar um cartão (clique abre no navegador); com texto selecionado, colar uma URL cria um link. `Ctrl+Z`/`Ctrl+Y` desfazem e refazem.
- Tabelas e outros trechos Markdown sem bloco próprio aparecem como bloco “Markdown” (clique duas vezes para editar) e são preservados.
- Código: `renderer/src/modules/playbook/editor/` (`blocks.js` converte Markdown ↔ blocos; `inline.js` o texto inline; `BlockEditor.jsx` o editor).

### Mídia
Explorador de pastas para imagens e vídeos (player com busca). Importe por botão ou arrastando; arraste itens para uma pasta para movê-los.

### Demo viewer
- **Biblioteca (explorer):** ao abrir a aba sem demo carregada, aparece a lista de demos como num explorer: miniatura do mapa, placar, times, **tags**, botão **▶ 2D**, menu (renomear/excluir), filtro por mapa, busca e ordenação, agrupada por dia de envio. Arraste `.dem` para qualquer lugar da lista (ou “Enviar demo”). A análise é local e o resultado fica salvo (criptografado) — reabrir é instantâneo.
- **Ícone do jogador no radar:** a **vida** aparece no próprio corpo (a calota escura do topo cresce conforme a vida cai), o **kit de defuse** do CT vira um selo no canto inferior direito, quem está **cego** ganha um aro branco com os segundos restantes e a **granada na mão** aparece com o PNG dela ao lado do corpo.
- **Replay 2D em tela cheia:** radar com pan/zoom, painel dos times (vida, arma, dinheiro, colete e **granadas que cada jogador carrega**), seletor de rounds (cor do lado vencedor, linha pontilhada na troca de lados) e linha do tempo com freezetime, fase da bomba, abates e **uma linha colorida para cada utilidade arremessada** (smoke cinza, flash amarela, HE vermelha, molotov/incendiária laranja, decoy roxa; passe o mouse para ver quem jogou).
- **Utilidades animadas:** a **smoke e o fogo da molotov se espalham pelo chão do mapa** a partir de onde a granada parou (a máscara de chão vem do próprio radar, então não atravessam paredes). Uma **HE que explode dentro da smoke abre um buraco** (a fumaça só se afasta ali, sem contorno) que fecha em poucos segundos. A flash dá um halo grande e suave (branco no centro, cinza nas bordas) e a HE um **pulso laranja rápido** que ocupa só a área afetada (o mesmo chão da smoke, sem atravessar paredes). Cada granada deixa a **trajetória real** (saindo da mão do jogador até onde parou), em **azul** se foi lançada por um CT e **laranja** por um TR, sem variar pelo tipo.
- **Granadas, C4 e kits de defuse no chão.** Duas fontes, nesta ordem:
  - **Entidades da própria demo** (`electron/core/demo/WeaponDrops.js`, exige o `parseWeapons` do `@laihoe/demoparser2`; atualize com `npm install @laihoe/demoparser2@latest`). O parser entrega, **a cada tick dos rounds**, as armas sem dono (posição que o servidor simulou: queda, rolagem, tombo; mais quem as largou por último). Cada passagem contínua de uma entidade pelo chão é um drop: aparece quando foi largado (inclusive a granada que cai na morte, que é a que o jogo escolheu), segue o **percurso real** (`path`: `[segundos desde o drop, x, y, z]` a cada mudança de posição, com o instante exato em que para) e some no tick em que alguém a pega (ou fica até o fim do round). Largar e pegar de volta várias vezes por segundo gera um drop por passagem. Entidades sem dono por ≤ 3 ticks, ou curtas e junto de um `weapon_fire`, são a arma sumindo num arremesso e não contam. Esta leitura cobre as granadas (todas, se o parser entregou alguma), a C4 e o kit **se aparecerem nos dados** (o kit pode não ser uma entidade de arma).
  - **Reserva** (`DropTracker.js` + `DropPhysics.js`), usada para o que a leitura acima não cobre, ou em tudo se o parser for antigo, falhar ou não entregar granadas: deduz os drops de `item_remove`/`item_pickup`, da morte e da variação do inventário, e estima onde o item para.
    - **Morte:** cai **uma única granada, a mais cara do inventário** (como `mp_death_drop_grenade 1`; incendiária/molotov, smoke, HE, flash, decoy; o empate smoke/HE fica com a smoke, ajustável em `DEATH_GRENADE_PRIORITY`), mais a C4 e o kit. As outras somem com o jogador. **O kit de defuse só cai na morte** (o jogo não deixa largá-lo): perder `has_defuser` entre quadros ou um `item_remove` de kit nunca vira drop.
    - **Largar de propósito:** cada `item_remove` que não seja morte, arremesso ou início de round. **Pegar:** `item_pickup`/`bomb_pickup` fecham o drop do mesmo tipo mais plausível; o inventário que cresceu só conta sem `item_pickup` na demo.
    - **Onde para:** modelo de queda/rolagem (olhar, velocidade do jogador) corrigido pelo lugar de quem pegou (`DropPhysics.js`); o viewer corta o trajeto onde o radar deixa de ser chão.
    - **Leitura extra:** 1 e 6 ticks antes de cada morte e `item_remove` (inventário exato e velocidade).
  - No viewer, o item segue o `path` (altura do ícone vinda do `z` real) e some em `until`; sem `path`, desliza até `toX/toY` como antes.
  - Para ver o que o parser entrega na sua demo: `npm run inspect-demo -- partida.dem --probe` (seção `parseWeapons`).
  - Demos analisadas com versão de análise < 11 são reanalisadas ao reenviar o arquivo. O mesmo vale quando a demo foi lida por **outra versão do `@laihoe/demoparser2`** que a instalada (a versão do leitor fica gravada em cada demo; `ParserVersion.js`). Se uma demo não carregar, a mensagem diz qual leitor falhou e sugere atualizar o CSDraw.
- **C4:** quem carrega a bomba ganha um selo de C4 no radar e no painel; a bomba largada fica no chão como as granadas.
- **Ícones de armas:** o painel mostra o ícone da arma principal (ou pistola) ao lado do nome e o killfeed (abates recentes, canto superior esquerdo) replica o do jogo: quem matou, **assistente** (com o ícone de flash quando foi assistência de flash), **cego**, ícone da arma (a faca específica, se houver PNG), **sem mira**, **através da fumaça**, **parede** e **headshot**; mortes sem atacante (queda, bomba, mapa) mostram só a arma. Os PNG ficam em `renderer/public/weapons/` (veja o `LEIAME.txt` de lá); sem arquivo, aparece o nome da arma.
- **Brilho do mapa:** configurações (engrenagem) → “Brilho do mapa” (80–200%, padrão 125%, fica salvo).
- **Item na mão:** o boneco muda conforme o que o jogador segura, na direção do olhar: **arma = retângulo** (cano mais longo quanto mais cara a arma: pistola curta, AK média, AWP/M249 longa; tabela em `core/WeaponPrices.js`), **faca = ponta triangular**, **granada = ícone da granada** ao lado do corpo. Regras em `core/HeldItem.js`.
- **Cegueira:** contorno branco colado ao boneco do jogador cego, com os segundos restantes embaixo.
- **Nomes dos times** vêm da demo (`team_clan_name`, comum em partidas de campeonato/scrim); sem eles aparecem Team Alpha/Bravo.
- **Contador das smokes:** anel laranja no radar que se esvazia (18 s) com os segundos restantes no centro.
- **setpos:** passe o mouse no nome do jogador no painel para ver `setpos x y z;setang pitch yaw 0` daquele instante; clique para copiar (use com `sv_cheats 1`).
- **Anotações** sobre o mapa com as mesmas ferramentas do quadro (sem adesivos), sem salvar; `C` limpa.
- **Dois andares:** com “dividir andares” ligado mostra os dois radares; desligado, enquadra um andar e `L` alterna entre eles.
- Atalhos (botão ⌨ ou `H`): `Espaço` play/pause · `← →` ±5 s (Shift 1 s, Ctrl 0,1 s) · `Shift+↑/↓` velocidade · `J/K` round anterior/próximo · `D` desenhar · `M` mover · `C` limpar · `L` andar · `F` freezetime · `Ctrl+Z` · `+`/`-`.

### Idiomas
Português (BR), English, Español e Русский — menu ao lado do interruptor de tema. Para adicionar outro, crie `renderer/src/i18n/locales/<codigo>.js` com as mesmas chaves de `pt-BR.js` e registre em `locales/index.js` (o teste `npm test` acusa chave faltando).

## Atualizações automáticas (GitHub Releases)

O app instalado verifica se há versão nova ~10 s após abrir e a cada 4 h, baixa em segundo plano e mostra um aviso **“Reiniciar e atualizar”** (se o usuário não clicar, instala ao fechar o app). O link **Atualizações** no cabeçalho verifica na hora. Seus dados ficam em `<userData>/vault`, fora da pasta do app, e não são tocados pela atualização. Código: `electron/core/update/UpdateService.js` (+ `ipc/UpdateIpc.js`, `shell/UpdateBanner.jsx`).

**Configurar uma vez**
1. Em `package.json` → `build.publish`, troque `SEU-USUARIO` pelo dono do repositório no GitHub (e `repo`, se o nome for outro). Enquanto estiver como `SEU-USUARIO`, a atualização fica desativada.
2. `npm install` (instala o `electron-updater` e atualiza o `package-lock.json`; faça commit dos dois).

**Publicar uma versão**
1. Aumente `version` no `package.json` e faça commit.
2. `git tag v2.1.0 && git push origin v2.1.0` (a tag tem que ser `v` + a versão do `package.json`).
3. O workflow `.github/workflows/release.yml` roda os testes, gera os instaladores (Windows/macOS/Linux) e os anexa a um **rascunho** de release. Revise e clique em **Publish release**: só então os apps instalados enxergam a versão.

**Limites**
- **Windows:** funciona sem certificado, mas o instalador não assinado dispara o aviso do SmartScreen.
- **macOS:** o auto-update só funciona com app **assinado e notarizado** (conta Apple Developer; segredos `CSC_LINK`/`CSC_KEY_PASSWORD`, veja o workflow). Sem isso, o aviso oferece “Baixar manualmente” (abre a página de releases).
- **Linux:** só atualiza o **AppImage**.
- Em `npm run dev`/`npm start` (app não empacotado) a atualização fica desativada. `CSDRAW_NO_UPDATE=1` a desativa também no app instalado.

## Dados e criptografia

- Não há mais conta/cadastro: o app é local e de um único usuário.
- Tudo (biblioteca, desenhos, playbooks, imagens e vídeos) fica em `<userData>/vault`, **criptografado em disco** (AES-256-GCM em blocos de 64 KiB; permite buscar dentro de vídeos sem descriptografar o arquivo inteiro). A chave do cofre é protegida pelo chaveiro do sistema (Electron `safeStorage`); se o SO não oferecer um, a chave fica em arquivo local e o diálogo de exportação avisa.
- **Exportar** gera um único arquivo `.csdraw` com tudo, criptografado por uma senha sua (scrypt + AES-256-GCM). **Importar** pode juntar (o registro mais recente vence) ou substituir tudo. Sem a senha não há recuperação.
- O SQLite da versão web foi substituído pelo cofre criptografado: SQLite puro não criptografa o arquivo (isso exigiria SQLCipher, um módulo nativo).
- Segurança do Electron: `contextIsolation` + `sandbox`, ponte mínima no preload, IPC validado (origem e dados), CSP restritiva, protocolo `csdraw-media://` somente leitura, SVG não aceito como mídia, navegação externa bloqueada.

## Imagens

- Radares dos mapas: `renderer/public/maps/<slug>.png` (1024×1024; slugs em `shared/constants/MapCatalog.js`) já vêm instalados, inclusive `nuke-lower`, `vertigo-lower` e `baggage-lower` (mapas de dois andares). Ícones dos mapas (menu de seleção de mapa do quadro): `renderer/public/mapicons/<slug>.png` (sem arquivo, usa o radar). A lista de demos usa o radar como miniatura. Mapas sem radar (Agency, Basalt, Alpine, Stronghold, Warden, Sanctum, Brewery, Safehouse, Pool Day, Canals) usam um quadro genérico; basta adicionar o PNG.
- Ícones das granadas: `renderer/public/grenades/{he,flash,smoke,molotov,incendiary,decoy}.png` (fundo transparente). Sem arquivo, usa emoji (quadro) ou ícone vetorial (demo viewer). Servem ao quadro e ao demo viewer (inventário, chão e granada em voo).
- Ícones de armas e C4: `renderer/public/weapons/<arma>.png` (ak47, m4a1_silencer, awp, usp_silencer, knife, c4…; lista no `LEIAME.txt`). Sem arquivo, usa o nome da arma.

## Demo viewer: observações

- Calibração do radar (`modules/demo-viewer/core/MapCalibration.js`): valores oficiais para Ancient, Anubis, Dust II, Inferno, Mirage, Nuke, Overpass, Train, Vertigo, Office, Italy, Baggage e Shoots. Os demais mapas (e qualquer um cuja tabela erre o chão) são **alinhados automaticamente pela imagem do radar** (`CalibrationFit`: as posições dos jogadores na demo precisam cair sobre o chão), com aviso de “aproximado” nas configurações. Se desalinhar, use **Auto-ajustar** ou acrescente a linha com os valores do `overview` do jogo. O corte de altura entre os andares é conhecido para Nuke e Vertigo; para Baggage é estimado pelas alturas dos jogadores na demo.
- Demos `.dem.bz2` precisam ser descompactadas antes.
- Demos analisadas com uma versão anterior do formato (sem inventário, C4, arma principal, trajetórias, cegueira, drops ou nomes dos times) continuam abrindo, mas sem esses dados: arraste o mesmo `.dem` de novo e ela é reanalisada no mesmo registro (tags e nome ficam).
- Para depurar uma demo real: `npm run inspect-demo -- caminho/partida.dem` (resumo) ou `-- partida.dem --raw` (formato bruto dos eventos). Com `-- partida.dem --probe` mostra como o parser entrega `inventory`, `pitch`, `team_clan_name`, as trajetórias (`parseGrenades`), `player_blind` e `item_pickup`.

## Estrutura

```
electron/
  main.js, preload.cjs
  app/        ServiceContainer, MainWindow, IpcRegistry, MediaProtocol
  ipc/        Drawing/Playbook/Media/Vault/Demo (um arquivo por área)
  core/       crypto/ vault/ transfer/ demo/ validation/ errors/   (sem dependência do Electron)
renderer/src/
  shell/      cabeçalho, abas, navegação, exportar/importar
  shared/     api, constantes, motor de desenho, markdown, ui
  modules/    board/  playbook/  media/  demo-viewer/   (cada aba é independente; registro em modules/index.js)
test/         node:test (núcleo e viewer)
scripts/      inspect-demo.mjs, electron-smoke.mjs
```

O demo viewer só depende de `window.csdraw.demo` e de utilitários de `shared/`; para removê-lo basta tirar a linha em `modules/index.js` e a pasta.

## Smoke test do app real

`scripts/electron-smoke.mjs` abre o Electron de verdade (em Linux: `xvfb-run -a npm run smoke` com `SMOKE_DATA=/tmp/dados`), exercita IPC, protocolo de mídia, menu do adesivo, playbook, mídia, demo viewer (com demo sintética) e exportar/importar, e salva screenshots.
