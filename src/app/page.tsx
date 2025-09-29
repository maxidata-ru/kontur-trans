"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bot,
  Check,
  CircleDot,
  FileText,
  Flag,
  FolderKanban,
  GripVertical,
  Home,
  LineChart as LineChartIcon,
  Loader2,
  Settings,
  Truck,
  Users,
  Menu,
  Moon,
  Sun,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { tableData } from "@/data/table";
import { chartData } from "@/data/chart";

// ---------- Типы ----------
type RawTableItem = {
  ["№"]: number;
  ["дата"]: string;
  ["Грузоотправитель"]: string;
  ["Грузополучатель"]: string;
  ["Статус"]: "доставлено" | "в пути" | "новый" | "отмечен";
  ["Автомобиль"]: {
    ["госномер"]: string;
    ["тип_транспорта"]: string;
    ["вместимость"]: string;
  };
  ["водитель"]: { ["ФИО"]: string; ["номер_телефона"]: string };
  ["менеджер"]: { ["ФИО"]: string; ["номер_телефона"]: string };
};
type StatusKey = "new" | "in_progress" | "done" | "flagged";

const STATUS_FROM_RU: Record<RawTableItem["Статус"], StatusKey> = {
  "новый": "new",
  "в пути": "in_progress",
  "доставлено": "done",
  "отмечен": "flagged",
};

const STATUS_RU_LABEL: Record<StatusKey, string> = {
  new: "Новый",
  in_progress: "В пути",
  done: "Доставлено",
  flagged: "Отмечен",
};


type RowItem = {
  id: string;
  num: number;
  date: string;
  shipper: string;
  consignee: string;
  status: RawTableItem["Статус"];
  statusKey: StatusKey;            // ← добавили
  vehicle: RawTableItem["Автомобиль"];
  driver: RawTableItem["водитель"];
  manager: RawTableItem["менеджер"];
  transportType: string;
};


type ChartPoint = {
  дата: string;
  Рефрижератор: number;
  Фургон: number;
};

// ---------- Утилиты ----------
const formatDateRU = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const getISOWeek = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
};

function aggregateByISOWeeks(data: ChartPoint[]) {
  const map = new Map<string, { key: string; Рефрижератор: number; Фургон: number }>();
  for (const p of data) {
    const { year, week } = getISOWeek(p.дата);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, { key, Рефрижератор: 0, Фургон: 0 });
    const acc = map.get(key)!;
    acc.Рефрижератор += p.Рефрижератор;
    acc.Фургон += p.Фургон;
  }
  return Array.from(map.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}

const statusBadge = (k: StatusKey) => {
  const label = STATUS_RU_LABEL[k];
  switch (k) {
    case "done":
      return (
        <Badge className="border-green-200 bg-green-100 text-green-700">
          <Check className="mr-1 h-3.5 w-3.5" aria-label={label} /> {label}
        </Badge>
      );
    case "in_progress":
      return (
        <Badge className="border-slate-200 bg-slate-100 text-slate-700">
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-label={label} /> {label}
        </Badge>
      );
    case "new":
      return (
        <Badge className="border-slate-200 bg-slate-100 text-slate-700">
          <CircleDot className="mr-1 h-3.5 w-3.5" aria-label={label} /> {label}
        </Badge>
      );
    case "flagged":
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-700">
          <Flag className="mr-1 h-3.5 w-3.5" aria-label={label} /> {label}
        </Badge>
      );
  }
};


// ---------- SortableRow ----------
function SortableRow({
  id,
  children,
  onClick,
}: {
  id: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? "bg-muted/50" : ""}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label="Открыть карточку документа"
    >
      <TableCell className="w-10 pl-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
          title="Перетащить"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}

function MobileCards({
  items,
  onOpen,
}: {
  items: RowItem[];
  onOpen: (row: RowItem) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {items.map((r) => (
        <Card
          key={r.id}
          role="button"
          onClick={() => onOpen(r)}
          className="hover:bg-muted/50"
          aria-label={`Открыть документ №${r.num}`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">
                №{r.num} • {formatDateRU(r.date)}
              </div>
              {statusBadge(r.statusKey)}
            </div>

            <Separator className="my-3" />

            <div className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Грузоотправитель: </span>
                {r.shipper}
              </div>
              <div>
                <span className="text-muted-foreground">Грузополучатель: </span>
                {r.consignee}
              </div>
              <div>
                <span className="text-muted-foreground">Тип транспорта: </span>
                {r.transportType}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


// ---------- Страница ----------
export default function Page() {
  const initialRows: RowItem[] = React.useMemo(() => {
    return (tableData as RawTableItem[]).map((r) => ({
        id: String(r["№"]),
        num: r["№"],
        date: r["дата"],
        shipper: r["Грузоотправитель"],
        consignee: r["Грузополучатель"],
        status: r["Статус"],
        statusKey: STATUS_FROM_RU[r["Статус"]],   // ← вот это
        vehicle: r["Автомобиль"],
        driver: r["водитель"],
        manager: r["менеджер"],
        transportType: r["Автомобиль"]?.["тип_транспорта"] ?? "",
    }));
    }, []);


  const [rows, setRows] = React.useState<RowItem[]>(initialRows);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [openSheet, setOpenSheet] = React.useState(false);
  const [activeRow, setActiveRow] = React.useState<RowItem | null>(null);

  // Поиск и фильтр
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | StatusKey>("all");

    const filtered = React.useMemo(() => {
    return rows.filter((r) => {
        const byQuery = r.shipper.toLowerCase().includes(query.toLowerCase());
        const byStatus = statusFilter !== "all" ? r.statusKey === statusFilter : true; // ←
        return byQuery && byStatus;
    });
    }, [rows, query, statusFilter]);


  // Пагинация
  const pageSize = 10;
  const [pageIndex, setPageIndex] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = React.useMemo(
    () => filtered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [filtered, pageIndex]
  );

  // Колонки
  const columns = React.useMemo<ColumnDef<RowItem>[]>(
    () => [
      { id: "drag", header: "", cell: () => null, enableSorting: false, size: 36 },
      {
        accessorKey: "num",
        header: "№",
        cell: ({ row }) => <span className="tabular-nums">{row.original.num}</span>,
        size: 60,
      },
      {
        accessorKey: "date",
        header: "дата",
        cell: ({ row }) => <span className="tabular-nums">{formatDateRU(row.original.date)}</span>,
      },
      {
        accessorKey: "shipper",
        header: "Грузоотправитель",
        cell: ({ row }) => <span className="truncate">{row.original.shipper}</span>,
      },
      { accessorKey: "statusKey", header: "статус", cell: ({ row }) => statusBadge(row.original.statusKey) },
{
        accessorKey: "transportType",
        header: "тип_транспорта",
        cell: ({ row }) => <span>{row.original.transportType}</span>,
      },
    ],
    []
  );

  const table = useReactTable({
    data: pageItems,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = pageItems.map((r) => r.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newPage = arrayMove(pageItems, oldIndex, newIndex);
    const start = pageIndex * pageSize;
    const updated = [...rows];
    for (let i = 0; i < newPage.length; i++) updated[start + i] = newPage[i];
    setRows(updated);
  };

  // График
  const [chartMode, setChartMode] = React.useState<"days" | "weeks">("days");
  const dailyData = chartData as ChartPoint[];
  const weeklyData = React.useMemo(() => aggregateByISOWeeks(dailyData), [dailyData]);

  // Состояние для темы
  const [isDark, setIsDark] = React.useState(false);

  // Переключение темы
  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <div className="flex w-full flex-1">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:block sticky top-0 h-screen">
          <div className="flex h-14 items-center gap-2 px-4">
            <Truck className="h-5 w-5" aria-label="Логотип" />
            <span className="font-semibold">Контур•Транс</span>
            {/* Кнопка переключения темы */}
            <button
              className="ml-auto rounded p-2 hover:bg-muted transition"
              aria-label={isDark ? "Светлая тема" : "Темная тема"}
              onClick={() => setIsDark((v) => !v)}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          <Separator />
          <nav className="px-3 py-2">
            <div className="space-y-1">
              <Button variant="ghost" className="w-full justify-start">
                <Home className="mr-2 h-4 w-4" aria-label="Главная" /> Главная
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <LineChartIcon className="mr-2 h-4 w-4" aria-label="Отчёты" /> Отчеты
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <FolderKanban className="mr-2 h-4 w-4" aria-label="Проекты" /> Проекты
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-2 h-4 w-4" aria-label="Настройки" /> Настройки
              </Button>
            </div>
            <Separator className="my-2" />
            <div className="space-y-1">
              <Button variant="ghost" className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" aria-label="Команда" /> Команда
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                <FileText className="mr-2 h-4 w-4" aria-label="Документы (активно)" /> Документы
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Bot className="mr-2 h-4 w-4" aria-label="AI-помощник" /> AI-помощник
              </Button>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1">
            <div className="flex h-14 items-center gap-4 border-b px-4">
            {/* Мобильная кнопка-меню */}
            <Sheet>
                <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Открыть меню"
                >
                    <Menu className="h-5 w-5" />
                </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-14 items-center gap-2 px-4">
                    <Truck className="h-5 w-5" aria-label="Логотип" />
                    <span className="font-semibold">Контур•Транс</span>
                </div>
                <Separator />
                <nav className="px-3 py-2">
                    <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-start">
                        <Home className="mr-2 h-4 w-4" aria-label="Главная" /> Главная
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                        <LineChartIcon className="mr-2 h-4 w-4" aria-label="Отчёты" /> Отчеты
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                        <FolderKanban className="mr-2 h-4 w-4" aria-label="Проекты" /> Проекты
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                        <Settings className="mr-2 h-4 w-4" aria-label="Настройки" /> Настройки
                    </Button>
                    </div>
                    <Separator className="my-2" />
                    <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-start">
                        <Users className="mr-2 h-4 w-4" aria-label="Команда" /> Команда
                    </Button>
                    <Button variant="secondary" className="w-full justify-start">
                        <FileText className="mr-2 h-4 w-4" aria-label="Документы (активно)" /> Документы
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                        <Bot className="mr-2 h-4 w-4" aria-label="AI-помощник" /> AI-помощник
                    </Button>
                    </div>
                </nav>
                </SheetContent>
            </Sheet>

            {/* Логотип в шапке для мобилок */}
            <div className="flex items-center gap-2 md:hidden">
                <Truck className="h-5 w-5" aria-label="Логотип" />
                <span className="font-semibold">Контур•Транс</span>
            </div>

            <div className="ml-auto flex items-center gap-2" />
            </div>



          <div className="p-4">
            {/* Фильтры */}
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle>Документы</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
                <div className="md:col-span-2">
                  <Label htmlFor="q">Поиск по «Грузоотправитель»</Label>
                  <Input
                    id="q"
                    placeholder="Начните вводить название..."
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPageIndex(0);
                    }}
                    aria-label="Поиск по Грузоотправителю"
                  />
                </div>

                <div>
                  <Label htmlFor="status" className="mb-1 block">
                    Статус
                  </Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => {
                        setStatusFilter(v as "all" | StatusKey);
                        setPageIndex(0);
                    }}
                    >
                    <SelectTrigger id="status" aria-label="Фильтр по статусу" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Любой</SelectItem>
                        <SelectItem value="new">Новый</SelectItem>
                        <SelectItem value="in_progress">В пути</SelectItem>
                        <SelectItem value="done">Доставлено</SelectItem>
                        <SelectItem value="flagged">Отмечен</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
              </CardContent>
            </Card>

            {/* Таблица */}
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle>Список документов</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Мобилка: карточки */}
                <MobileCards
                  items={pageItems}
                  onOpen={(row) => {
                    setActiveRow(row);
                    setOpenSheet(true);
                  }}
                />

                {/* Десктоп/планшет: таблица */}
                <div className="hidden md:block">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map((hg) => (
                          <TableRow key={hg.id}>
                            {hg.headers.map((h) => (
                              <TableHead key={h.id} className={h.column.id === "drag" ? "w-10" : ""}>
                                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        <SortableContext items={pageItems.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                          {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((r) => (
                              <SortableRow
                                key={r.original.id}
                                id={r.original.id}
                                onClick={() => {
                                  setActiveRow(r.original);
                                  setOpenSheet(true);
                                }}
                              >
                                {r.getVisibleCells().map((cell) =>
                                  cell.column.id === "drag" ? null : (
                                    <TableCell key={cell.id}>
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  )
                                )}
                              </SortableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={columns.length} className="h-24 text-center">
                                Нет данных
                              </TableCell>
                            </TableRow>
                          )}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
                </div>

                {/* Пагинация */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Страница <span className="font-medium">{pageIndex + 1}</span> из{" "}
                    <span className="font-medium">{pageCount}</span> • Записей:{" "}
                    <span className="font-medium">{filtered.length}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                      disabled={pageIndex === 0}
                    >
                      Назад
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={pageIndex >= pageCount - 1}
                    >
                      Вперед
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* График */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Отправлено машин за месяц</CardTitle>
                <ToggleGroup
                  type="single"
                  value={chartMode}
                  onValueChange={(v) => v && setChartMode(v as "days" | "weeks")}
                  aria-label="Режим агрегации"
                >
                  <ToggleGroupItem value="days" aria-label="По дням">
                    По дням
                  </ToggleGroupItem>
                  <ToggleGroupItem value="weeks" aria-label="По неделям">
                    По неделям
                  </ToggleGroupItem>
                </ToggleGroup>
              </CardHeader>
              <CardContent className="h-80 touch-pan-y md:touch-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={
                      chartMode === "days"
                        ? dailyData.map((d) => ({
                            key: d.дата.slice(5).replace("-", "."),
                            ...d,
                          }))
                        : weeklyData.map((w) => ({ ...w }))
                    }
                    margin={{ left: 8, right: 16, top: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickMargin={8} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="Рефрижератор"
                      stackId="1"
                      fill="#2D5CF3"
                      stroke="#2D5CF3"
                      fillOpacity={0.4}
                    />
                    <Area
                      type="monotone"
                      dataKey="Фургон"
                      stackId="1"
                      fill="#E25606"
                      stroke="#E25606"
                      fillOpacity={0.4}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Sheet: карточка записи со скроллом */}
      <Sheet open={openSheet} onOpenChange={setOpenSheet}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <div className="flex h-full flex-col">
            <div className="border-b p-6">
              <SheetHeader>
                <SheetTitle>Документ №{activeRow?.num}</SheetTitle>
                <SheetDescription>Подробная информация по документу</SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeRow && (
                <div className="space-y-4">
                  <div>{statusBadge(activeRow.statusKey)}</div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Основное</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-sm text-muted-foreground">Дата</div>
                      <div className="font-medium">{formatDateRU(activeRow.date)}</div>
                      <Separator />
                      <div className="text-sm text-muted-foreground">Грузоотправитель</div>
                      <div className="font-medium">{activeRow.shipper}</div>
                      <Separator />
                      <div className="text-sm text-muted-foreground">Грузополучатель</div>
                      <div className="font-medium">{activeRow.consignee}</div>
                      <Separator />
                      <div className="text-sm text-muted-foreground">Тип транспорта</div>
                      <div className="font-medium">{activeRow.transportType}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Автомобиль</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-muted-foreground">Госномер</div>
                        <div className="font-medium">{activeRow.vehicle["госномер"]}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Тип</div>
                        <div className="font-medium">{activeRow.vehicle["тип_транспорта"]}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-sm text-muted-foreground">Вместимость</div>
                        <div className="font-medium">{activeRow.vehicle["вместимость"]}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Водитель</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-muted-foreground">ФИО</div>
                        <div className="font-medium">{activeRow.driver["ФИО"]}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Телефон</div>
                        <div className="font-medium">{activeRow.driver["номер_телефона"]}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Менеджер</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-muted-foreground">ФИО</div>
                        <div className="font-medium">{activeRow.manager["ФИО"]}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Телефон</div>
                        <div className="font-medium">{activeRow.manager["номер_телефона"]}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
