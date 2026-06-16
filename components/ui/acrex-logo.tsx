import Image from "next/image";
import Link from "next/link";

type AcrexLogoProps = {
  className?: string;
  href?: string;
  priority?: boolean;
  width?: number;
  height?: number;
};

export function AcrexLogo({ className = "", href = "/", priority = false, width = 154, height = 46 }: AcrexLogoProps) {
  const logo = <Image src="/assets/acrex-logo.png" alt="Acrex" width={width} height={height} priority={priority} />;

  if (!href) {
    return <span className={`acrex-logo ${className}`.trim()}>{logo}</span>;
  }

  return (
    <Link className={`acrex-logo ${className}`.trim()} href={href} aria-label="Acrex home">
      {logo}
    </Link>
  );
}
