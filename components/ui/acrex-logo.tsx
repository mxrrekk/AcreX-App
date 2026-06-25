import Image from "next/image";
import Link from "next/link";

type AcrexLogoProps = {
  className?: string;
  href?: string;
  priority?: boolean;
  width?: number;
  height?: number;
  tone?: "light" | "dark";
};

export function AcrexLogo({ className = "", href = "/", priority = false, width = 154, height = 46, tone = "light" }: AcrexLogoProps) {
  const src = tone === "dark" ? "/assets/acrex-logo-dark-transparent.png" : "/assets/acrex-logo-transparent.png";
  const logo = <Image src={src} alt="Acrex" width={width} height={height} priority={priority} />;

  if (!href) {
    return <span className={`acrex-logo ${className}`.trim()}>{logo}</span>;
  }

  return (
    <Link className={`acrex-logo ${className}`.trim()} href={href} aria-label="Acrex home">
      {logo}
    </Link>
  );
}
