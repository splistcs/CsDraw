import Markdown, { defaultUrlTransform } from 'react-markdown';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import remarkGfm from 'remark-gfm';
import { EmbeddedContent } from './EmbeddedContent.jsx';
import { EmbedTokens } from './EmbedTokens.js';

const urlTransform = (url) => (EmbedTokens.parse(url) ? url : defaultUrlTransform(url));

const components = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ node, src, alt }) => <EmbeddedContent src={src} alt={alt} />
};

/** Preview de Markdown (seguro: sem HTML cru) com suporte a desenhos/midias do cofre. */
export function MarkdownView({ source, emptyMessage }) {
  const { t } = useI18n();
  return (
    <div className="md-preview">
      {source.trim() ? (
        <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>{source}</Markdown>
      ) : (
        <p className="md-empty">{emptyMessage ?? t('common.nothing')}</p>
      )}
    </div>
  );
}
