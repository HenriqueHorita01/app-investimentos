-- Reserva de emergência passa a ser um DESTINO (como um objetivo), não uma marca do ativo.
-- Assim parte de um investimento pode ir para a reserva, parte para objetivos e o resto
-- ficar livre. Cada usuário tem um único objetivo do tipo 'reserva_emergencia'.

alter table objetivos
  add column tipo text not null default 'objetivo'
  check (tipo in ('objetivo', 'reserva_emergencia'));

create unique index objetivos_uma_reserva_por_usuario on objetivos (user_id) where tipo = 'reserva_emergencia';

-- A reserva pode não ter meta.
alter table objetivos alter column valor_alvo drop not null;
alter table objetivos drop constraint if exists objetivos_valor_alvo_check;
alter table objetivos add constraint objetivos_valor_alvo_check check (valor_alvo is null or valor_alvo > 0);

-- Cria a reserva de quem já tinha ativo de reserva ou meta da reserva (a meta vem de preferencias).
insert into objetivos (user_id, nome, valor_alvo, tipo, cor)
select u.user_id, 'Reserva de emergência', p.meta_reserva, 'reserva_emergencia', '#0E8A8A'
from (
  select user_id from ativos where finalidade = 'reserva_emergencia'
  union
  select user_id from preferencias
) u
left join preferencias p on p.user_id = u.user_id
on conflict do nothing;

-- Lançamentos dos ativos marcados como reserva passam a ter a reserva como destino.
update movimentacoes m
set objetivo_id = o.id
from ativos a
join objetivos o on o.user_id = a.user_id and o.tipo = 'reserva_emergencia'
where m.ativo_id = a.id
  and a.finalidade = 'reserva_emergencia'
  and m.objetivo_id is null
  and m.tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao');

-- A marca no ativo deixa de ser usada pelo front (coluna mantida por compatibilidade).
update ativos set finalidade = 'investimento' where finalidade = 'reserva_emergencia';

-- A reserva também pode receber parte de um ativo pela função de reservar.
create or replace function reservar_para_objetivo(p_ativo uuid, p_objetivo uuid, p_fracao numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_fracao is null or p_fracao <= 0 or p_fracao > 1 then
    raise exception 'Fração inválida: %', p_fracao;
  end if;
  if not exists (select 1 from objetivos where id = p_objetivo) then
    raise exception 'Destino não encontrado';
  end if;
  if not exists (select 1 from ativos where id = p_ativo) then
    raise exception 'Ativo não encontrado';
  end if;

  insert into movimentacoes (ativo_id, data, tipo, quantidade, preco_unitario, valor_total, observacao, objetivo_id, criado_em)
  select ativo_id, data, tipo,
         case when quantidade is null then null else round(quantidade * p_fracao, 6) end,
         preco_unitario,
         round(valor_total * p_fracao, 2),
         observacao,
         p_objetivo,
         criado_em
  from movimentacoes
  where ativo_id = p_ativo
    and objetivo_id is null
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao');

  update movimentacoes
  set quantidade = case when quantidade is null then null else quantidade - round(quantidade * p_fracao, 6) end,
      valor_total = valor_total - round(valor_total * p_fracao, 2)
  where ativo_id = p_ativo
    and objetivo_id is null
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao');

  delete from movimentacoes
  where ativo_id = p_ativo
    and objetivo_id is null
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao')
    and valor_total = 0
    and coalesce(quantidade, 0) = 0;
end;
$$;

revoke execute on function reservar_para_objetivo(uuid, uuid, numeric) from public, anon;
grant execute on function reservar_para_objetivo(uuid, uuid, numeric) to authenticated;
