# Plano — aba "Minha Carteira"

Planejamento, simulação e acompanhamento dos aportes de longo prazo, **integrado** ao app atual
(mesmo banco, mesmos ativos, mesmos lançamentos). Nada existente é removido.

## Decisões (15/10/2026)

- **Navegação**: 6ª aba própria, "Minha Carteira" — organização nova, voltada a investimentos majoritariamente futuros. A aba Carteira atual continua igual.
- **O que conta nos %**: só a parte **Livre** dos ativos (reserva e objetivos ficam fora).
- **Dividendos/juros**: contam como valor livre da carteira (no saldo a investir), com ações rápidas **Reinvestir** ou **Retirar da carteira** (comum no começo, quando o valor não compra uma cota).
- **Percentual de cada ativo**: % da carteira total; os ativos de uma categoria somam o % da categoria (ex.: FIIs 20% = 4 × 5%).
- **Entrega**: 4 etapas.

## Revisão (19/10/2026)
- Os aportes **não** seguem o simulador todo mês (nem proporcional nem rebalanceamento de todos os ativos). Por isso **saem do escopo**: botão Confirmar, `carteira_aportes`, `carteira_caixa`, `aporte_id`/`taxas` e o histórico planejado × realizado. As compras continuam sendo lançadas normalmente (link "Lançar" em cada linha do simulador).
- Da etapa 3 fica só um lembrete no Simulador: dividendos recebidos em "Investido" desde o último aporte, com "Somar ao valor".
- Etapa 4 (Acompanhamento) feita sem tabelas novas, só a partir dos lançamentos: aplicado (principal), valor atual, rendimento, dividendos e retorno total; planejado × atual por categoria (base aplicado ou valor atual); evolução mensal do aplicado; retorno por investimento.

## 1. Como o app funciona hoje (base da integração)

| Peça | O que é | Como a Minha Carteira usa |
|---|---|---|
| `ativos` | Cada investimento (FII, ação, CDB…), com taxa, vencimento, instituição | Continua sendo **o** cadastro de investimentos. Ganha campos de planejamento (categoria, % alvo, preço de referência, mínimo de aplicação, liquidez). |
| `movimentacoes` | Aportes, resgates, dividendos, ajustes; cada um com um **destino** (`objetivo_id`) | Continua sendo a fonte das posições. Compras confirmadas na Minha Carteira viram lançamentos aqui. Ganha `taxas` e o vínculo com o aporte do mês. |
| Destinos | Livre / Reserva de emergência / objetivos | **Só a parte Livre** de cada ativo entra na Minha Carteira. Reserva e objetivos ficam de fora (reserva totalmente separada, como pedido). |
| `cotacoes` | Preço por ticker e data (manual) | Preço unitário da simulação e valor de mercado. Atualização manual com data, como hoje. |
| `cdi_diario` + cálculo | Saldo de renda fixa dia útil a dia útil | Valor atual de CDB/LCI/LCA atrelados ao CDI. Tesouro IPCA+ e prefixados: saldo pelo extrato ("Corrigir saldo"), até existir a série do IPCA. |
| `calcularPosicao` (`calculos.ts`) | Posição por destino (cotas, custo, valor) | Base de "distribuição atual". O simulador e as prioridades são funções novas e puras, com testes. |

Hoje a parte Livre tem só **ITUB4**; o resto está na Reserva ou em objetivos. A carteira começa a partir daí.

## 2. Banco de dados (novas migrations, nada é apagado)

1. **`carteira_categorias`** — `id, user_id, nome, percentual (0–100), ordem, cor, tipos_padrao (tipo_ativo[])`.
   - Semente: Alternativa B (CDB pós 20, LCI/LCA 20, Tesouro IPCA+ 20, FIIs 20, Ações BR 10, ETF internacional 10).
   - Soma = 100% validada no front e por função no banco (aviso, não bloqueio, enquanto edita).
2. **`ativos`** ganha colunas (todas opcionais):
   - `categoria_id` → categoria da carteira (null = fora da carteira);
   - `percentual_alvo` → % da carteira total (null = **pendente de configuração**);
   - `preco_referencia` (para quem ainda não tem cotação), `aplicacao_minima`, `incremento_minimo`, `liquidez` (`diaria`, `no_vencimento`, `d+n`), `lote` (padrão 1).
   - Tipos novos liberados no cadastro: **LCI/LCA, Tesouro, ETF** (já existem no enum do banco).
3. **`carteira_aportes`** — o aporte do mês: `id, user_id, data, valor_novo` (dinheiro próprio), `modo` (proporcional/rebalanceamento), `plano` (jsonb com a simulação aceita, para comparar planejado × realizado), `observacao`.
4. **`movimentacoes`** ganha `aporte_id` (vínculo com o aporte do mês) e `taxas` (corretagem/emolumentos).
5. **`carteira_caixa`** — **saldo não investido** como livro-caixa: `data, tipo (entrada_aporte | sobra | provento | venda | compra | retirada | aplicado_em), valor, aporte_id, movimentacao_id`.
   - Saldo = soma das linhas. Sem rendimento fictício.
   - Dividendo/juros recebido em ativo da carteira entra como `provento`; ações rápidas: **Reinvestir** (usa no simulador) ou **Retirar** (linha `retirada`, sai da carteira).
   - Se o saldo for aplicado num produto remunerado, ele vira um ativo normal (categoria "Caixa" fora dos %), e a linha `aplicado_em` registra isso.
6. Enum `tipo_movimentacao` ganha `juros` (cupom/juros recebidos) e `venda` é tratado como `resgate` com observação (sem mudar o que existe).

RLS por `user_id` em todas as tabelas novas, como no resto do projeto.

## 3. Regras de cálculo (funções puras + testes)

- **Valor da carteira** = Σ parte **Livre** dos ativos com categoria + saldo em caixa.
- **Distribuição atual** por categoria e por ativo = valor ÷ valor da carteira.
- **Desvio** = % atual − % alvo, em pontos percentuais.
- **Necessidade em R$** = alvo × (carteira + aporte) − valor atual (só positivos: nunca sugere venda).
- **Prioridade** (combina desvio relativo e valor, não só R$):
  - `relativo = (alvo − atual) / alvo`;
  - Alta: relativo ≥ 25% **e** necessidade ≥ preço de 1 unidade/mínimo; Média: 10–25%; Equilibrado: ±10%; Acima da meta: < −10% ("aguardar").
  - Ordenação por `relativo`, desempate pela necessidade em R$ e pela viabilidade (dá para comprar ao menos 1 unidade/mínimo?).
- **Modo A — proporcional**: aporte × % de cada ativo (categoria → ativos).
- **Modo B — rebalanceamento** (sem vender): metas sobre (carteira + aporte + caixa); distribui o dinheiro primeiro para os maiores déficits relativos; o que sobra segue os %.
- **Quantidades inteiras**: FII/ação/ETF compram `floor(valor ÷ preço)` (ações pelo fracionário: 1 em 1). Renda fixa respeita **aplicação mínima** e **incremento**.
- **Sobras**: redistribuídas em ordem de prioridade enquanto couber 1 unidade; o resto fica no **caixa** para o mês seguinte. Nunca passa do orçamento.
- **Ajustes manuais**: na simulação dá para mudar quantidades/valores; o total é revalidado contra o orçamento.
- **Compensação entre meses**: como o Modo B olha a carteira real, comprar "a mais" em FIIs num mês faz FIIs ficarem acima da meta e o próximo aporte priorizar o resto.

## 4. Fluxo de uso

1. **Planejamento**: categorias e %; ativos de cada categoria com % (ou pendentes); ITUB4 já aparece, basta escolher a categoria.
2. **Simulador**: informa o valor do mês, escolhe Modo A ou B, vê a tabela (planejado, ideal, preço, quantidade, efetivo, sobra) e a distribuição **antes × depois**. Pode ajustar.
3. **Confirmar**: só aqui o patrimônio muda. Cria o `carteira_aporte`, os lançamentos de compra (com taxas) e as linhas de caixa (entrada e sobra).
4. **Prioridades**: lista ordenada, com cores, barras, desvio em p.p., necessidade em R$ e "dá para comprar?".
5. **Acompanhamento**: patrimônio da carteira, total aportado (só dinheiro novo), rendimentos e dividendos, ganho/perda, distribuição planejada × atual, evolução mensal e histórico.

## 5. Interface

- Mantém identidade visual (paleta do SPEC, cartões, barras, `BarraDestinos`).
- 4 áreas como sub-abas: **Planejamento · Simulador · Prioridades · Acompanhamento**.
- Gráficos simples: barras planejado × atual, barra empilhada da distribuição, linha da evolução (SVG próprio, sem biblioteca nova).

## 6. Entregas (cada etapa publicada e testada)

1. Banco + Planejamento (categorias, %, ativos, pendentes, novos tipos).
2. Simulador (Modos A e B, quantidades inteiras, mínimos, ajustes) + Prioridades.
3. Confirmação de aportes, caixa (saldo não investido) e histórico.
4. Acompanhamento (indicadores, distribuição, evolução, rendimentos/dividendos sem dupla contagem).

## 7. Riscos e cuidados

- **Preços**: sem integração automática ainda; o simulador usa a última cotação ou o preço de referência e mostra a data.
- **Tesouro IPCA+**: valor pelo extrato até termos a série do IPCA.
- **Dividendos**: se forem para o caixa e depois reinvestidos, contam uma vez (entrada de provento no caixa → compra sai do caixa; não é "aporte novo").
- **Telas atuais**: Início, Carteira, Objetivos, Reserva e Lançar continuam funcionando; os cálculos atuais não mudam.
