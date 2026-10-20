// Page header of the redesigned screens (mockup): large title, one-line subtitle, actions on the right.
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 pb-1" data-testid="page-header">
      <div className="mr-auto min-w-0">
        <h1 className="text-[20px] font-semibold leading-tight tracking-tight sm:text-[22px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
