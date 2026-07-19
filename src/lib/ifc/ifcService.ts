// IFC API (web-ifc WASM) inicializavimas – vienetinis (singleton)
import { IfcAPI } from 'web-ifc';

let api: IfcAPI | null = null;
let initPromise: Promise<IfcAPI> | null = null;

export function getIfcApi(): Promise<IfcAPI> {
  if (api) return Promise.resolve(api);
  if (initPromise) return initPromise;
  const instance = new IfcAPI();
  // WASM failai nukopijuojami į public/wasm (relatyvus kelias – tinka Hostinger)
  instance.SetWasmPath('./wasm/');
  initPromise = instance.Init().then(() => {
    api = instance;
    return instance;
  });
  return initPromise;
}
