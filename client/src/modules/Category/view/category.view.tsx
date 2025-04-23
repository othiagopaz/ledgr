import React from "react";
import { CategoryGroup } from "../model/category.types";

interface CategoryViewProps {
  isLoading: boolean;
  error: string | null;
  hierarchicalCategories: CategoryGroup[];
}

export function CategoryView({
  isLoading,
  error,
  hierarchicalCategories,
}: CategoryViewProps) {
  if (isLoading) return <div>Carregando categorias...</div>;
  if (error) return <div>Erro ao carregar categorias: {error}</div>;

  return (
    <table className="w-full border-collapse border border-gray-300">
      <thead>
        <tr className="bg-gray-100">
          <th className="border p-2 text-left">Categoria</th>
          <th className="border p-2 text-left">Tipo</th>
        </tr>
      </thead>
      <tbody>
        {hierarchicalCategories.map((group) => (
          <React.Fragment key={group.label}>
            {/* Categoria principal */}
            <tr className="bg-blue-50 font-semibold">
              <td className="border p-2">{group.label}</td>
              <td className="border p-2">-</td>
            </tr>

            {/* Subcategorias */}
            {group.options.map((sub) => (
              <tr key={sub.id}>
                <td className="border p-2 pl-6 text-gray-700">↳ {sub.name}</td>
                <td className="border p-2">{sub.type ?? "-"}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}
