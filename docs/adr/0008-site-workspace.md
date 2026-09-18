# ADR — Workspace administrativo de sites

## Decisão

Substituir o builder visual administrativo por arquivos de apresentação interpretados: HTML, CSS, conteúdo e assets raster. Reutilizar o Core, a autoridade SUPER_ADMIN e a publicação transacional existentes. Guardar assets limitados no snapshot JSON para manter isolamento e rollback atômico, sem storage público por caminho arbitrário.

Biblioteca de utilidades CSS local revisada, aplicada antes do CSS autoral. Não usar runtime Tailwind por CDN nem aceitar pacotes executáveis. Componentes registrados recebem somente dados públicos do Core. Pacote portátil versionado não carrega identidade ou autoridade.

## Consequências

A liberdade de composição fica no HTML/CSS; novos comportamentos continuam sendo código revisado da plataforma. Importar não publica. Sites visuais legados permanecem compatíveis enquanto a administração passa exclusivamente ao workspace. Limites de assets, SEO por iframe e página única estão em SITE_EDITOR.md. Sem migration, backend duplicado ou servidor MCP adicional.
