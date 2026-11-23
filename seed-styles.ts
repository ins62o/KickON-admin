import type {Plugin} from "vite";

// SEED React components import their own stylesheets. KICKON draws those components in src/kickon-ui.css,
// so SEED CSS becomes an empty module and never reaches a chunk that could override the admin styles.
const emptyStyle="\0kickon-without-seed-style";
const seedPackage=/(^|[\\/])@seed-design[\\/]css[\\/]/;
export function isSeedStylesheet(source:string,importer?:string){
  const path=source.split("?")[0];
  return path.endsWith(".css")&&(seedPackage.test(path)||path.startsWith(".")&&seedPackage.test(importer??""));
}
export function withoutSeedStyles():Plugin{
  return {name:"kickon-without-seed-styles",enforce:"pre",resolveId(source,importer){return isSeedStylesheet(source,importer)?emptyStyle:undefined;},load(id){return id===emptyStyle?"export {};":undefined;}};
}
