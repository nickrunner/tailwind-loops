const routes = [
  {
    name: "White Pine Trail Loop",
    caption:
      "Packed gravel through Rogue River forest, rolling hills",
    distance: "31.2 mi",
    flow: 92,
    // Rounded loop shape
    path: "M16,52 C10,40 12,24 22,16 C32,8 48,10 54,20 C60,30 56,46 46,54 C36,60 22,58 16,52Z",
  },
  {
    name: "Cannonsburg Countryside",
    caption:
      "Quiet rural roads with long uninterrupted stretches",
    distance: "28.7 mi",
    flow: 88,
    // Elongated figure-8 shape
    path: "M12,32 C12,18 24,12 32,18 C40,24 40,28 48,22 C56,16 60,28 56,38 C52,48 44,44 36,48 C28,52 12,46 12,32Z",
  },
  {
    name: "Millennium Park Circuit",
    caption:
      "Mixed surface loop along the Grand River corridor",
    distance: "24.5 mi",
    flow: 85,
    // Irregular loop with river-like curve
    path: "M14,44 C10,32 16,18 28,14 C40,10 50,16 52,26 C54,36 48,42 42,48 C36,54 20,54 14,44Z",
  },
];

function RouteThumbnail({ path }: { path: string }) {
  return (
    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 sm:h-16 sm:w-16">
      <svg viewBox="0 0 68 68" className="h-10 w-10 sm:h-11 sm:w-11">
        <path
          d={path}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
        <circle cx="16" cy="52" r="3" fill="#3b82f6" opacity="0.9" />
      </svg>
    </div>
  );
}

function RouteCard({
  route,
}: {
  route: (typeof routes)[number];
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-150 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-4">
      <RouteThumbnail path={route.path} />
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-slate-800">
          {route.name}
        </h4>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          {route.caption}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {route.distance}
        </span>
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
          Flow {route.flow}
        </span>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200">
      <svg
        className="h-4 w-4 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
        />
      </svg>
    </div>
  );
}

function AiIcon() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue">
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M21 12c0-5-4-9-9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 3"
        />
      </svg>
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
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
