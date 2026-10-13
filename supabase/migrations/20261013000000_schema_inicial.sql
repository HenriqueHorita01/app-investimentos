-- Schema inicial do App de Investimentos
-- Ver SPEC.md para as regras de negócio.

-- ============ Tipos ============
create type tipo_ativo as enum ('fii', 'acao', 'cdb', 'lci_lca', 'tesouro', 'etf', 'outro');
create type indexador as enum ('cdi', 'ipca', 'pre', 'selic', 'nenhum');
create type tipo_movimentacao as enum ('aporte', 'resgate', 'dividendo', 'jcp', 'amortizacao', 'ajuste');
create type status_provento as enum ('estimado', 'anunciado', 'a_confirmar', 'recebido');

-- ============ Ativos ============
create table ativos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker        text,                       -- ex.: HGLG11 (null para renda fixa)
  nome          text not null,              -- ex.: "CDB Banco X 120% CDI"
  tipo          tipo_ativo not null,
  instituicao   text,
  indexador     indexador not null default 'nenhum',
  taxa          numeric(9,4),               -- ex.: 120 (=120% do CDI) ou 6.5 (IPCA+6,5%)
  vencimento    date,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
create index on ativos (user_id);

-- ============ Movimentações ============
create table movimentacoes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ativo_id        uuid not null references ativos(id) on delete cascade,
  data            date not null,
  tipo            tipo_movimentacao not null,
  quantidade      numeric(18,6),            -- cotas (null para renda fixa)
  preco_unitario  numeric(18,6),
  valor_total     numeric(18,2) not null,
  provento_id     uuid,                     -- preenchido quando gerada por confirmação de provento
  observacao      text,
  criado_em       timestamptz not null default now()
);
create index on movimentacoes (user_id, ativo_id, data);

-- ============ Cotações (compartilhadas) ============
create table cotacoes (
  ticker      text not null,
  data        date not null,
  fechamento  numeric(18,6) not null,
  fonte       text not null default 'manual',
  primary key (ticker, data)
);

-- ============ CDI diário (compartilhado) ============
create table cdi_diario (
  data        date primary key,
  taxa_dia    numeric(12,8) not null,       -- % ao dia, ex.: 0.05080000
  fonte       text not null default 'bcb_sgs_12'
);

-- ============ Proventos ============
create table proventos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ativo_id            uuid not null references ativos(id) on delete cascade,
  competencia         date not null,        -- 1º dia do mês de referência
  data_com            date,
  data_pagamento      date,
  valor_por_cota      numeric(18,8) not null,
  quantidade_elegivel numeric(18,6),
  valor_previsto      numeric(18,2),
  valor_recebido      numeric(18,2),
  tipo                tipo_movimentacao not null default 'dividendo' check (tipo in ('dividendo', 'jcp', 'amortizacao')),
  status              status_provento not null default 'estimado',
  atualizado_em       timestamptz not null default now(),
  unique (ativo_id, competencia, tipo)
);
create index on proventos (user_id, competencia);

alter table movimentacoes
  add constraint movimentacoes_provento_fk foreign key (provento_id) references proventos(id) on delete set null;

-- ============ Objetivos ============
create table objetivos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  valor_alvo  numeric(18,2) not null check (valor_alvo > 0),
  prazo       date,
  cor         text,
  concluido   boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index on objetivos (user_id);

-- ============ Alocações ============
create table alocacoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  objetivo_id  uuid not null references objetivos(id) on delete cascade,
  ativo_id     uuid not null references ativos(id) on delete cascade,
  valor        numeric(18,2) not null check (valor > 0),
  criado_em    timestamptz not null default now(),
  unique (objetivo_id, ativo_id)
);
create index on alocacoes (user_id, ativo_id);

-- ============ RLS ============
alter table ativos        enable row level security;
alter table movimentacoes enable row level security;
alter table proventos     enable row level security;
alter table objetivos     enable row level security;
alter table alocacoes     enable row level security;
alter table cotacoes      enable row level security;
alter table cdi_diario    enable row level security;

-- Dados do usuário: só o dono acessa
create policy "dono" on ativos        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on movimentacoes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on proventos     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on objetivos     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on alocacoes     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Dados de mercado: leitura para logados; escrita só via service role (rotinas)
create policy "leitura" on cotacoes   for select to authenticated using (true);
create policy "leitura" on cdi_diario for select to authenticated using (true);

-- ============ Views ============

-- Posição por ativo (renda variável)
create view posicao_ativos with (security_invoker = true) as
select
  a.id as ativo_id,
  a.user_id,
  a.ticker,
  a.nome,
  a.tipo,
  coalesce(sum(case when m.tipo = 'aporte'  then m.quantidade
                    when m.tipo = 'resgate' then -m.quantidade
                    when m.tipo = 'ajuste'  then m.quantidade
                    else 0 end), 0) as quantidade,
  coalesce(sum(case when m.tipo = 'aporte' then m.valor_total else 0 end), 0) as total_aportado,
  coalesce(sum(case when m.tipo = 'aporte' then m.quantidade else 0 end), 0) as qtd_comprada,
  coalesce(sum(case when m.tipo in ('dividendo', 'jcp') then m.valor_total else 0 end), 0) as proventos_recebidos,
  (select c.fechamento from cotacoes c where c.ticker = a.ticker order by c.data desc limit 1) as ultima_cotacao
from ativos a
left join movimentacoes m on m.ativo_id = a.id
group by a.id;

-- Total alocado por ativo
create view alocado_por_ativo with (security_invoker = true) as
select ativo_id, user_id, sum(valor) as alocado
from alocacoes
group by ativo_id, user_id;

-- Progresso dos objetivos
create view progresso_objetivos with (security_invoker = true) as
select
  o.id as objetivo_id,
  o.user_id,
  o.nome,
  o.valor_alvo,
  o.prazo,
  coalesce(sum(al.valor), 0) as alocado,
  round(coalesce(sum(al.valor), 0) / o.valor_alvo * 100, 1) as percentual
from objetivos o
left join alocacoes al on al.objetivo_id = o.id
group by o.id;
