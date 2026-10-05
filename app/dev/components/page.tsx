"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronRightIcon,
  CopyIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TerminalIcon,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Canonical RHF + zod + shadcn Form pattern. S-06 (OrderFormSettings) will
// mirror this shape: schema colocated, zodResolver, FormField → FormItem
// → FormLabel + FormControl + FormMessage, sonner toast on success.
const sampleFormSchema = z.object({
  teamName: z
    .string()
    .min(2, "Team name must be at least 2 characters")
    .max(60, "Team name must be 60 characters or fewer"),
  email: z.string().email("Enter a valid email address"),
  quantity: z
    .number({ message: "Quantity is required" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(500, "Quantity must be 500 or fewer"),
  notes: z.string().max(280, "Notes must be 280 characters or fewer").optional(),
});

type SampleFormValues = z.infer<typeof sampleFormSchema>;

export default function ComponentsShowcasePage() {
  // Local dark-mode toggle. S-03 will replace this with the shared
  // ThemeToggle, but we need a way to flip the theme on this page today
  // so the showcase doubles as a dark-mode smoke test.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [isDark]);

  return (
    <TooltipProvider>
      <main className="bg-background text-foreground min-h-screen px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <PageHeader isDark={isDark} onToggleDark={() => setIsDark((v) => !v)} />

          <ButtonsSection />
          <BadgesSection />
          <InputsSection />
          <TextareaSection />
          <CheckboxSection />
          <RadioGroupSection />
          <SelectSection />
          <LabelSection />
          <SeparatorSection />
          <CardSection />
          <AlertSection />
          <SkeletonSection />
          <AccordionSection />
          <TabsSection />
          <DialogSection />
          <SheetSection />
          <PopoverSection />
          <DropdownMenuSection />
          <TooltipSection />
          <ToastSection />
          <FormSection />
        </div>
      </main>
    </TooltipProvider>
  );
}

function PageHeader({
  isDark,
  onToggleDark,
}: {
  isDark: boolean;
  onToggleDark: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          /dev/components
        </p>
        <h1 className="text-4xl">shadcn primitive catalog</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          One file, every primitive. Use this page as the reference catalog when
          building new UI — every primitive installed in S-02 renders below with
          its default plus a variant or two. Includes the canonical RHF + zod +
          shadcn Form pattern that the form sweep (S-06 onward) will mirror.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onToggleDark}>
        {isDark ? <SunIcon /> : <MoonIcon />}
        {isDark ? "Light mode" : "Dark mode"}
      </Button>
    </header>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ButtonsSection() {
  return (
    <Section
      title="Buttons"
      description="Variants and sizes from components/ui/button."
    >
      <Row label="Variants">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </Row>
      <Row label="Sizes">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Settings">
          <SettingsIcon />
        </Button>
      </Row>
      <Row label="States">
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Outline disabled
        </Button>
      </Row>
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section title="Badges">
      <Row label="Variants">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </Row>
    </Section>
  );
}

function InputsSection() {
  return (
    <Section title="Inputs">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-input-default">Default</Label>
          <Input id="showcase-input-default" placeholder="Vancouver Ravens" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-input-email">Type=email</Label>
          <Input
            id="showcase-input-email"
            type="email"
            placeholder="captain@team.ca"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-input-disabled">Disabled</Label>
          <Input
            id="showcase-input-disabled"
            placeholder="Cannot edit"
            disabled
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-input-invalid">aria-invalid</Label>
          <Input
            id="showcase-input-invalid"
            defaultValue="bad value"
            aria-invalid
          />
        </div>
      </div>
    </Section>
  );
}

function TextareaSection() {
  return (
    <Section title="Textarea">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-textarea-default">Default</Label>
          <Textarea
            id="showcase-textarea-default"
            placeholder="Tell us about your team..."
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="showcase-textarea-disabled">Disabled</Label>
          <Textarea
            id="showcase-textarea-disabled"
            placeholder="Read-only example"
            disabled
          />
        </div>
      </div>
    </Section>
  );
}

function CheckboxSection() {
  return (
    <Section title="Checkbox">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox defaultChecked /> Use our design service (+$50)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox /> Include sleeve numbers
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <Checkbox disabled /> Disabled
        </label>
      </div>
    </Section>
  );
}

function RadioGroupSection() {
  return (
    <Section title="RadioGroup">
      <RadioGroup defaultValue="open" name="showcase-names-mode">
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="open" /> Open — fans type their own name
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="fixed" /> Fixed roster — pick from a list
        </label>
      </RadioGroup>
    </Section>
  );
}

function SelectSection() {
  return (
    <Section title="Select">
      <div className="flex flex-col gap-2">
        <Label htmlFor="showcase-select-sport">Sport</Label>
        <Select defaultValue="ultimate">
          <SelectTrigger id="showcase-select-sport" className="w-64">
            <SelectValue placeholder="Pick a sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Field sports</SelectLabel>
              <SelectItem value="ultimate">Ultimate frisbee</SelectItem>
              <SelectItem value="soccer">Soccer</SelectItem>
              <SelectItem value="rugby">Rugby</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Court sports</SelectLabel>
              <SelectItem value="basketball">Basketball</SelectItem>
              <SelectItem value="volleyball">Volleyball</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </Section>
  );
}

function LabelSection() {
  return (
    <Section
      title="Label"
      description="Pairs with form controls via htmlFor."
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="showcase-label-input">Team name</Label>
        <Input id="showcase-label-input" placeholder="Required" />
      </div>
    </Section>
  );
}

function SeparatorSection() {
  return (
    <Section title="Separator">
      <div className="flex flex-col gap-3 text-sm">
        <p>Above the line</p>
        <Separator />
        <p>Below the line</p>
        <div className="flex h-6 items-center gap-3">
          <span>Left</span>
          <Separator orientation="vertical" />
          <span>Middle</span>
          <Separator orientation="vertical" />
          <span>Right</span>
        </div>
      </div>
    </Section>
  );
}

function CardSection() {
  return (
    <Section
      title="Card"
      description="Header, content, footer, action — used as the default container for grouped UI."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order #1042</CardTitle>
            <CardDescription>Vancouver Ravens — Ultimate</CardDescription>
            <CardAction>
              <Badge variant="secondary">In production</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              24 jerseys with sublimated numbers and back names. Shipping
              estimate: 2 weeks.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">
              View details
            </Button>
          </CardFooter>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Compact card</CardTitle>
            <CardDescription>size=&quot;sm&quot; for tighter spacing.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Useful inside dense lists.
            </p>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function AlertSection() {
  return (
    <Section title="Alert">
      <Alert>
        <TerminalIcon />
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
          You can add components to your app using the CLI.
        </AlertDescription>
        <AlertAction>
          <Button variant="ghost" size="icon-sm" aria-label="Copy">
            <CopyIcon />
          </Button>
        </AlertAction>
      </Alert>
      <Alert variant="destructive">
        <TerminalIcon />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          Your order could not be saved. Please try again.
        </AlertDescription>
      </Alert>
    </Section>
  );
}

function SkeletonSection() {
  return (
    <Section
      title="Skeleton"
      description="Placeholder while content is loading."
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </Section>
  );
}

function AccordionSection() {
  return (
    <Section title="Accordion">
      <Accordion>
        <AccordionItem value="minimum">
          <AccordionTrigger>What is the minimum order?</AccordionTrigger>
          <AccordionContent>
            Minimum order is 10 jerseys. Below 10 the per-jersey price is
            higher.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="timeline">
          <AccordionTrigger>How long does production take?</AccordionTrigger>
          <AccordionContent>
            Two to three weeks from approved artwork.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="design">
          <AccordionTrigger>Do you help with design?</AccordionTrigger>
          <AccordionContent>
            Yes — optional $50 design service, or bring your own artwork.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Section>
  );
}

function TabsSection() {
  return (
    <Section title="Tabs">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p className="text-muted-foreground text-sm">
            Order specs, totals, and current production stage.
          </p>
        </TabsContent>
        <TabsContent value="roster">
          <p className="text-muted-foreground text-sm">
            Player names, numbers, and sizes.
          </p>
        </TabsContent>
        <TabsContent value="design">
          <p className="text-muted-foreground text-sm">
            Linked design files and Canva references.
          </p>
        </TabsContent>
      </Tabs>

      <Tabs defaultValue="default">
        <TabsList variant="line">
          <TabsTrigger value="default">Variant: line</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
        <TabsContent value="default">
          <p className="text-muted-foreground text-sm">
            Underline-style tabs for inline page navigation.
          </p>
        </TabsContent>
        <TabsContent value="other">
          <p className="text-muted-foreground text-sm">
            Second panel.
          </p>
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function DialogSection() {
  return (
    <Section title="Dialog">
      <Dialog>
        <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm order</DialogTitle>
            <DialogDescription>
              You&apos;re about to submit an order for 24 jerseys. This cannot be
              undone from this screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <DialogClose render={<Button>Confirm</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function SheetSection() {
  return (
    <Section title="Sheet" description="Side drawer — used by mobile nav.">
      <div className="flex flex-wrap gap-3">
        <Sheet>
          <SheetTrigger render={<Button variant="outline">Open right</Button>} />
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Refine the orders list.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 text-sm">
              <p className="text-muted-foreground">Sheet body content goes here.</p>
            </div>
            <SheetFooter>
              <SheetClose render={<Button variant="ghost">Close</Button>} />
              <SheetClose render={<Button>Apply</Button>} />
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger render={<Button variant="outline">Open left</Button>} />
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="px-4 text-sm">
              <p className="text-muted-foreground">Left-side drawer.</p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Section>
  );
}

function PopoverSection() {
  return (
    <Section title="Popover">
      <Popover>
        <PopoverTrigger render={<Button variant="outline">Open popover</Button>} />
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Quick edit</PopoverTitle>
            <PopoverDescription>
              Small overlay for inline editing.
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="showcase-popover-input">Jersey number</Label>
            <Input id="showcase-popover-input" defaultValue="42" />
          </div>
        </PopoverContent>
      </Popover>
    </Section>
  );
}

function DropdownMenuSection() {
  return (
    <Section title="DropdownMenu">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline">
              Actions
              <ChevronRightIcon />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuLabel>Order</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>Export CSV</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Section>
  );
}

function TooltipSection() {
  return (
    <Section title="Tooltip">
      <div className="flex flex-wrap items-center gap-4">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
          <TooltipContent>This is a tooltip</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Settings">
                <SettingsIcon />
              </Button>
            }
          />
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  );
}

function ToastSection() {
  return (
    <Section title="Toast (sonner)" description="Mounted globally via <Toaster /> in app/providers.tsx — available on every route.">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => toast("Order saved")}>Default</Button>
        <Button
          variant="outline"
          onClick={() => toast.success("Jersey run created")}
        >
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error("Could not save order", {
              description: "The Convex mutation failed. Try again in a moment.",
            })
          }
        >
          Error
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.info("Heads up", {
              description: "Deadline is in 3 days.",
            })
          }
        >
          Info
        </Button>
      </div>
    </Section>
  );
}

function FormSection() {
  const form = useForm<SampleFormValues, unknown, SampleFormValues>({
    resolver: zodResolver(sampleFormSchema),
    defaultValues: {
      teamName: "",
      email: "",
      quantity: 10,
      notes: "",
    },
  });

  const onSubmit = (values: SampleFormValues) => {
    toast.success("Form submitted", {
      description: `${values.teamName} — ${values.quantity} jerseys`,
    });
  };

  return (
    <Section
      title="Form (RHF + zod + shadcn)"
      description="Canonical pattern. S-06 onward mirrors this shape: zod schema colocated, zodResolver, FormField → FormItem → FormLabel + FormControl + FormMessage, sonner toast on success."
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="teamName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team name</FormLabel>
                  <FormControl>
                    <Input placeholder="Vancouver Ravens" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Captain email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="captain@team.ca"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(event) => {
                      const next = event.target.valueAsNumber;
                      field.onChange(Number.isNaN(next) ? undefined : next);
                    }}
                  />
                </FormControl>
                <FormDescription>Between 1 and 500 jerseys.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Anything we should know?"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => form.reset()}
            >
              Reset
            </Button>
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Form>
    </Section>
  );
}
