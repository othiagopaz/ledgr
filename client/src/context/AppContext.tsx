import { createContext, useContext, ReactNode } from "react";
import { useCategory } from "../modules/Category/viewmodel/useCategory";
import { useFinancialInstruments } from "@/modules/FinancialInstrument/viewmodel/useFinancialInstruments";

interface AppContextProps {
  categories: ReturnType<typeof useCategory>;
  financialInstruments: ReturnType<typeof useFinancialInstruments>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const categoryViewModel = useCategory();
  const financialInstrumentsViewModel = useFinancialInstruments();
  return (
    <AppContext.Provider
      value={{
        categories: categoryViewModel,
        financialInstruments: financialInstrumentsViewModel,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextProps => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext deve ser usado dentro do AppProvider");
  }
  return context;
};
