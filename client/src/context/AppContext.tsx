import { createContext, useContext, ReactNode, useMemo } from "react";
import { useCategory } from "@/modules/Category/viewmodel/useCategory";
import { useFinancialInstruments } from "@/modules/FinancialInstrument/viewmodel/useFinancialInstruments";

interface AppContextProps {
  categories: ReturnType<typeof useCategory>;
  financialInstruments: ReturnType<typeof useFinancialInstruments>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const categoryViewModel = useCategory();
  const financialInstrumentsViewModel = useFinancialInstruments();

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      categories: categoryViewModel,
      financialInstruments: financialInstrumentsViewModel,
    }),
    [categoryViewModel, financialInstrumentsViewModel]
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

export const useAppContext = (): AppContextProps => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext deve ser usado dentro do AppProvider");
  }
  return context;
};
