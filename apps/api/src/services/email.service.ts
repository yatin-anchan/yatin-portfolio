
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../config/env.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    throw new Error('SMTP email configuration is incomplete.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? {
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            },
          }
        : {}),
    });
  }

  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<void> {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
}

export async function verifyEmailTransport(): Promise<boolean> {
  const mailer = getTransporter();

  await mailer.verify();

  return true;
}
