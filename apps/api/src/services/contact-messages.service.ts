import {
  db,
  contactMessages,
} from '@yatin-portfolio/database';

export interface CreateContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface ContactMessageMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export async function insertContactMessage(
  input: CreateContactMessageInput,
  metadata: ContactMessageMetadata,
) {
  const [createdMessage] = await db
    .insert(contactMessages)
    .values({
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    })
    .returning({
      id: contactMessages.id,
      createdAt: contactMessages.createdAt,
    });

  return createdMessage;
}