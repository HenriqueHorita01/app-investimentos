# App de Investimentos — Especificação

App pessoal para acompanhar investimentos, aportes, dividendos e dinheiro reservado para objetivos.

## 1. Conceito central

O dinheiro tem duas dimensões:

- **Onde está** → o ativo (FII, ação, CDB, Tesouro…).
- **Para que serve** → o objetivo (viagem, compra futura, presente…).

Um ativo pode servir vários objetivos. O que não está alocado é **livre**.

- **Patrimônio livre** = só o **excedente** gerado pelos investimentos: rendimento da renda fixa (saldo − aplicado) + dividendos/JCP de ações e FIIs. O dinheiro investido é de longo prazo ("esquecido") e não entra; a valorização das cotas também não (só existe se vender). Ex.: 10.000 em CDB + 500 em ações, CDB rendeu 100 e ações pagaram 5 → patrimônio livre = 105.
- O que está reservado para objetivos continua sendo investimento (aparece na Carteira e rende), mas o rendimento dessa parte vai para o objetivo, não para o patrimônio livre.
- **Reserva de emergência** é um destino especial (objetivo do tipo `reserva_emergencia`, um por usuário): qualquer parte de um investimento pode ir para ela. Fica fora do patrimônio e tem aba própria para acompanhar saldo, meta e rendimento.
- Um investimento pode ser dividido entre vários destinos: ex. 1.000 = 200 objetivo A + 300 objetivo B + 500 reserva (ou livre). A Carteira mostra essa divisão em barra e %.

### Glossário (padrão em todas as telas)

- **Patrimônio livre**: o excedente gerado pelos investimentos (rendimentos da renda fixa + dividendos). Aparece no Início.
- **Investido**: parte de um investimento que não está na Reserva nem em objetivos — o dinheiro de longo prazo. É a base da aba Minha Carteira.
- **Reserva**: parte destinada à reserva de emergência (cor azul-celeste).
- **Objetivo**: parte separada para um gasto futuro (cor do objetivo).
- Aba **Ativos** (antiga "Carteira"): lista de investimentos e para onde vai o dinheiro de cada um.

## 2. Stack

| Camada | Escolha |
|---|---|
| Front-end | React + Vite + TypeScript, PWA (instalável no celular) |
| Estilo | Tailwind CSS, tema claro e escuro |
| Banco e login | Supabase (Postgres + Auth + RLS) |
| Rotinas diárias | Supabase Edge Functions + pg_cron |
| Hospedagem | Vercel (deploy automático a cada push) |
| Gráficos | Recharts |

Segredos só em variáveis de ambiente (`.env.local`, Vercel, Supabase). Nunca no código: o repositório é público.

## 3. Entidades

Schema completo em `supabase/migrations/`.

| Tabela | Conteúdo |
|---|---|
| `ativos` | ticker/nome, tipo, instituição, indexador (CDI, IPCA, pré), taxa contratada, vencimento |
| `movimentacoes` | data, ativo, tipo (aporte, resgate, dividendo, jcp, amortizacao, ajuste), quantidade, preço unitário, valor total |
| `cotacoes` | ativo, data, preço de fechamento |
| `cdi_diario` | data, taxa diária (% a.d.) |
| `proventos` | ativo, data-com, data de pagamento, valor por cota, status, quantidade elegível, valor previsto, valor recebido |
| `objetivos` | nome, valor-alvo, prazo, cor |
| `alocacoes` | objetivo, ativo, valor alocado |

Toda tabela de usuário tem `user_id` e RLS: cada usuário só vê os próprios dados.

## 4. Regras de cálculo

### Renda variável (FII, ação)
- Quantidade = Σ quantidade dos aportes − Σ quantidade dos resgates.
- Custo médio = custo total das compras ÷ quantidade comprada. Resgate não muda o custo médio.
- Valor atual = quantidade × última cotação.
- Variação = valor atual − (quantidade × custo médio).
- Retorno total = variação + Σ proventos recebidos.

### Renda fixa pós-fixada (CDB % CDI)
- Rende só em dias úteis.
- Fator do dia = 1 + (CDI do dia × percentual contratado).
- Saldo bruto = valor aplicado × Π fatores desde a data da aplicação.
- O CDI muda → só os dias seguintes mudam. Passado é fixo.
- Cada aporte é um lote com data própria (IR depende da idade do lote).

### Aplicações individuais (renda fixa)
- Cada aporte de CDB, LCI/LCA ou Tesouro é uma **aplicação** com taxa, indexador, vencimento, liquidez e carência próprios (vazios = herdam do ativo).
- Rendimento por dia útil, por aplicação: % do CDI; Prefixado `(1+taxa)^(1/252)`; Selic ≈ CDI × `(1+taxa)^(1/252)`; IPCA+ `(1+IPCA do mês)^(1/dias úteis do mês) × (1+taxa real)^(1/252)` ("na curva"; IPCA ainda não divulgado = último conhecido, marcado como estimativa).
- Cada aplicação para de render no próprio vencimento. Resgates saem das aplicações mais antigas primeiro (PEPS).
- IPCA mensal: BCB SGS 433 (reserva: IBGE SIDRA 1737).

### Impostos (estimativa de saldo líquido)
- IR regressivo sobre o ganho de **cada aplicação**, pelo prazo dela (nunca uma alíquota única para o grupo): até 180 dias 22,5%; 181–360 20%; 361–720 17,5%; acima de 720 15%.
- IOF regressivo nos primeiros 30 dias.
- FII: rendimento isento para pessoa física.
- JCP: 15% retido na fonte.
- Mostrar sempre **bruto** e **líquido estimado**.

### Objetivos e alocações
- A reserva é feita **por lançamento**: cada aporte/resgate tem um destino (`movimentacoes.objetivo_id`; vazio = livre).
- Cada destino tem sua própria parte do ativo: cotas (renda variável) ou saldo corrido pelo CDI (renda fixa). O rendimento dessa parte **vai para o objetivo**.
- Livre do ativo = valor atual da parte sem objetivo.
- Progresso do objetivo = Σ valor atual das partes do objetivo ÷ valor-alvo.
- Resgate de um destino não pode passar do disponível naquele destino (validado no front).
- Desistir do objetivo (excluir) ou trocar o destino do lançamento devolve o valor ao livre.
- A tabela `alocacoes` (valor fixo) ficou sem uso no front após essa decisão.

## 5. Proventos: projeção e confirmação

### Status

| Status | Origem | Confiança |
|---|---|---|
| `estimado` | Último valor oficial anunciado do ativo | Baixa |
| `anunciado` | Comunicado oficial do mês | Alta |
| `a_confirmar` | Data de pagamento já passou | — |
| `recebido` | Confirmado ou ajustado pelo usuário | Exata |

### Fluxo
1. No início do mês, cada FII/ação ganha um provento `estimado` com o último valor por cota oficial.
2. Quando sai o comunicado do mês, o valor é substituído e o status vira `anunciado`.
3. Quantidade elegível = cotas na **data-com**, não hoje.
4. Passou a data de pagamento → `a_confirmar`.
5. O usuário clica **Confirmar** (valor previsto) ou **Ajustar valor** (digita o que caiu no extrato).
6. Ao confirmar, gera uma `movimentacao` do tipo `dividendo` com o valor real.
7. Também existe **Confirmar todos** para o fim do mês.

### Previsão do mês
- Total previsto = recebidos + a confirmar + anunciados + estimados + rendimento estimado da renda fixa.
- Renda fixa: saldo × CDI atual × percentual × dias úteis restantes no mês.
- A cada aporte novo, a previsão é recalculada na hora.
  - Aporte antes da data-com → entra no mês.
  - Depois da data-com → só no mês seguinte. O app avisa.
- Histórico "previsto × realizado" por mês mostra o quanto a estimativa acerta.

### Casos que geram erro e como tratar
- Valor anunciado diferente da estimativa → o anúncio sempre substitui.
- Compra após a data-com → não conta.
- Desdobramento/grupamento → ajustar quantidade e preço (tipo `ajuste`).
- Amortização → devolve capital, reduz custo, não é rendimento.
- O extrato da corretora é sempre a verdade final.

## 6. Fontes de dados externas

| Dado | Fonte | Frequência |
|---|---|---|
| CDI diário | API do Banco Central, SGS série 12 | Diária, dias úteis |
| Cotações | brapi.dev (fallback: entrada manual) | Diária, após o fechamento |
| Proventos anunciados | brapi.dev (fallback: entrada manual) | Diária |

- Rotinas rodam em Edge Functions agendadas com pg_cron.
- Toda informação pode ser editada manualmente.
- Guardar a data da última atualização e mostrar no app.

## 7. Telas

Referência visual em `docs/telas/` (arquivos `.dc.html`). Tema claro e escuro.

1. **Início**: patrimônio total, investido, previsto no mês, barra livre × reservado, resumo dos objetivos.
2. **Carteira**: pizza por tipo, filtros, lista de ativos com valor e variação.
3. **Objetivos**: reservado × livre, cards com progresso, prazo e ativos usados.
4. **Novo lançamento**: abas aporte/resgate/dividendo, ativo, data, quantidade, preço, total, objetivo opcional.
5. **Detalhe do ativo**: cotas, custo médio, cotação, variação, retorno com proventos, histórico de proventos, uso por objetivo.
6. **Proventos do mês**: total previsto, barra por status, card de confirmação, lista por ativo.

7. **Reserva**: saldo bruto da reserva de emergência, aplicado, rendimento e CDI atual.

Navegação inferior: Início, Carteira, Objetivos, Reserva, Lançar.

### Paleta
| Uso | Claro | Escuro |
|---|---|---|
| Fundo | `#F3F4F6` | `#0E1116` |
| Cartão | `#FFFFFF` | `#171B22` |
| Texto | `#12161C` | `#E8EAED` |
| Texto secundário | `#5B6470` | `#9AA3AE` |
| Livre / positivo | `#0F6E52` | `#3DBE8E` |
| Reservado | `#D9822B` | `#E59A4E` |
| Negativo | `#B42318` | `#F87171` |
| FIIs (gráfico) | `#2F5BD3` | `#6B8EF0` |

Fontes: DM Sans (texto), DM Mono (números).

## 8. Fases

1. **MVP**: login, ativos, lançamentos, cotação manual, carteira, início.
2. **Objetivos**: objetivos e alocações.
3. **Dados automáticos**: CDI diário, cotações, CDB calculado.
4. **Proventos**: projeção, status e confirmação.
5. **Extras**: gráficos de evolução, previsto × realizado, IPCA+ e prefixado, importação de nota de corretagem.

## 9. Decisões tomadas

- Site responsivo (PWA), não app nativo.
- Alocação por valor fixo em reais.
- Usuário único no início, mas com login e RLS desde o começo.
- (14/10/2026) Patrimônio livre = rendimentos da renda fixa + dividendos (investido e valorização ficam fora). Reservado para objetivo não conta como patrimônio; rendimento da parte reservada vai para o objetivo; reserva de emergência em aba própria (desde 15/10/2026 é um destino que recebe partes de investimentos, não mais o ativo inteiro); CDI automático (Fase 3) antecipado.

## 10. Em aberto

- ~~O rendimento do valor reservado vai para o objetivo ou fica livre?~~ Decidido: vai para o objetivo.
- Dividendos de cotas reservadas: hoje não são atribuídos ao objetivo (proventos não fazem parte do patrimônio).
