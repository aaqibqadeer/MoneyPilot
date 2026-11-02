import { themesCss } from "@/lib/themes";

/** Injects every theme's CSS variables. Server-rendered, so no flash. */
export function ThemeStyle() {
  return <style id="mp-themes" dangerouslySetInnerHTML={{ __html: themesCss() }} />;
}
