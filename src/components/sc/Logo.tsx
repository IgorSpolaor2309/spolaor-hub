import logo from "@/assets/spolaor-logo.jpg.asset.json";

export function AppLogo({ className }: { className?: string }) {
  // object-contain preserves aspect ratio and centers the image.
  // We use w-auto and h-auto by default if not specified, 
  // but usually className will provide dimensions.
  return (
    <img 
      src={logo.url} 
      alt="Digital SC" 
      className={`object-contain ${className || ""}`} 
    />
  );
}
