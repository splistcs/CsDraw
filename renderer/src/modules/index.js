import BoardModule from './board/BoardModule.jsx';
import DemoViewerModule from './demo-viewer/DemoViewerModule.jsx';
import MediaModule from './media/MediaModule.jsx';
import PlaybookModule from './playbook/PlaybookModule.jsx';

/**
 * Registro de modulos. Cada modulo e autossuficiente (pasta propria) e recebe { isActive }.
 * Para remover/adicionar uma aba basta editar esta lista.
 */
export const MODULES = [
  { id: 'board', label: 'Quadro tático', Component: BoardModule },
  { id: 'playbook', label: 'Playbook', Component: PlaybookModule },
  { id: 'media', label: 'Mídia', Component: MediaModule },
  { id: 'demo', label: 'Demo viewer', Component: DemoViewerModule }
];
