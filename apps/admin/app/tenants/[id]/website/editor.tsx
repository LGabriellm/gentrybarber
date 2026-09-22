'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { siteEditorConfigSchema, defaultSiteHtml, defaultSiteCss, studioComponents, siteAssetSchema, parseSiteProject, exportSiteProject, type SiteEditorConfig, type PublicSiteData } from '@platform/theme-engine';
import { CodeSite, classicTokens, themeRegistry } from '@platform/themes';
import { websiteAction } from './actions';
import './website.css';

export interface WebsiteEditorData { config: SiteEditorConfig; themeId: string; latestId: string | null; status: string | null; publishedId: string | null; themes: { id: string; key: string; name: string }[]; data: PublicSiteData; history: { id: string; number: number; themeName: string; status: string; createdAt: string }[] }
type FileTab = 'html' | 'css' | 'content' | 'assets';
function initialCode(config: SiteEditorConfig) { return { ...config.code, enabled: true, html: config.code?.html ?? defaultSiteHtml, css: config.code?.css ?? defaultSiteCss }; }
const labels: Record<string, string> = { DRAFT: 'Rascunho', APPROVED: 'Aprovado', PUBLISHED: 'Publicado' };
export function WebsiteEditor({ id, initial }: { id: string; initial: WebsiteEditorData }) {
  const router = useRouter();
  const [config, setConfig] = useState<SiteEditorConfig>({ ...initial.config, code: initialCode(initial.config) });
  const [content, setContent] = useState(JSON.stringify({ tokens: initial.config.tokens, content: initial.config.content }, null, 2));
  const [tab, setTab] = useState<FileTab>('html');
  const [dirty, setDirty] = useState(!initial.config.code?.enabled);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(config);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  function change(next: SiteEditorConfig) { setConfig(next); setDirty(true); setMessage(''); }
  function validated() {
    const metadata: unknown = JSON.parse(content);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(key => !['tokens', 'content'].includes(key))) throw new Error('content.json aceita somente tokens e content.');
    return siteEditorConfigSchema.parse({ ...config, ...metadata, code: { ...config.code!, enabled: true } });
  }
  function failure(err: unknown) { setError(err instanceof Error ? err.message : 'Não foi possível completar a operação.'); }
  function updatePreview() { try { setPreview(validated()); setError(''); setMessage('Prévia atualizada. Agendamento demonstrativo.'); } catch (err) { failure(err); } }
  async function perform(operation: 'save' | 'approve' | 'publish' | 'rollback', versionId = initial.latestId) {
    if (busy || operation !== 'save' && dirty) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await websiteAction(id, operation === 'save' ? 'drafts' : 'transitions', operation === 'save' ? { expectedVersionId: initial.latestId, themeId: initial.themeId, config: validated() } : { action: operation, versionId, expectedPublishedId: initial.publishedId });
      if (result.error) setError(result.error);
      else { setDirty(false); setMessage({ save: 'Rascunho salvo.', approve: 'Versão aprovada.', publish: 'Versão publicada.', rollback: 'Versão restaurada.' }[operation]); router.refresh(); }
    } catch (err) { failure(err); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true); setError('');
    try {
      const selected = Array.from(files);
      if (selected.length > 12 || new Set(selected.map(file => file.name)).size !== selected.length) throw new Error('Selecione até 12 arquivos com nomes únicos.');
      const project = selected.find(file => file.name.endsWith('.site.json'));
      if (project) {
        if (selected.length !== 1 || project.size > 950000) throw new Error('Importe um único projeto .site.json até 950 KB.');
        const imported = parseSiteProject(await project.text()).config;
        change({ ...imported, code: initialCode(imported) });
        setContent(JSON.stringify({ tokens: imported.tokens, content: imported.content }, null, 2));
      } else {
        let next = validated();
        for (const file of selected) {
          if (file.name === 'index.html' || file.name === 'styles.css') {
            if (file.size > (file.name === 'index.html' ? 120000 : 80000)) throw new Error('Arquivo de código excede o limite.');
            next = { ...next, code: { ...next.code!, [file.name === 'index.html' ? 'html' : 'css']: await file.text() } };
          } else if (file.name === 'content.json') {
            if (file.size > 900000) throw new Error('Conteúdo excede 900 KB.');
            const meta = JSON.parse(await file.text()) as Record<string, unknown>;
            if (!meta || Array.isArray(meta) || Object.keys(meta).some(key => !['tokens', 'content'].includes(key))) throw new Error('content.json inválido.');
            next = { ...next, tokens: meta.tokens, content: meta.content } as SiteEditorConfig;
          } else {
            if (file.size > 58 * 1024) throw new Error('Cada imagem deve ter até 58 KiB.');
            const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
            const asset = siteAssetSchema.parse({ name: file.name, src });
            next = { ...next, code: { ...next.code!, assets: [...(next.code?.assets ?? []).filter(item => item.name !== asset.name), asset] } };
          }
        }
        next = siteEditorConfigSchema.parse(next); change(next); setContent(JSON.stringify({ tokens: next.tokens, content: next.content }, null, 2));
      }
      setMessage('Arquivos importados para edição. Salve um rascunho para persistir.');
    } catch (err) { failure(err); }
    finally { setBusy(false); }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportSiteProject(validated())], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${initial.data.tenant.slug}.site.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { failure(err); }
  }
  return <div className="site-studio">
    <div className="studio-toolbar"><div><span className="studio-kicker">SITE WORKSPACE</span><h2>{initial.data.tenant.name}</h2><p>{dirty ? 'Alterações não salvas' : labels[initial.status ?? ''] ?? 'Novo projeto'} · {initial.publishedId ? 'Site publicado' : 'Sem publicação'}</p></div><div className="studio-actions"><button className="button secondary" disabled={busy || !ready} onClick={download}>Exportar projeto</button><button className="button secondary" disabled={busy || !ready || !initial.themeId || !dirty && !!initial.latestId} onClick={() => void perform('save')}>Salvar rascunho</button><button className="button secondary" disabled={busy || !ready || dirty || initial.status !== 'DRAFT'} onClick={() => void perform('approve')}>Aprovar versão</button><button className="button" disabled={busy || !ready || dirty || initial.status !== 'APPROVED'} onClick={() => void perform('publish')}>Publicar site</button></div></div>
    {error && <p role="alert" aria-label="Erro no editor" className="admin-feedback">{error}</p>}{message && <p role="status">{message}</p>}
    {!initial.config.code?.enabled && <p className="studio-notice">Este site usa uma apresentação anterior. O novo projeto só substituirá o site após salvar, aprovar e publicar.</p>}
    <div className="studio-workspace"><aside className="studio-files"><h3>Arquivos</h3><nav aria-label="Arquivos do site">{([['html', 'index.html'], ['css', 'styles.css'], ['content', 'content.json'], ['assets', 'assets/']] as const).map(([key, label]) => <button key={key} disabled={!ready} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav><label className="studio-upload">Importar arquivos<input aria-label="Importar arquivos do site" type="file" multiple accept=".html,.css,.json,.png,.jpg,.jpeg,.webp" disabled={busy || !ready} onChange={event => { void upload(event.target.files); event.target.value = ''; }} /></label><p>index.html, styles.css, content.json, imagens PNG/JPEG/WebP ou projeto .site.json.</p><details><summary>Componentes do Core</summary><p>Insira o componente e personalize sua classe em styles.css.</p>{studioComponents.map(([tag, label, selector]) => <div className="studio-component" key={tag}><strong>{label}</strong><code>{`<${tag} class="meu-${tag.slice(7)}" />`}</code><small>{selector}</small><button disabled={busy || !ready} onClick={() => { change({ ...config, code: { ...config.code!, html: `${config.code!.html}\n<${tag} class="meu-${tag.slice(7)}" />` } }); setTab('html'); }}>Inserir {label.toLowerCase()}</button></div>)}</details><details><summary>Classes utilitárias</summary><p>Biblioteca Studio incluída: container, flex, grid, flex-col, flex-wrap, items-center, justify-between, gap-2/4/8, p-4/8, py-16, w-full, text-center, text-sm/xl, font-bold, rounded, grid-cols-2/3. Grades viram uma coluna no celular. Sobrescreva pelo CSS.</p></details></aside>
    <section className="studio-code" aria-label="Editor de arquivos"><div className="studio-code-heading"><strong>{({ html: 'index.html', css: 'styles.css', content: 'content.json', assets: 'assets/' })[tab]}</strong><span>UTF-8</span></div>{tab === 'assets' ? <div className="studio-assets"><p>Até 10 imagens, 58 KiB cada. Use <code>{'<img src="assets/foto.webp" alt="Descrição" loading="lazy" />'}</code> no HTML. Arquivos ficam na versão deste site.</p>{config.code?.assets?.map(asset => <article key={asset.name}><strong>{asset.name}</strong><code>assets/{asset.name}</code><button disabled={busy || !ready} onClick={() => change({ ...config, code: { ...config.code!, assets: config.code!.assets!.filter(item => item.name !== asset.name) } })}>Remover {asset.name}</button></article>)}</div> : <textarea aria-label={tab === 'html' ? 'Código HTML' : tab === 'css' ? 'Código CSS' : 'Conteúdo JSON'} spellCheck={false} disabled={busy || !ready} value={tab === 'content' ? content : config.code![tab]} onChange={event => { if (tab === 'content') { setContent(event.target.value); setDirty(true); } else change({ ...config, code: { ...config.code!, [tab]: event.target.value } }); }} />}<footer>HTML semântico · CSS isolado · Componentes conectados ao Core</footer></section>
    <section className="studio-preview"><div className="studio-preview-heading"><strong>Prévia</strong><button aria-pressed={mobile} onClick={() => setMobile(!mobile)}>{mobile ? 'Celular · 390 px' : 'Computador'}</button><button disabled={busy} onClick={updatePreview}>Atualizar prévia</button></div><div className={`studio-canvas ${mobile ? 'studio-mobile' : ''}`}><CodeSite data={{ ...initial.data, ...preview, preview: true }} defaults={themeRegistry.get(initial.themes.find(theme => theme.id === initial.themeId)?.key ?? '')?.tokens ?? classicTokens} /></div></section></div>
    <section className="studio-history"><h3>Histórico de versões</h3><p>Salvar cria uma revisão. Aprovar e publicar usam exatamente a revisão salva.</p>{initial.history.length ? <ul>{initial.history.map(version => <li key={version.id}><strong>Versão {version.number}</strong><span>{labels[version.status] ?? version.status}{version.id === initial.publishedId ? ' · No ar' : ''}</span><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time>{version.status === 'PUBLISHED' && version.id !== initial.publishedId && <button disabled={busy || dirty} onClick={() => void perform('rollback', version.id)}>Restaurar versão {version.number}</button>}</li>)}</ul> : <p>Nenhuma versão salva.</p>}</section>
  </div>;
}
