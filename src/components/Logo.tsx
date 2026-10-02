import logoUrl from "../assets/logo_EnergyMatrix.jpeg"

interface LogoProps {
  /** Largura da caixa em px (default 74). */

  width?: number

  /** Altura da caixa em px (default 44). */

  height?: number

  /** Fundo claro atrás do logo (o JPEG tem fundo branco). */

  boxed?: boolean

  className?: string
}

/**
 * Logo oficial EnergyMatrix (`logo_EnergyMatrix.jpeg`).
 *
 * O arquivo é um lockup quadrado (1600×1600) com bastante margem; a caixa
 * recorta a região do lockup (ícone + wordmark) de modo que a marca fique
 * legível em barras compactas, sem distorção (mesma escala em x/y).
 */

export function Logo({
  width = 74,
  height = 44,
  boxed = true,
  className = "",
}: LogoProps) {
  // A imagem é renderizada em 2× a altura da caixa e deslocada para centralizar

  // o lockup (≈ centro geométrico do arquivo), recortando as margens brancas.

  const imgSize = height * 2

  const offsetX = (width - imgSize) / 2

  const offsetY = (height - imgSize) / 2

  return (
    <span
      className={`relative inline-block overflow-hidden ${
        boxed ? "bg-white rounded" : ""
      } ${className}`}
      style={{ width, height }}
    >
      <img
        src={logoUrl}
        alt="EnergyMatrix — plataforma de decisão energética"
        style={{
          position: "absolute",
          width: imgSize,
          height: imgSize,
          left: offsetX,
          top: offsetY,
          maxWidth: "none",
        }}
      />
    </span>
  )
}

/** Lockup completo (sem recorte) — para heros e rodapés. */

export function LogoFull({
  size = 160,
  className = "",
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src={logoUrl}
      alt="EnergyMatrix — plataforma de decisão energética"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  )
}

export default Logo
