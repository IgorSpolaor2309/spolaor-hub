import logo from "@/assets/spolaor-logo.jpg.asset.json";

export function SpolaorLogo({ className }: { className?: string }) {
  return <img src={logo.url} alt="Digital SC" className={className} />;
}
