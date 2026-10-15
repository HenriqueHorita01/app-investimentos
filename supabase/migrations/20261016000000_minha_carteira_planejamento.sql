-- Minha Carteira — etapa 1: planejamento.
-- Ver docs/plano-minha-carteira.md. Nada existente muda de comportamento:
-- as colunas novas em `ativos` são opcionais e só a aba Minha Carteira as usa.

-- ============ Categorias da carteira ============
-- Ex.: CDB pós-fixado 20%, FIIs 20%… A soma deve ser 100% (validada no front).
create table carteira_categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  percentual  numeric(6,3) not null default 0 check (percentual >= 0 and percentual <= 100),
  ordem       int not null default 0,
  cor         text,
  criado_em   timestamptz not null default now()
);
create index on carteira_categorias (user_id, ordem);

alter table carteira_categorias enable row level security;
create policy "dono" on carteira_categorias for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============ Campos de planejamento nos ativos ============
alter table ativos
  -- Categoria da Minha Carteira (null = fora da carteira).
  add column categoria_id      uuid references carteira_categorias(id) on delete set null,
  -- % da carteira total desejado para este ativo (null = pendente de configuração).
  add column percentual_alvo   numeric(6,3) check (percentual_alvo is null or (percentual_alvo >= 0 and percentual_alvo <= 100)),
  -- Preço de referência para simular quando ainda não há cotação.
  add column preco_referencia  numeric(18,6) check (preco_referencia is null or preco_referencia > 0),
  -- Renda fixa: valor mínimo da aplicação e incremento mínimo depois dele.
  add column aplicacao_minima  numeric(18,2) check (aplicacao_minima is null or aplicacao_minima >= 0),
  add column incremento_minimo numeric(18,2) check (incremento_minimo is null or incremento_minimo > 0),
  -- Liquidez em texto livre curto: 'diaria', 'no_vencimento', 'd+30'…
  add column liquidez          text,
  -- Renda variável: quantidade mínima por compra (1 = fracionário).
  add column lote              int not null default 1 check (lote >= 1);

create index on ativos (categoria_id);
