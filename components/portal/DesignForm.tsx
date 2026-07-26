"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UploadCloudIcon } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UploadedFile } from "@/convex/_designAssets";
import {
  BRIEF_MAX_LENGTH,
  CANVA_LINK_MAX_LENGTH,
  JERSEY_STYLE_MAX_LENGTH,
  NECKLINES,
  SLEEVE_STYLES,
  TITLE_MAX_LENGTH,
  isHttpUrl,
  isNeckline,
  isSleeveStyle,
  toDesignPayload,
} from "@/lib/design";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Mode =
  | { kind: "create" }
  | {
      kind: "edit";
      designId: Id<"designs">;
      initialTitle: string;
      initialBrief: string;
      initialCanvaLink: string;
      initialJerseyStyle: string;
      initialNeckline: string;
      initialSleeveStyle: string;
      existingFileCount: number;
    };

type UploadStatus = "pending" | "uploading" | "done" | "failed";

type PendingUpload = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
  storageId?: Id<"_storage">;
};

// Colocated zod schema. Field rules mirror lib/design.ts so the client and
// the convex/designs.ts mutation reject the same inputs with the same
// wording. fileCount lives inside the form so the upload dropzone can use
// the same error rendering as every other field — it's mutated via
// form.setValue from the file picker handlers.
const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your design a title.")
    .max(
      TITLE_MAX_LENGTH,
      `Please keep the title under ${TITLE_MAX_LENGTH} characters.`,
    ),
  brief: z
    .string()
    .trim()
    .min(1, "Add a brief so Sidestep knows what you want.")
    .max(
      BRIEF_MAX_LENGTH,
      `Please keep the brief under ${BRIEF_MAX_LENGTH} characters.`,
    ),
  canvaLink: z.string().superRefine((value, ctx) => {
    const link = value.trim();
    if (!link) return;
    if (link.length > CANVA_LINK_MAX_LENGTH) {
      ctx.addIssue({ code: "custom", message: "That link is too long." });
      return;
    }
    if (!isHttpUrl(link)) {
      ctx.addIssue({
        code: "custom",
        message: "Paste a full link starting with https://",
      });
    }
  }),
  // Silhouette specs — all optional. Blank means "not decided yet"; the
  // neckline/sleeve Selects only offer allowlisted values, so the refine
  // is defense-in-depth against a hand-edited DOM, mirroring lib/design.
  jerseyStyle: z
    .string()
    .trim()
    .max(
      JERSEY_STYLE_MAX_LENGTH,
      `Please keep the jersey style under ${JERSEY_STYLE_MAX_LENGTH} characters.`,
    ),
  // Return-annotate as boolean so zod doesn't infer these as type guards
  // (isNeckline/isSleeveStyle narrow), which would widen FormValues into a
  // literal union and break RHF's resolver generic inference.
  neckline: z
    .string()
    .refine(
      (value): boolean => value === "" || isNeckline(value),
      "Choose a neckline from the list.",
    ),
  sleeveStyle: z
    .string()
    .refine(
      (value): boolean => value === "" || isSleeveStyle(value),
      "Choose a sleeve style from the list.",
    ),
  fileCount: z
    .number()
    .int()
    .min(
      1,
      "Upload at least one file (logo, mood board, reference image).",
    ),
});

type FormValues = z.infer<typeof formSchema>;

export function DesignForm({ mode = { kind: "create" } }: { mode?: Mode }) {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.designs.generateUploadUrl);
  const createDesign = useMutation(api.designs.createDesign);
  const updateDesign = useMutation(api.designs.updateDesign);

  const existingFileCount =
    mode.kind === "edit" ? mode.existingFileCount : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues:
      mode.kind === "edit"
        ? {
            title: mode.initialTitle,
            brief: mode.initialBrief,
            canvaLink: mode.initialCanvaLink,
            jerseyStyle: mode.initialJerseyStyle,
            neckline: mode.initialNeckline,
            sleeveStyle: mode.initialSleeveStyle,
            fileCount: mode.existingFileCount,
          }
        : {
            title: "",
            brief: "",
            canvaLink: "",
            jerseyStyle: "",
            neckline: "",
            sleeveStyle: "",
            fileCount: 0,
          },
  });

  // Pending uploads stay in local state — each entry has live upload
  // status (pending/uploading/done/failed) that RHF doesn't need to know
  // about. fileCount is mirrored into the form below so validation and
  // FormMessage rendering work the same as every other field.
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachedCount = existingFileCount + pending.length;

  useEffect(() => {
    form.setValue("fileCount", attachedCount, {
      shouldValidate: form.formState.isSubmitted,
    });
  }, [attachedCount, form]);

  function onFilesPicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const added: PendingUpload[] = Array.from(picked).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      status: "pending",
    }));
    setPending((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  async function uploadOne(item: PendingUpload): Promise<Id<"_storage">> {
    setPending((prev) =>
      prev.map((p) =>
        p.id === item.id ? { ...p, status: "uploading", error: undefined } : p,
      ),
    );
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": item.file.type || "application/octet-stream",
        },
        body: item.file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as {
        storageId: Id<"_storage">;
      };
      setPending((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, status: "done", storageId } : p,
        ),
      );
      return storageId;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      setPending((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, status: "failed", error: message } : p,
        ),
      );
      throw err;
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);

    // Upload pending files sequentially so the UI progress list reads
    // top-to-bottom. Already-uploaded items (e.g. from a retry) are
    // reused via their stored storageId. Each upload is sent with the
    // filename and content type the browser knows — the server records them
    // as the asset's metadata (D-01), so a design page can tell a PNG from
    // a print template.
    const files: UploadedFile[] = [];
    try {
      for (const item of pending) {
        const storageId =
          item.status === "done" && item.storageId
            ? item.storageId
            : await uploadOne(item);
        files.push({
          storageId,
          filename: item.file.name,
          contentType: item.file.type || "application/octet-stream",
        });
      }
    } catch {
      const message = "One or more files failed to upload. Try again.";
      setSubmitError(message);
      toast.error("Upload failed", { description: message });
      return;
    }

    try {
      const payload = toDesignPayload({
        title: values.title,
        brief: values.brief,
        canvaLink: values.canvaLink,
        jerseyStyle: values.jerseyStyle,
        neckline: values.neckline,
        sleeveStyle: values.sleeveStyle,
        fileCount: values.fileCount,
      });
      if (mode.kind === "edit") {
        await updateDesign({
          designId: mode.designId,
          title: payload.title,
          brief: payload.brief,
          canvaLink: payload.canvaLink,
          jerseyStyle: payload.jerseyStyle,
          neckline: payload.neckline,
          sleeveStyle: payload.sleeveStyle,
          addFiles: files,
        });
        toast.success("Design updated");
        router.push(`/portal/designs/${mode.designId}`);
      } else {
        const designId = await createDesign({
          title: payload.title,
          brief: payload.brief,
          canvaLink: payload.canvaLink,
          jerseyStyle: payload.jerseyStyle,
          neckline: payload.neckline,
          sleeveStyle: payload.sleeveStyle,
          files,
        });
        toast.success("Design saved", {
          description: "Sidestep will see it next time they review your account.",
        });
        router.push(`/portal/designs/${designId}`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong saving your design.";
      setSubmitError(message);
      toast.error("Could not save your design", { description: message });
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const submitLabel =
    isSubmitting
      ? "Saving…"
      : mode.kind === "edit"
        ? "Save changes"
        : "Save design";
  const fileError = form.formState.errors.fileCount?.message;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="space-y-10"
        aria-busy={isSubmitting}
      >
        <FieldSection
          eyebrow="01"
          title="About this design"
          description="A clear title and brief make it easier for Sidestep to nail your vibe on the first pass."
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Spring 2026 jerseys"
                    maxLength={TITLE_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brief"
            render={({ field }) => {
              const remaining = BRIEF_MAX_LENGTH - field.value.length;
              return (
                <FormItem>
                  <FormLabel>Brief</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Theme, colors, references, anything we should know."
                      maxLength={BRIEF_MAX_LENGTH}
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between">
                    <FormMessage />
                    <p className="ml-auto text-[0.75rem] text-muted-foreground">
                      {remaining} characters left
                    </p>
                  </div>
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="canvaLink"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Canva share link</FormLabel>
                <FormDescription>
                  Optional — we&apos;ll open it in a new tab when we review.
                </FormDescription>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://www.canva.com/design/…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSection>

        <FieldSection
          eyebrow="02"
          title="The cut"
          description="The silhouette this artwork lives on. Optional — leave these blank if you haven't decided yet, and Sidestep will help you choose."
        >
          <FormField
            control={form.control}
            name="jerseyStyle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jersey style</FormLabel>
                <FormDescription>
                  Optional — e.g. &ldquo;Soccer jersey&rdquo; or &ldquo;Hockey
                  jersey&rdquo;.
                </FormDescription>
                <FormControl>
                  <Input
                    placeholder="Soccer jersey"
                    maxLength={JERSEY_STYLE_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="neckline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Neckline</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a neckline…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NECKLINES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sleeveStyle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sleeve style</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a sleeve style…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SLEEVE_STYLES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FieldSection>

        <FieldSection
          eyebrow="03"
          title="Files"
          description="Logos, mood boards, reference photos, sketches — any file type works."
        >
          {mode.kind === "edit" && existingFileCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {existingFileCount} file{existingFileCount === 1 ? "" : "s"} already
              attached. Add more below.
            </p>
          )}

          <FileDropzone
            inputRef={fileInputRef}
            onPicked={onFilesPicked}
            disabled={isSubmitting}
            error={fileError}
            attachedCount={attachedCount}
          />

          {pending.length > 0 && (
            <ul className="space-y-2" aria-label="Files to upload">
              {pending.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(item.file.size)} ·{" "}
                      <UploadStatusLabel status={item.status} error={item.error} />
                    </p>
                  </div>
                  {item.status !== "uploading" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePending(item.id)}
                      disabled={isSubmitting}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </FieldSection>

        <Separator />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Your design saves to your portal — Sidestep will see it next time
            they review your account.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </div>

        {submitError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        )}
      </form>
    </Form>
  );
}

function UploadStatusLabel({
  status,
  error,
}: {
  status: UploadStatus;
  error?: string;
}) {
  switch (status) {
    case "pending":
      return <span className="text-muted-foreground">Ready to upload</span>;
    case "uploading":
      return <span className="text-primary">Uploading…</span>;
    case "done":
      return <span className="text-emerald-700 dark:text-emerald-400">Uploaded</span>;
    case "failed":
      return (
        <span className="text-destructive">{error ?? "Upload failed"}</span>
      );
  }
}

function FileDropzone({
  inputRef,
  onPicked,
  disabled,
  error,
  attachedCount,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPicked: (files: FileList | null) => void;
  disabled: boolean;
  error?: string;
  attachedCount: number;
}) {
  const id = useId();
  const errorId = `${id}-err`;
  return (
    <div>
      <label
        htmlFor={id}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition ${
          error
            ? "border-destructive hover:border-destructive"
            : "border-border hover:border-ring"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <UploadCloudIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">
          Click to choose files or drop them here
        </span>
        <span className="text-xs text-muted-foreground">
          Any file type.{" "}
          {attachedCount > 0
            ? `${attachedCount} attached.`
            : "Add at least one."}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => onPicked(e.target.files)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-[0.8rem] font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FieldSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 md:grid-cols-[200px_1fr]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Step {eyebrow}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
