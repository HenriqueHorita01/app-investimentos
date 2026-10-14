// Edge Function: busca o CDI diário (BCB SGS série 12) e grava em cdi_diario.
// Agendada via pg_cron (ver migration *_cdi_automatico.sql). Idempotente: só faz
// upsert de dado público, por isso roda sem JWT (verify_jwt = false).
//
// Parâmetro opcional: ?desde=AAAA-MM-DD para reprocessar a partir de uma data.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const INICIO_PADRAO = '2016-01-01'
const SERIE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados'

const paraBR = (iso: string) => iso.split('-').reverse().join('/')
const paraISO = (br: string) => br.split('/').reverse().join('-')

function somarAnos(iso: string, anos: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + anos)
  return d.toISOString().slice(0, 10)
}

function somarDias(iso: string, dias: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  let desde = new URL(req.url).searchParams.get('desde')
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return Response.json({ erro: 'desde deve ser AAAA-MM-DD' }, { status: 400 })
  }
  if (!desde) {
    const { data, error } = await supabase.from('cdi_diario').select('data').order('data', { ascending: false }).limit(1)
    if (error) return Response.json({ erro: error.message }, { status: 500 })
    // Reprocessa os últimos 7 dias para pegar eventuais correções do BCB.
    desde = data?.length ? somarDias(data[0].data, -7) : INICIO_PADRAO
  }
  if (desde < INICIO_PADRAO) desde = INICIO_PADRAO

  let gravados = 0
  // A API do BCB limita consultas diárias a janelas de 10 anos; usamos 5.
  for (let ini = desde; ini <= hoje; ini = somarDias(somarAnos(ini, 5), 1)) {
    const fim = somarAnos(ini, 5) < hoje ? somarAnos(ini, 5) : hoje
    const url = `${SERIE}?formato=json&dataInicial=${paraBR(ini)}&dataFinal=${paraBR(fim)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (r.status === 404) continue // janela sem dados (ex.: fim de semana)
    if (!r.ok) return Response.json({ erro: `BCB respondeu ${r.status}`, gravados }, { status: 502 })
    const linhas = (await r.json()) as { data: string; valor: string }[]
    const registros = linhas.map((l) => ({ data: paraISO(l.data), taxa_dia: Number(l.valor), fonte: 'bcb_sgs_12' }))
    for (let i = 0; i < registros.length; i += 1000) {
      const { error } = await supabase.from('cdi_diario').upsert(registros.slice(i, i + 1000), { onConflict: 'data' })
      if (error) return Response.json({ erro: error.message, gravados }, { status: 500 })
      gravados += Math.min(1000, registros.length - i)
    }
  }

  return Response.json({ ok: true, desde, ate: hoje, gravados })
})
