import { createContext, useContext } from "react";

export const ExportModeContext = createContext<boolean>(false);

export function useExportMode(): boolean {
  return useContext(ExportModeContext);
}
