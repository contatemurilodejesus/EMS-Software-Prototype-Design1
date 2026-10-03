/**
 * Selo de procedencia do dado (mandate 23: "dados reais vs simulados").
 *
 * Enquanto a primeira resposta nao chega, o placeholder local esta em tela:
 * o selo diz isso explicitamente, para ninguem ler numero de mock como medicao.
 */

interface DataSourceBadgeProps {
  /** true quando o dado veio da API. */
  live: boolean
  loading?: boolean
  /** Mensagem de erro, quando houver (ex.: 403 por falta de permissao). */
  error?: string | null
  /** Rotulo do recurso, ex.: "Dashboard". */
  label?: string
}

export function DataSourceBadge({
  live,
  loading,
  error,
  label,
}: DataSourceBadgeProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-2 mb-4 rounded border border-red-200 bg-red-50 text-[11px] text-red-700"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span>
          <strong>{label ?? "Dados"}</strong> indisponível: {error}
        </span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded border border-gray-200 bg-white text-[11px] text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
        Carregando dados do servidor…
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded border border-gray-200 bg-white text-[11px]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${live ? "bg-green-500" : "bg-amber-400"}`}
      />
      {live ? (
        <span className="text-gray-600">
          <strong>{label ?? "Dados"}</strong> conectado à API EnergyMatrix
        </span>
      ) : (
        <span className="text-amber-700">
          <strong>{label ?? "Dados"}</strong> sem conexão com a API — exibindo
          valores locais de demonstração
        </span>
      )}
    </div>
  )
}