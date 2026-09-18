# Allan Cristian — apresentação pelo editor HTML/CSS

Remodelação aplicada ao tenant `cristian-barbearia` pelo editor administrativo existente, sem registrar outro renderer ou alterar componentes compartilhados.

## Arquivos e edição

- `layout.html`: estrutura para a aba Código HTML/CSS, com logo, serviços, equipe, agenda e contatos usando componentes `barber-*`.
- `styles.css`: estilos exclusivos sob `.ac-site`, incluindo cartões, equipe e agenda. As variáveis `--ac-ink`, `--ac-paper` e `--ac-blue` no início controlam a paleta desta composição. Este CSS sobrepõe as cores do tema base; ajustar a paleta aqui.
- O componente `<barber-whatsapp />` mantém o acesso flutuante ao WhatsApp cadastrado para a barbearia. Sem número válido no cadastro, o botão fica oculto. Para atualizar o destino, edite o campo WhatsApp da barbearia na administração.
- Esta alteração do botão está preparada nos arquivos locais e ainda precisa ser salva, aprovada e publicada pelo Site Workspace. Em 18/09/2026, o site local não pôde ser conferido porque a API em `localhost:4000` estava indisponível.
- `logo.webp`: logo original fornecida pelo usuário, compactada pelo próprio editor. Carregar no campo Logotipo do modo Visual, com descrição acessível. O componente `barber-logo` reutiliza essa imagem no cabeçalho, na capa e no rodapé.

Não importar estes arquivos como renderer: são a cópia revisável da configuração salva. Alterações locais só aparecem no site após serem aplicadas pelo editor, salvas, aprovadas e publicadas. Serviços, valores, duração, profissionais e contatos são dados do Core, não destes arquivos.

## Direção visual

Azul-marinho, azul-claro e papel claro. Capa assimétrica com logo em arco, títulos grandes com contraste entre Arial e Georgia, cartões com canto inferior recortado por curva e agenda com fundo azul. Navegação em duas linhas e composição em coluna no celular. Foco de teclado visível e respeito à preferência de movimento reduzido.

## Entrega e reversão

Publicado no ambiente local em 14/09/2026: versão 6 (`cmu1gy9nh000008wjgtfswlkp`). Site: `http://cristian-barbearia.localhost:3000`. A versão 4 anterior permanece no histórico do editor para restauração. Não representa deploy remoto.

Atualização de localização: versão 7 publicada pelo mesmo editor, com `<barber-map class="ac-location" />` na seção de contato. O componente revisado apresenta mapa, links para Google Maps, Waze e Apple Maps, compartilhamento nativo, cópia do link e alternativa manual. O endereço continua sendo lido da unidade; não há coordenadas ou endereço fixados no HTML. A versão 6 permanece restaurável. O mapa foi conferido carregado com marcador no endereço cadastrado.

Validações: HTML/CSS e configuração aceitos pelo validador do Core; lint passou; typecheck passou (18 pacotes); 226 testes passaram (19 arquivos); build passou (18 pacotes). Revisão visual da página publicada no desktop e celular; largura de 320 px sem transbordamento horizontal; três instâncias da logo carregadas; link de reserva transfere foco para a agenda; seleção de serviço identifica o profissional e habilita a data. Nenhuma reserva real foi criada durante a verificação.

Refinamento minimalista: as ações de localização ficam recolhidas sob um único ícone de compartilhamento junto ao endereço. O painel oferece Google Maps, Waze, Apple Maps, compartilhamento nativo e cópia, com fechamento por Escape e clique fora.

Revisão 8: substitui o pôster em arco por .ac-brand-panel, com logo sem recortes, fundo suave e cantos de 24 px. No celular, usa disposição horizontal com logo de até 150 px e espaçamento reduzido; no desktop, logo centralizada de até 280 px. Alteração feita pelo editor HTML/CSS, preservando os dados e componentes do Core.
