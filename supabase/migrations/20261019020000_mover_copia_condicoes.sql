-- Corrige mover_entre_destinos: ao dividir uma aplicação entre destinos, a parte movida
-- mantém as condições próprias da aplicação (taxa, indexador, vencimento, liquidez,
-- carência). Antes essas colunas não eram copiadas.

create or replace function mover_entre_destinos(p_ativo uuid, p_origem uuid, p_destino uuid, p_fracao numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_fracao is null or p_fracao <= 0 or p_fracao > 1 then
    raise exception 'Fração inválida: %', p_fracao;
  end if;
  if p_origem is not distinct from p_destino then
    raise exception 'Origem e destino são iguais';
  end if;
  -- RLS garante que só enxergamos ativo e objetivos do próprio usuário.
  if not exists (select 1 from ativos where id = p_ativo) then
    raise exception 'Ativo não encontrado';
  end if;
  if p_origem is not null and not exists (select 1 from objetivos where id = p_origem) then
    raise exception 'Origem não encontrada';
  end if;
  if p_destino is not null and not exists (select 1 from objetivos where id = p_destino) then
    raise exception 'Destino não encontrado';
  end if;

  insert into movimentacoes (ativo_id, data, tipo, quantidade, preco_unitario, valor_total, observacao, objetivo_id, criado_em,
                             taxa, indexador, vencimento, liquidez, carencia)
  select ativo_id, data, tipo,
         case when quantidade is null then null else round(quantidade * p_fracao, 6) end,
         preco_unitario,
         round(valor_total * p_fracao, 2),
         observacao,
         p_destino,
         criado_em,
         taxa, indexador, vencimento, liquidez, carencia
  from movimentacoes
  where ativo_id = p_ativo
    and objetivo_id is not distinct from p_origem
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao');

  update movimentacoes
  set quantidade = case when quantidade is null then null else quantidade - round(quantidade * p_fracao, 6) end,
      valor_total = valor_total - round(valor_total * p_fracao, 2)
  where ativo_id = p_ativo
    and objetivo_id is not distinct from p_origem
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao');

  -- Fração 1: as linhas da origem ficaram zeradas.
  delete from movimentacoes
  where ativo_id = p_ativo
    and objetivo_id is not distinct from p_origem
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao')
    and valor_total = 0
    and coalesce(quantidade, 0) = 0;
end;
$$;

revoke execute on function mover_entre_destinos(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function mover_entre_destinos(uuid, uuid, uuid, numeric) to authenticated;
