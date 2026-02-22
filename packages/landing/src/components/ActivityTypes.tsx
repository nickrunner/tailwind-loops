const activities = [
  { icon: "🚴", name: "Road Cycling" },
  { icon: "⛰️", name: "Gravel" },
  { icon: "🏃", name: "Running" },
  { icon: "🚶", name: "Walking" },
];

export function ActivityTypes() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-3 text-2xl font-bold text-brand-navy sm:text-3xl">
          Routes for Every Kind of Move
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-slate-500">
          The AI adapts to you. Road cyclist who wants smooth pavement and
          minimal stops? Gravel rider chasing dirt roads? Runner looking for
          soft trails? Just say so.
        </p>
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          {activities.map((a) => (
            <div key={a.name} className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-purple/5 text-3xl">
                {a.icon}
              </div>
              <span className="text-sm font-medium text-slate-600">
                {a.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
