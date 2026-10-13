# Tema Halloween reversível da loja pública

## Objetivo

Aplicar um tema Halloween elegante somente à loja pública da FitPro Store, sem alterar o painel administrativo, o PDV ou as regras comerciais. O tema deve poder ser controlado pelo painel e retornar integralmente ao visual atual quando estiver inativo.

## Escopo

O tema alcança todas as rotas públicas sob `/store`, incluindo home, catálogo, promoções, detalhe do produto, carrinho, checkout, conta, login, redefinição de senha e políticas.

Ficam fora do escopo:

- painel administrativo e PDV;
- mudanças em preços, descontos, frete, estoque ou checkout;
- áudio, sustos, cursores personalizados ou animações contínuas;
- criação de uma plataforma genérica de campanhas sazonais.

## Decisão arquitetural

O backend resolverá o estado do tema antes de renderizar cada página. Essa abordagem evita o piscar do tema normal enquanto o navegador aguarda uma API e mantém o comportamento uniforme mesmo com JavaScript desabilitado.

O estado será controlado por três configurações persistidas na tabela `Configuracao`:

- `STORE_HALLOWEEN_MODE`: `auto`, `on` ou `off`;
- `STORE_HALLOWEEN_START`: data inicial no formato ISO `YYYY-MM-DD`;
- `STORE_HALLOWEEN_END`: data final no formato ISO `YYYY-MM-DD`.

Configuração inicial:

- modo: `auto`;
- início: `2026-10-13`;
- fim: `2026-10-31`.

### Precedência

| Modo | Resultado |
|---|---|
| `on` | Tema ativo, independentemente das datas |
| `off` | Tema inativo, independentemente das datas |
| `auto` | Tema ativo somente dentro do período configurado |

O período automático é inclusivo: começa às 00:00 da data inicial e termina às 23:59:59 da data final, no fuso `America/Fortaleza`.

Valores ausentes, datas inválidas, período invertido ou falha de leitura resultam no tema normal. O site nunca deve deixar de renderizar por causa da campanha.

## Componentes

### Resolvedor do tema

Um módulo pequeno e testável concentrará leitura, validação e cálculo do estado. Ele retorna um objeto com:

- tema ativo ou inativo;
- modo configurado;
- datas válidas, quando presentes;
- motivo do estado, para exibição no painel.

As rotas não duplicarão regras de data.

### Contexto das páginas públicas

O blueprint da loja disponibilizará o estado resolvido aos templates. Quando ativo, o documento receberá `data-store-theme="halloween"` e carregará o CSS sazonal. Quando inativo, nenhum seletor ou arquivo sazonal interferirá na página.

A home possui documento próprio e as demais páginas herdam `store/base.html`; ambos usarão a mesma variável e o mesmo componente visual compartilhado.

### Controles administrativos

A página `loja_online.html` receberá um cartão “Tema sazonal da loja” com:

- indicador do estado efetivo: ativo ou inativo;
- seletor `Automático`, `Forçar ativado` e `Forçar desativado`;
- datas de início e fim;
- explicação breve da precedência;
- botão “Salvar tema da loja”.

As configurações serão salvas pelo endpoint administrativo autenticado já existente. A interface validará campos obrigatórios e ordem das datas; o backend continuará sendo a fonte final de validação.

## Direção visual

O tema será “Halloween elegante”, mantendo a identidade da FitPro e usando a sazonalidade como camada, não como substituição da marca.

### Tokens

- preto FitPro: `#121110`;
- painel vinho: `#18100F`;
- vinho profundo: `#4B1F2E`;
- dourado FitPro: `#E0B431`;
- âmbar queimado: `#D97824`;
- dourado lunar: `#E9C777`.

As famílias `Big Shoulders Display` e `Manrope` permanecem. Fotografias, nomes, preços e informações de produto não recebem filtros que prejudiquem cor ou leitura.

### Aplicação

- faixa sazonal discreta no topo com “Halloween FitPro — até 31 de outubro”;
- lua e morcegos estilizados na home, sem cobrir a modelo ou as chamadas principais;
- teias muito sutis em cantos de cabeçalho ou rodapé;
- âmbar nos estados de destaque e chamadas sazonais;
- decoração reduzida em produto, carrinho e checkout;
- checkout, conta e login preservam aparência confiável, recebendo apenas tokens e detalhes pequenos.

Elementos decorativos serão implementados com CSS ou SVG local, sem dependência de terceiros. Movimentos serão pontuais e desativados por `prefers-reduced-motion`.

## Isolamento e reversibilidade

Todas as regras sazonais ficarão em `frontend/css/store-halloween.css` e serão limitadas por `[data-store-theme="halloween"]`. Elementos exclusivos também dependerão do estado resolvido no servidor.

Desativar o tema remove o atributo, o arquivo sazonal e os componentes decorativos da resposta renderizada. Não será necessário novo deploy para voltar ao visual normal.

## Fluxo de dados

1. Um administrador abre “Loja Online”.
2. A página carrega as configurações existentes e mostra o estado efetivo.
3. O administrador escolhe modo e datas e salva.
4. O endpoint autenticado persiste os valores.
5. Em cada requisição pública, o resolvedor calcula o estado usando o horário de Fortaleza.
6. O template carrega ou omite a camada Halloween conforme o resultado.

## Tratamento de erros

- Dados inválidos enviados pelo painel retornam erro de validação e não substituem uma configuração válida.
- Erro ao salvar mantém os campos na tela e apresenta orientação objetiva.
- Erro ao resolver o tema produz o tema normal e registra diagnóstico no servidor.
- Recursos decorativos não bloqueiam conteúdo ou navegação se falharem.

## Testes

### Automatizados

- `on` sempre ativa e `off` sempre desativa;
- `auto` antes, durante e depois do período;
- início e fim inclusivos;
- horário de Fortaleza;
- datas ausentes, inválidas ou invertidas;
- presença do atributo e do CSS quando ativo;
- ausência completa da camada quando inativo;
- endpoint administrativo exige administrador e valida os valores.

### Verificação visual

Serão conferidas em desktop e celular:

- home;
- catálogo e promoções;
- detalhe do produto;
- carrinho e checkout;
- conta, login e redefinição;
- políticas.

Também serão verificados contraste, foco de teclado, redução de movimento, ausência de sobreposição sobre produtos e estabilidade da barra fixa superior.

## Implantação e retorno

O deploy pode ser feito com o modo `off`, permitindo publicar e validar sem exposição pública. Depois, as datas são salvas e o modo muda para `auto`.

Para retorno imediato, o administrador seleciona `Forçar desativado`. Como segunda camada de segurança, remover as configurações ou o CSS sazonal também faz o resolvedor cair no tema normal.
