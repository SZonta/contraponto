import type { ContrapontoApi } from '../shared/types';

declare global {
  interface Window {
    contraponto: ContrapontoApi;
  }
}

export {};
