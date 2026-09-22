# Melhorias sistêmicas priorizadas

Este backlog considera o MVP atual e não declara recursos futuros como concluídos.

## Prioridade alta

1. **Convites e recuperação com acompanhamento** — registrar envio, entrega, expiração e reenvio de convites/verificação sem expor tokens; hoje existe disparo de redefinição, mas não uma caixa de saída administrativa completa.
2. **Proteções adicionais de conta** — adicionar 2FA/passkeys, política de senha comprometida e trilha de alterações de e-mail antes da operação comercial. Essas proteções continuam futuras.
3. **Gestão de acesso em lote** — oferecer transferência segura de propriedade, convite por função e suspensão em lote, sempre preservando ao menos um OWNER ativo.
4. **Auditoria consultável** — criar timeline com ator, ação, alvo, data/fuso e filtros; os eventos já são persistidos, mas ainda não possuem uma tela dedicada.
5. **Cobertura E2E dos novos detalhes** — validar senha, revogação de sessão, vínculo, catálogo e expediente no Chromium desktop/mobile, incluindo conflito e perda de sessão.

## Prioridade média

6. **Escalas avançadas no admin global** — expor escalas individuais, bloqueios, feriados e exceções usando os mesmos contratos da agenda, com confirmação para alterações que afetem reservas.
7. **Edição completa de catálogo** — permitir alterar todos os campos de serviço/profissional no back-office, não apenas criar, ativar e desativar; manter controle de versão e filtros por unidade.
8. **Configuração orientada por checklist** — reunir plano, unidade, equipe, serviços, horários, domínio e publicação em um progresso de implantação derivado de dados reais.
9. **Busca e filtros operacionais** — paginação e busca no catálogo, equipe, vínculos e auditoria para evitar listas extensas sem navegação.
10. **Notificações operacionais** — centralizar falhas de e-mail/WhatsApp, tentativas e reenvio; nunca mostrar credenciais do provider no painel.

## Prioridade estrutural

11. **Privacidade e retenção** — fechar política de exclusão/anonymização de usuários e clientes, exportação e retenção antes de oferecer hard-delete.
12. **Observabilidade por tenant** — métricas, logs redigidos e correlação de jobs por tenant, sem permitir consulta cruzada por membros comuns.
13. **Defesa de banco complementar** — avaliar RLS e ampliar constraints compostas onde novos relacionamentos tenant-scoped forem adicionados.
14. **Performance e cache seguro** — adicionar cache somente com chave de tenant, invalidação explícita e testes A/B; não cachear respostas administrativas sensíveis por padrão.
15. **Recuperação operacional** — exercícios de backup/restore, rollback de migrations e runbooks para falha de provider, filas e indisponibilidade parcial.

