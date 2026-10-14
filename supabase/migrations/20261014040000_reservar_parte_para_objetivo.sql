-- Reservar parte do saldo livre de um ativo para um objetivo.
--
-- A parte livre de um ativo é formada pelos lançamentos sem objetivo (aporte, resgate,
-- ajuste, amortização). Para reservar uma fração f dela, cada um desses lançamentos é
-- dividido em dois: (1 − f) continua livre e f passa para o objetivo, com a mesma data.
-- Como cotas e saldo pelo CDI são proporcionais aos lançamentos, o objetivo fica com
-- exatamente f do valor livre atual, e o rendimento dessa parte passa a ser dele.
-- Tudo numa transação: ou divide todos os lançamentos, ou nenhum.

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
  -- RLS garante que só enxergamos ativo e objetivo do próprio usuário.
  if not exists (select 1 from objetivos where id = p_objetivo) then
    raise exception 'Objetivo não encontrado';
  end if;
  if not exists (select 1 from ativos where id = p_ativo and finalidade = 'investimento') then
    raise exception 'Ativo não encontrado ou é reserva de emergência';
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

  -- Fração 1: as linhas livres ficaram zeradas; remove para não poluir o histórico.
  delete from movimentacoes
  where ativo_id = p_ativo
    and objetivo_id is null
    and tipo in ('aporte', 'resgate', 'ajuste', 'amortizacao')
    and valor_total = 0
    and coalesce(quantidade, 0) = 0;
end;
$$;

grant execute on function reservar_para_objetivo(uuid, uuid, numeric) to authenticated;
revoke execute on function reservar_para_objetivo(uuid, uuid, numeric) from public, anon;
