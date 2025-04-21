import { TransactionStatus } from "@/modules/Event";
import { Badge } from "../ui/badge";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table,
  TableBody,
} from "../ui/table";

interface TransactionTableProps {
  transactions: Array<{
    id: string;
    date: string;
    type: string;
    description: string;
    negotiator: string;
    category: string;
    accountOrCard: string;
    value: number;
    status: string;
  }>;
  isLoading: boolean;
  error: string | null;
  totalPages: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
}

export function TransactionTable({
  transactions,
  isLoading,
  error,
  totalPages,
  currentPage,
  onPageChange,
}: TransactionTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-[100px] sm:table-cell">Data</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="hidden md:table-cell">Negociador</TableHead>
          <TableHead className="hidden md:table-cell">Categoria</TableHead>
          <TableHead className="hidden lg:table-cell">Conta/Cartão</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="hidden md:table-cell">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="hidden sm:table-cell">{tx.date}</TableCell>
              <TableCell>{tx.type}</TableCell>
              <TableCell>{tx.description}</TableCell>
              <TableCell className="hidden md:table-cell">
                {tx.negotiator}
              </TableCell>
              <TableCell>{tx.category}</TableCell>
              <TableCell className="hidden md:table-cell">
                {tx.accountOrCard}
              </TableCell>
              <TableCell className="text-right">{tx.value / 100}</TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge
                  variant={
                    tx.status === TransactionStatus.PAID
                      ? "default"
                      : tx.status === TransactionStatus.PENDING
                      ? "secondary"
                      : "secondary"
                  }
                >
                  {tx.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="text-center">
              Nenhuma transação encontrada para o período/filtros selecionados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
