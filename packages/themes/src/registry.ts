import { ThemeRegistry, type ThemeAccessContext } from "@platform/theme-engine";
import { ClassicTheme, classicTokens } from "./standard/classic";
import { UrbanTheme, urbanTokens } from "./standard/urban";
import { ImperialTheme, imperialTokens } from "./bespoke/imperial";

export const themeRegistry = new ThemeRegistry([
  { id: "classic", name: "Classic", description: "Tradição contemporânea, com tons naturais e tipografia editorial.", kind: "TEMPLATE", Renderer: ClassicTheme, tokens: classicTokens, capabilities: ["colors", "typography", "services", "professionals"], requiredFeatures: [] },
  { id: "urban", name: "Urban", description: "Expressão urbana, contraste marcante e composição gráfica.", kind: "TEMPLATE", Renderer: UrbanTheme, tokens: urbanTokens, capabilities: ["colors", "typography", "services", "professionals"], requiredFeatures: [] },
  { id: "bespoke-imperial", name: "Imperial", description: "Composição exclusiva de elegância clássica e detalhes em dourado.", kind: "BESPOKE", Renderer: ImperialTheme, tokens: imperialTokens, capabilities: ["colors", "typography", "services", "professionals", "bespoke"], requiredFeatures: ["custom_design"], allowedTenantIds: ["tenant-imperial"] },
]);

export function resolvePublicTheme(context: ThemeAccessContext, registry: ThemeRegistry = themeRegistry) {
  return registry.resolve(context);
}
