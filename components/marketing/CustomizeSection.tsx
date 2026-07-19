import { OptionPanel, type ComparisonOption } from "./OptionPanel";

type ComparisonGroup = {
  title: string;
  caption: string;
  left: ComparisonOption;
  right: ComparisonOption;
};

const groups: ComparisonGroup[] = [
  {
    title: "Fabric",
    caption: "Pick the feel that fits your sport.",
    left: {
      name: "Athletic Mesh",
      description: "Breathable open weave — light and airy for high-tempo play.",
      imageSrc: "/images/fabric-mesh.png",
      imageAlt: "Athletic mesh fabric close-up",
    },
    right: {
      name: "Smooth Polyester",
      description: "Soft, sleek finish — a refined hand-feel for a sharper look.",
      imageSrc: "/images/fabric-smooth.png",
      imageAlt: "Smooth polyester fabric close-up",
    },
  },
  {
    title: "Neckline",
    caption: "Set the tone at the collar.",
    left: {
      name: "Crew Neck",
      description: "Classic round collar — clean, traditional, versatile.",
      imageSrc: "/images/neck-crew.png",
      imageAlt: "Jersey with crew neckline",
    },
    right: {
      name: "V-Neck",
      description: "Subtle V cut — a modern silhouette that frames the chest.",
      imageSrc: "/images/neck-v.png",
      imageAlt: "Jersey with V-neckline",
    },
  },
  {
    title: "Sleeve Cut",
    caption: "Choose how the shoulder sits.",
    left: {
      name: "Regular Cut",
      description: "Standard set-in sleeve — straightforward and timeless.",
      imageSrc: "/images/sleeve-regular.png",
      imageAlt: "Jersey with regular set-in sleeve",
    },
    right: {
      name: "Raglan (Baseball)",
      description: "Diagonal sleeve from collar to underarm — full range of motion.",
      imageSrc: "/images/sleeve-raglan.png",
      imageAlt: "Jersey with raglan sleeve cut",
    },
  },
];


function VsBadge() {
  return (
    <div className="flex flex-shrink-0 flex-col items-center gap-2 self-center">
      <div className="h-10 w-px bg-border" />
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        vs
      </span>
      <div className="h-10 w-px bg-border" />
    </div>
  );
}

export function CustomizeSection() {
  return (
    <section
      id="customize"
      className="border-b border-border bg-background py-14 sm:py-16"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Customize
          </p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Built around what your team wears best.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every jersey is fully sublimated, so the design is in the fabric —
            not printed on top. Mix and match the options below to shape the
            base of your kit.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {groups.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-border bg-card p-4 sm:p-6"
            >
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                  {group.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {group.caption}
                </p>
              </div>

              <div className="flex items-start gap-4 sm:gap-6">
                <OptionPanel option={group.left} side="left" />
                <VsBadge />
                <OptionPanel option={group.right} side="right" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
