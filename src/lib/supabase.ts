import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Mensagem exibida na tela quando o build foi feito sem as variáveis de ambiente. */
export const erroConfig =
  !url || !chave
    ? 'Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Localmente, use o .env.local (veja .env.example); na Vercel, cadastre em Settings → Environment Variables e faça um novo deploy.'
    : null

export const supabase = createClient(url || 'http://config-ausente.invalid', chave || 'config-ausente')
