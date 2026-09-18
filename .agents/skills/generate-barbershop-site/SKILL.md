---
name: generate-barbershop-site
description: Criar sites exclusivos de barbearias em HTML/CSS e integrar arquivos ao Site Workspace do admin global, com componentes do Core, assets, prévia e versões. Usar para criar ou substituir um site por código; não para alterar catálogo ou regras da agenda.
---

# Gerar e implementar um site

Leia `docs/SITE_EDITOR.md` e o contrato `packages/theme-engine/src/site-editor.ts`. Identifique a barbearia de destino e sua identidade visual antes de gravar no admin. Use o tenant informado ou evidenciado na sessão; IDs de arquivos importados nunca autorizam acesso.

Crie uma pasta de entrega com `index.html`, `styles.css`, `content.json` e, quando necessárias, imagens em `assets/`. O HTML é fragmento sem doctype/head/body. Use HTML semântico para composição exclusiva e componentes registrados para serviços, equipe, contato, localização e reserva. Consulte `studioComponents` e `studioUtilities` em `packages/theme-engine/src/site-assets.ts` para os componentes e a biblioteca de classes disponível. Não suponha que classes arbitrárias do Tailwind serão compiladas.

Todos os componentes aceitam classe própria. Personalize tanto o wrapper quanto os seletores internos pelo CSS. Preserve a agenda e os preços como dados dinâmicos do Core; não crie formulários que simulem confirmação. Para depoimentos, FAQ e imagens de marca, use os campos de `content` e `sections`; não invente avaliações ou fatos comerciais.

`content.json` contém exatamente `{ tokens, content }`. Os campos obrigatórios de content são title, description, heroTitle, heroSubtitle e sections. Os defaults de tokens podem ser `{}`. Assets: PNG/JPEG/WebP até 58 KiB cada, máximo 10; use nomes simples e referências `assets/nome.webp`, alt descritivo e loading="lazy". Não incluir dados de produção, secrets, scripts, SVG, fontes ou arquivos de backend.

Execute `pnpm site:pack <pasta> <destino.site.json>`; o comando valida o contrato real e não sobrescreve entregas anteriores. Corrija erros, confira hierarquia, responsividade e teclado. Execute os gates exigidos por AGENTS.md se houver mudança no repositório.

Para implementar, use a sessão administrativa disponível para abrir `/tenants/<id>/website`, importar o pacote, atualizar a prévia e salvar rascunho. Use os endpoints documentados apenas com autenticação e Origin legítimos; nunca grave versões diretamente no banco ou promova usuário para contornar acesso. Sem sessão disponível, entregue o pacote validado e informe que a importação permanece pendente.

Aprovar/publicar/restaurar respeita o escopo que o usuário autorizou. Publicação só pode usar a revisão efetivamente salva e aprovada. Confira a resposta do backend e o site público antes de afirmar publicação. Não criar MCP ou infraestrutura paralela quando o contrato existente basta.
