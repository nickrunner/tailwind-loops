const messages = [
  {
    role: "user" as const,
    text: "I want a 30-mile gravel loop near Grand Rapids with some elevation. Prefer quiet roads and trails, nothing too technical.",
  },
  {
    role: "ai" as const,
    text: "Here's a 31.2mi gravel loop starting from Millennium Park. It follows the White Pine Trail north, cuts through Rogue River State Forest on packed gravel, and returns via Cannonsburg countryside roads. 1,840ft elevation gain, mostly rolling hills. 92% unpaved surfaces, low traffic throughout.",
  },
];

function MessageBubble({
  role,
  text,
}: {
  role: "user" | "ai";
  text: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-brand-purple text-white rounded-br-md"
            : "bg-slate-100 text-slate-700 rounded-bl-md"
        }`}
      >
        {!isUser && (
          <span className="mb-1 block text-xs font-semibold text-brand-purple">
            Tailwind Loops
          </span>
        )}
        {text}
      </div>
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
        <div className="mx-auto max-w-lg">
          {/* Chat window mockup */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-brand-purple" />
              <span className="text-sm font-medium text-slate-600">
                New Route
              </span>
            </div>
            {/* Messages */}
            <div className="flex flex-col gap-4 p-4">
              {messages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} text={msg.text} />
              ))}
            </div>
            {/* Input bar */}
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5">
                <span className="flex-1 text-sm text-slate-400">
                  Describe your ideal route...
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-purple text-white">
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
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
