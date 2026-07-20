import { describe, expect, it, vi } from "vitest";
import {
  isSelfRegistration,
  notifyNewRegistration,
  registrationNotificationRecipient,
  renderRegistrationEmail,
  type ClerkRegistrationData,
} from "./registrationNotification";

function userData(
  overrides: Partial<ClerkRegistrationData> = {},
): ClerkRegistrationData {
  return {
    id: "user_123",
    email_addresses: [
      { email_address: "captain@example.com", primary: true },
    ],
    first_name: "Alex",
    last_name: "Chen",
    ...overrides,
  };
}

describe("isSelfRegistration", () => {
  it("returns true when no invite metadata is present", () => {
    expect(isSelfRegistration(userData())).toBe(true);
  });

  it("returns false when the sign-up carried the invite flag in unsafe metadata", () => {
    expect(
      isSelfRegistration(
        userData({ unsafe_metadata: { registeredViaInvite: true } }),
      ),
    ).toBe(false);
  });

  it("returns false when the invite flag was promoted to public metadata", () => {
    expect(
      isSelfRegistration(
        userData({ public_metadata: { registeredViaInvite: true } }),
      ),
    ).toBe(false);
  });

  it("ignores a falsy invite flag", () => {
    expect(
      isSelfRegistration(
        userData({ unsafe_metadata: { registeredViaInvite: false } }),
      ),
    ).toBe(true);
  });
});

describe("renderRegistrationEmail", () => {
  it("includes the captain name and email in subject and body", () => {
    const email = renderRegistrationEmail({
      name: "Alex Chen",
      email: "captain@example.com",
    });

    expect(email.subject).toContain("Alex Chen");
    expect(email.text).toContain("Alex Chen");
    expect(email.text).toContain("captain@example.com");
    expect(email.html).toContain("Alex Chen");
    expect(email.html).toContain("captain@example.com");
  });

  it("falls back to the email address when no name was provided", () => {
    const email = renderRegistrationEmail({
      name: "",
      email: "captain@example.com",
    });

    expect(email.subject).toContain("captain@example.com");
    expect(email.text).not.toContain("undefined");
  });

  it("escapes HTML in the captain name", () => {
    const email = renderRegistrationEmail({
      name: "<script>alert(1)</script>",
      email: "captain@example.com",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("notifyNewRegistration", () => {
  it("sends to the ops inbox for a self-registration", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await notifyNewRegistration(userData(), { send });

    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("info@sidestep.design");
    expect(message.from).toBe("noreply@sidestep.design");
    expect(message.text).toContain("Alex Chen");
    expect(message.text).toContain("captain@example.com");
  });

  it("does not send when the registration came from an invite link", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await notifyNewRegistration(
      userData({ unsafe_metadata: { registeredViaInvite: true } }),
      { send },
    );

    expect(result).toBe("skipped-invite");
    expect(send).not.toHaveBeenCalled();
  });

  it("skips gracefully when no sender is configured", async () => {
    const result = await notifyNewRegistration(userData(), { send: null });

    expect(result).toBe("skipped-unconfigured");
  });

  it("swallows sender failures so the webhook still succeeds", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend is down"));
    const onError = vi.fn();

    const result = await notifyNewRegistration(userData(), { send, onError });

    expect(result).toBe("failed");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("uses the primary email address when several are present", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyNewRegistration(
      userData({
        email_addresses: [
          { email_address: "old@example.com", primary: false },
          { email_address: "primary@example.com", primary: true },
        ],
      }),
      { send },
    );

    expect(send.mock.calls[0][0].text).toContain("primary@example.com");
  });

  it("does not send when the user has no email address to report", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await notifyNewRegistration(
      userData({ email_addresses: [] }),
      { send },
    );

    expect(result).toBe("skipped-no-email");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("registrationNotificationRecipient", () => {
  it("prefers the configured ops inbox override", () => {
    expect(
      registrationNotificationRecipient({
        SIDESTEP_NOTIFY_EMAIL: "ops@example.com",
      }),
    ).toBe("ops@example.com");
  });

  it("falls back to the Sidestep ops inbox", () => {
    expect(registrationNotificationRecipient({})).toBe("info@sidestep.design");
  });
});
