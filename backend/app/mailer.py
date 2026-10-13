"""Outgoing email over SMTP (Gmail app passwords, Brevo, Resend, or any SMTP provider)."""
import smtplib
import ssl
from email.message import EmailMessage
from .config import get_settings


def send_email(to: str, subject: str, text: str):
    settings = get_settings()
    message = EmailMessage()
    message['From'] = settings.email_from or settings.smtp_username
    message['To'] = to
    message['Subject'] = subject
    message.set_content(text)
    context = ssl.create_default_context()
    # Port 465 uses implicit TLS; other ports upgrade the connection with STARTTLS.
    if settings.smtp_port == 465:
        smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=10)
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
    with smtp:
        if settings.smtp_port != 465:
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
