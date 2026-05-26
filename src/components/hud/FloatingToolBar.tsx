import { useLanguage } from '../../lib/i18n';

const tools = {
  zh: ['地球', '图层', '关系', '星光', '360'],
  en: ['Globe', 'Layers', 'Links', 'Starlight', '360'],
};

export default function FloatingToolBar() {
  const { language } = useLanguage();
  return (
    <div className="floating-toolbar" aria-label="Globe tools">
      {tools[language].map((tool) => (
        <button key={tool} type="button">
          {tool}
        </button>
      ))}
    </div>
  );
}
