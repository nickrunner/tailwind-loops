import Image from "next/image";
import { MaterialIcon } from "./icons";

const routes = [
  {
    name: "White Pine Trail Loop",
    caption:
      "Packed gravel through Rogue River forest, rolling hills",
    distance: "31.2 mi",
    flow: 92,
    photo: "/photos/roads/paths-and-gravel/forest-gravel-path.jpg",
  },
  {
    name: "Cannonsburg Countryside",
    caption:
      "Quiet rural roads with long uninterrupted stretches",
    distance: "28.7 mi",
    flow: 88,
    photo: "/photos/roads/rainbow-countryside.jpg",
  },
  {
    name: "Millennium Park Circuit",
    caption:
      "Mixed surface loop along the Grand River corridor",
    distance: "24.5 mi",
    flow: 85,
    photo: "/photos/roads/paths-and-gravel/redwood-boardwalk.jpg",
  },
];

function RouteThumbnail({ photo, name }: { photo: string; name: string }) {
  return (
    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg sm:h-14 sm:w-14">
      <Image
        src={photo}
        alt={name}
        fill
        className="object-cover"
      />
    </div>
  );
}

function RouteCard({
  route,
}: {
  route: (typeof routes)[number];
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-2.5 transition-shadow hover:shadow-sm sm:gap-3.5 sm:p-3">
      <RouteThumbnail photo={route.photo} name={route.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-slate-800">
            {route.name}
          </h4>
          <span className="flex-shrink-0 text-xs text-slate-400">
            {route.distance}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          {route.caption}
        </p>
        <div className="mt-1.5 flex items-center gap-1">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-blue"
              style={{ width: `${route.flow}%` }}
            />
          </div>
          <span className="text-[10px] font-medium text-slate-400">
            {route.flow}
          </span>
        </div>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
      <MaterialIcon name="person" size={18} />
    </div>
  );
}

function AiIcon() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
      <MaterialIcon name="auto_awesome" size={16} />
    </div>
  );
}

export function ChatDemo() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center text-2xl font-bold text-brand-navy sm:text-3xl">
          Routes Through Conversation
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-slate-500">
          No sliders. No dropdown menus. Just describe the ride you have in
          mind, and our AI translates your words into optimized routing
          parameters — then builds the route in seconds.
        </p>
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-lg">
            {/* Conversation area */}
            <div className="flex flex-col gap-6 p-5 sm:p-6">
              {/* User message */}
              <div className="flex items-start gap-3">
                <UserIcon />
                <p className="pt-0.5 text-sm leading-relaxed text-slate-700">
                  I want a 30-mile gravel loop near Grand Rapids with some
                  elevation. Prefer quiet roads and trails, nothing too
                  technical.
                </p>
              </div>

              {/* AI response */}
              <div className="flex items-start gap-3">
                <AiIcon />
                <div className="min-w-0 flex-1">
                  <p className="mb-3 pt-0.5 text-sm leading-relaxed text-slate-700">
                    Here are 3 routes matching your request:
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {routes.map((route) => (
                      <RouteCard key={route.name} route={route} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Describe your ideal route..."
                  disabled
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
                <button
                  disabled
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white opacity-60"
                >
                  <MaterialIcon name="send" size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
