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
  maxHeight?: number;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends object>({
  data,
  columns,
  onRowClick,
  maxHeight,
  emptyMessage = '当前没有可显示的数据。',
  className = '',
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      className={`table-shell ${className}`.trim()}
      style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
    >
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
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
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
            ))
          ) : (
            <tr className="data-table-empty">
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
