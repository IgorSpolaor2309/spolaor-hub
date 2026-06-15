import logo from "@/assets/spolaor-logo.jpg.asset.json";

export function SpolaorLogo({ className }: { className?: string }) {
  return <img src={logo.url} alt="Spolaor Company" className={className} />;
}
