# Custom design e operação bespoke

Bespoke significa uma apresentação desenvolvida pela equipe para a identidade de uma barbearia. O builder oferece escolhas controladas ao próprio cliente. Ambos usam a mesma infraestrutura, modelos e regras do Core.

## Briefing

`DesignBrief` reúne marca atual, público, posicionamento, diferenciais, Instagram, concorrentes, referências visuais, estilos desejados, cores preferidas/proibidas, fotografias, vídeos, elementos desejados/rejeitados e observações. Referências são insumos de direção visual, não autorização para copiar material protegido ou usar dados de outra empresa.

A entrega de design deve registrar direção visual, hierarquia, fontes permitidas, tokens, composição de páginas e comportamento mobile. Imagens, fontes e animações precisam de orçamento de performance e alternativas acessíveis.

## Estados do projeto

```text
BRIEFING → DESIGN → DEVELOPMENT → REVIEW → APPROVED → PUBLISHED
                                 ↓           ↑
                         CHANGES_REQUESTED → DEVELOPMENT → REVIEW
```

As transições exigem ator autorizado e histórico. A aprovação refere-se a uma versão identificável; qualquer alteração posterior cria nova revisão e invalida a aprovação daquela nova revisão. Um tenant só acessa briefing, preview e versões próprios.

## Preview e versões

Antes de publicação, disponibilizar preview autenticado ou por token com validade, escopo e revogação. O token não pode conferir acesso administrativo. Responder com `noindex`/`X-Robots-Tag`, não incluir preview em sitemap e evitar indexação de links de revisão. `noindex` não substitui autenticação.

Manter separadas a versão em preparação, a versão aprovada e a versão publicada. Publicação deve atualizar a referência ativa em uma transação, produzir auditoria e invalidar cache. Rollback escolhe versão anterior compatível do mesmo tenant sem apagar histórico. O fluxo completo é Fase 4; Foundation fornece modelo, contratos e demonstrações do engine, sem prometer gestão de projetos produtiva.

## Regras técnicas

1. Nunca criar novo backend para um site customizado.
2. Nunca duplicar regras de negócio.
3. Concentrar customização na apresentação.
4. Reutilizar componentes Core quando atendem à experiência.
5. Criar componentes bespoke quando a composição ou identidade exige.
6. Todo design precisa ser responsivo.
7. Todo design precisa possuir preview.
8. Todo design precisa possuir versão.
9. Toda alteração precisa ser reversível.

CSS customizado permanece desabilitado até existir validação e isolamento adequados. Sua futura implementação terá limites de tamanho, propriedades, seletores e URLs, escopo exclusivo do site público e sanitização; não alcançará dashboard/admin. Nunca aceitar JavaScript arbitrário do tenant. Código de um tema desenvolvido pela equipe segue o mesmo review e CI do restante do projeto.
