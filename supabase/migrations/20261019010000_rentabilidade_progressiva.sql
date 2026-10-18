-- Rentabilidade progressiva por tempo de aplicação (ex.: CDB Neon 100% → 113% do CDI).
-- Modalidade adicional: ativos sem `progressiva` continuam com o cálculo convencional.
--
-- progressiva (jsonb), exemplo:
-- {
--   "faixas": [ {"inicio": 0, "unidade": "meses", "percentual": 100},
--               {"inicio": 6, "unidade": "meses", "percentual": 103}, ... ],
--   "retroativa": true,          -- a taxa da faixa vale desde a data da aplicação
--   "contagem": "individual"     -- cada aporte conta o próprio tempo ("compartilhada" = desde o 1º aporte)
-- }
alter table ativos
  add column progressiva   jsonb,
  -- Carência em dias corridos a partir de cada aplicação (ex.: 30 = resgate a partir do 31º dia).
  add column carencia_dias int check (carencia_dias is null or carencia_dias >= 0);

-- Resgate de uma aplicação específica (null = regra padrão: mais antigas primeiro).
alter table movimentacoes
  add column aplicacao_id uuid references movimentacoes(id) on delete set null;
