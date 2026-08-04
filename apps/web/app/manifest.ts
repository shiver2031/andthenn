import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "AndThenn Media ERP", short_name: "AndThenn", start_url: "/home", display: "standalone", background_color: "#f6f5f1", theme_color: "#6d44e5", icons: [] };
}
