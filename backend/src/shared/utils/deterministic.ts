/**
 * Utilitarios puros de DETERMINISMO.
 *
 * Substituem `Math.random()` em toda a demonstracao: a mesma entrada produz
 * sempre a mesma saida (requisito de reprodutibilidade, secao 17.1).
 */

/** Ruido determinístico em [-1, 1] derivado do passo e da semente. */
export function dnoise(step: number, seed: number): number {
  const x = Math.sin((step + 1) * 12.9898 + seed * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** Semente estavel derivada de um identificador textual. */
export function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997
  return h
}