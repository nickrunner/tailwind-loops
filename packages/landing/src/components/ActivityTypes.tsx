const activities = [
  {
    name: "Road Cycling",
    description:
      "Paved corridors with sustained flow. Rural roads, collectors, and bike-friendly routes with minimal stops.",
    icon: "\uD83D\uDEB4",
  },
  {
    name: "Gravel Cycling",
    description:
      "Unpaved trails and rural roads. Find the best gravel corridors with surface confidence scoring.",
    icon: "\u26F0\uFE0F",
  },
  {
    name: "Running",
    description:
      "Soft surfaces and scenic paths. Trails, parks, and neighborhood routes optimized for runners.",
    icon: "\uD83C\uDFC3",
  },
  {
    name: "Walking",
    description:
      "Paths, trails, and quiet neighborhoods. Permissive routing that prioritizes character and safety.",
    icon: "\uD83D\uDEB6",
  },
];

export function ActivityTypes() {
  return (
    <section className="bg-slate-50 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center text-2xl font-bold text-brand-navy sm:text-3xl">
          Four Activities, One Engine
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-slate-500">
          Each activity type has fundamentally different preferences for surface,
          safety, and character. Tailwind Loops scores corridors across six
          dimensions, tuned per activity.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {activities.map((a) => (
            <div
              key={a.name}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 text-3xl">{a.icon}</div>
              <h3 className="mb-1 text-lg font-semibold text-brand-navy">
                {a.name}
              </h3>
              <p className="text-sm text-slate-500">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
