import React from "react";
import { useAppContext } from "@/context/AppContext";

export function CategoryView() {
  const { categories } = useAppContext();

  if (categories.isLoading) return <div>Carregando categorias...</div>;
  if (categories.error)
    return <div>Erro ao carregar categorias: {categories.error}</div>;

  return (
    <table className="w-full border-collapse border border-gray-300">
      <thead>
        <tr className="bg-gray-100">
          <th className="border p-2 text-left">Categoria</th>
          <th className="border p-2 text-left">Tipo</th>
        </tr>
      </thead>
      <tbody>
        {categories.hierarchicalCategories.map((group) => (
          <React.Fragment key={group.id}>
            {/* Categoria principal */}
            <tr className="bg-blue-50 font-semibold">
              <td className="border p-2">{group.label}</td>
              <td className="border p-2">
                {group.options.length ? group.options.length : "-"}
              </td>
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
