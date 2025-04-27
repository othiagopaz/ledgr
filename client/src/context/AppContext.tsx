// src/context/AppContext.tsx
import { createContext, useContext, ReactNode } from "react";
import { useCategory } from "../modules/Category/viewmodel/useCategory";

// 1. Definir a estrutura dos dados que o contexto vai expor
interface AppContextProps {
  categories: ReturnType<typeof useCategory>;
}

// 2. Criar o contexto
const AppContext = createContext<AppContextProps | undefined>(undefined);

// 3. Provider: responsável por carregar os dados globais
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const categoryViewModel = useCategory(); // chama o viewModel!

  return (
    <AppContext.Provider value={{ categories: categoryViewModel }}>
      {children}
    </AppContext.Provider>
  );
};

// 4. Hook para consumir o contexto (boa prática)
export const useAppContext = (): AppContextProps => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext deve ser usado dentro do AppProvider");
  }
  return context;
};
