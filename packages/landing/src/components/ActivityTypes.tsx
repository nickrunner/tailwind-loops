import Image from "next/image";

const activities = [
  {
    name: "Road Cycling",
    caption: "Smooth pavement, minimal stops, maximum flow",
    photo: "/photos/roads/paths-and-gravel/above-clouds-switchback.jpg",
    alt: "Paved switchback road above the clouds",
  },
  {
    name: "Gravel",
    caption: "Dirt roads, forest trails, rural exploration",
    photo: "/photos/roads/paths-and-gravel/farmland-dirt-road.jpg",
    alt: "Dirt road through farmland",
  },
  {
    name: "Running",
    caption: "Soft trails and scenic paths at your pace",
    photo: "/photos/roads/paths-and-gravel/forest-gravel-path.jpg",
    alt: "Shaded forest trail",
  },
  {
    name: "Walking",
    caption: "Leisurely paths through nature",
    photo: "/photos/roads/paths-and-gravel/redwood-boardwalk2.jpg",
    alt: "Boardwalk path through redwood forest",
    objectPosition: "bottom",
  },
];

export function ActivityTypes() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="mb-3 text-2xl font-bold text-brand-navy sm:text-3xl">
          Routes for Every Kind of Move
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-slate-500">
          The AI adapts to you. Road cyclist who wants smooth pavement and
          minimal stops? Gravel rider chasing dirt roads? Runner looking for
          soft trails? Just say so.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {activities.map((a) => (
            <div
              key={a.name}
              className="group relative aspect-[3/4] overflow-hidden rounded-xl transition-transform duration-300 hover:scale-[1.02]"
            >
              <Image
                src={a.photo}
                alt={a.alt}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover"
                style={a.objectPosition ? { objectPosition: a.objectPosition } : undefined}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 p-4 text-left">
                <h3 className="text-lg font-semibold text-white">{a.name}</h3>
                <p className="text-sm text-white/70">{a.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
