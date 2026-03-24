import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatNumber } from '../lib/format';

interface DataTableProps<T extends object> {
  data: T[];
  columns: Array<ColumnDef<T>>;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends object>({
  data,
  columns,
  onRowClick,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={onRowClick ? 'clickable-row' : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {(() => {
                    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
                    if (typeof rendered === 'number') {
                      return formatNumber(rendered, 1);
                    }

                    if (rendered == null) {
                      const rawValue = cell.getValue();
                      if (typeof rawValue === 'number') {
                        return formatNumber(rawValue, 1);
                      }
                    }

                    return rendered;
                  })()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
